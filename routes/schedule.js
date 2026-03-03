const express = require('express');
const mongoose = require('mongoose');

const Assignment = require('../models/assignment');
const AvailabilityBlock = require('../models/availabilityBlock');
const Event = require('../models/event');
const EventInstance = require('../models/eventinstance');
const EventScheduleTemplate = require('../models/eventScheduleTemplate');
const Ministry = require('../models/ministry');
const Schedule = require('../models/schedule');
const ScheduleRole = require('../models/scheduleRole');
const User = require('../models/user');
const { sendPushNotification } = require('../common/notification.service');
const { getMonthBoundaries, parseChurchDate } = require('../common/timezone.helper');
const { 
  requireSuperOrAdminOrMinistryLeader, 
  requireSuperOrAdminOrResourceMinistryLeader,
  requireMinistryAccess 
} = require('../middlewares/permissions');

const { validateScheduleRole, validateScheduleAssignment, validateScheduleTemplate, validateAutoSchedule, validateAvailabilityBlock, validateAssignmentResponse } = require('../middlewares/validators');

const router = express.Router();
router.use(express.json());

const asObjectId = (id) => new mongoose.Types.ObjectId(id);

async function getCurrentUser(req) {
  const firebaseUid = req.user?.uid;
  if (!firebaseUid) {
    return null;
  }
  return User.findOne({ firebaseId: firebaseUid }).lean();
}

async function ensureLeader(ministryId, currentUserId, churchId) {
  const ministry = await Ministry.findOne({
    _id: ministryId,
    church: churchId
  }).lean();

  if (!ministry) {
    return { ok: false, code: 404, message: 'Ministry not found for this church.' };
  }

  if (!ministry.leaderId || String(ministry.leaderId) !== String(currentUserId)) {
    return { ok: false, code: 403, message: 'Only the ministry leader can manage schedules for this ministry.' };
  }

  return { ok: true, ministry };
}

async function ensureApprovedMember(ministryId, userId, roleId) {
  const assignment = await Assignment.findOne({
    ministryId,
    userId,
    scheduleRoleId: roleId,
    status: 'approved'
  }).lean();

  if (!assignment) {
    return { ok: false, code: 400, message: 'Selected user does not have an approved assignment for this ministry role.' };
  }

  return { ok: true };
}

async function notifyUserOnAssignment({ assignedUser, roleName, eventTitle, eventDate, ministryName, eventInstanceId, ministryId, roleId }) {
  if (!assignedUser?.pushToken || assignedUser.muteNotifications) {
    return;
  }

  const dateLabel = new Date(eventDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  await sendPushNotification(
    [assignedUser.pushToken],
    {
      subject: 'New ministry assignment',
      body: `You are assigned as ${roleName} for ${ministryName} on ${eventTitle} (${dateLabel}).`,
      data: {
        type: 'schedule_assignment',
        eventInstanceId: String(eventInstanceId),
        ministryId: String(ministryId),
        roleId: String(roleId)
      }
    },
    true
  );
}

function findNextAvailableSlot(requiredCount, occupiedSlots) {
  for (let slot = 1; slot <= requiredCount; slot++) {
    if (!occupiedSlots.has(slot)) {
      return slot;
    }
  }
  return null;
}

function aggregateEventTemplateRows(templates = []) {
  const ministryMap = new Map();
  let totalRequiredPeople = 0;

  templates.forEach((entry) => {
    const ministry = entry.ministryId || {};
    const role = entry.roleId || {};
    const ministryKey = String(ministry._id || entry.ministryId);

    if (!ministryMap.has(ministryKey)) {
      ministryMap.set(ministryKey, {
        ministryId: ministry._id || entry.ministryId,
        ministryName: ministry.name || null,
        leaderId: ministry.leaderId || null,
        roles: [],
        totalRequiredPeople: 0
      });
    }

    const bucket = ministryMap.get(ministryKey);
    const requiredCount = Number(entry.requiredCount) || 0;

    bucket.roles.push({
      templateId: entry._id,
      roleId: role._id || entry.roleId,
      roleName: role.name || null,
      roleDescription: role.description || null,
      requiredCount
    });
    bucket.totalRequiredPeople += requiredCount;
    totalRequiredPeople += requiredCount;
  });

  const ministries = Array.from(ministryMap.values());
  return {
    ministries,
    totals: {
      ministries: ministries.length,
      roles: templates.length,
      requiredPeople: totalRequiredPeople
    }
  };
}

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Create or upsert event-level staffing template'
#swagger.description = 'Defines how many people are required per ministry role for a base Event (not EventInstance).'
#swagger.parameters['body'] = {
  in: 'body',
  required: true,
  schema: {
    eventId: '65f0f9a16c2f65c9d2ab1201',
    ministryId: '65f0f9a16c2f65c9d2ab2201',
    roleId: '65f0f9a16c2f65c9d2ab3201',
    requiredCount: 2
  }
}
*/
router.post('/templates/create', requireSuperOrAdminOrMinistryLeader, validateScheduleTemplate(), async (req, res) => {
  try {
    const church = req.church;
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unable to resolve authenticated user profile.' });
    }

    const { eventId, ministryId, roleId, requiredCount } = req.body;
    const authResult = await ensureLeader(ministryId, currentUser._id, church._id);
    if (!authResult.ok) {
      return res.status(authResult.code).json({ message: authResult.message });
    }

    const [event, role] = await Promise.all([
      Event.findOne({ _id: eventId, church: church._id }).lean(),
      ScheduleRole.findOne({ _id: roleId, church: church._id, ministryId }).lean()
    ]);

    if (!event) {
      return res.status(404).json({ message: 'Event not found for this church.' });
    }

    if (!role) {
      return res.status(404).json({ message: 'Role not found for this ministry.' });
    }

    const template = await EventScheduleTemplate.findOneAndUpdate(
      { church: church._id, eventId, ministryId, roleId },
      {
        $set: {
          church: church._id,
          eventId,
          ministryId,
          roleId,
          requiredCount,
          createdBy: currentUser._id
        }
      },
      { upsert: true, new: true, runValidators: true }
    );

    return res.status(201).json({ message: 'Event schedule template saved successfully.', template });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Template already exists for this event, ministry, and role.' });
    }
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'List templates for a base event'
#swagger.description = 'Returns all ministry-role staffing templates configured at Event level.'
*/
router.get('/templates/event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: 'Invalid event ID.' });
    }

    const templates = await EventScheduleTemplate.find({
      church: req.church._id,
      eventId
    })
      .populate('ministryId', 'name leaderId')
      .populate('roleId', 'name description')
      .sort({ createdAt: 1 })
      .lean();

    if (req.query.aggregate === 'true') {
      return res.json({
        eventId,
        ...aggregateEventTemplateRows(templates)
      });
    }

    return res.json({ templates });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Get event template as aggregate ministries/roles'
#swagger.description = 'Returns event-level staffing template grouped by ministry with roles and counts.'
*/
router.get('/templates/event/:eventId/aggregate', async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: 'Invalid event ID.' });
    }

    const templates = await EventScheduleTemplate.find({
      church: req.church._id,
      eventId
    })
      .populate('ministryId', 'name leaderId')
      .populate('roleId', 'name description')
      .sort({ createdAt: 1 })
      .lean();

    return res.json({
      eventId,
      ...aggregateEventTemplateRows(templates)
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Resolve templates by event instance'
#swagger.description = 'Finds EventInstance, resolves its parent eventId, and returns all staffing templates for that Event.'
*/
router.get('/templates/event-instance/:eventInstanceId', async (req, res) => {
  try {
    const { eventInstanceId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventInstanceId)) {
      return res.status(400).json({ message: 'Invalid event instance ID.' });
    }

    const eventInstance = await EventInstance.findOne({ _id: eventInstanceId, church: req.church._id })
      .select('eventId title date')
      .lean();

    if (!eventInstance) {
      return res.status(404).json({ message: 'Event instance not found for this church.' });
    }

    const templates = await EventScheduleTemplate.find({
      church: req.church._id,
      eventId: eventInstance.eventId
    })
      .populate('ministryId', 'name leaderId')
      .populate('roleId', 'name description')
      .sort({ createdAt: 1 })
      .lean();

    if (req.query.aggregate === 'true') {
      return res.json({
        eventInstance: {
          _id: eventInstance._id,
          eventId: eventInstance.eventId,
          title: eventInstance.title,
          date: eventInstance.date
        },
        ...aggregateEventTemplateRows(templates)
      });
    }

    return res.json({
      eventInstance: {
        _id: eventInstance._id,
        eventId: eventInstance.eventId,
        title: eventInstance.title,
        date: eventInstance.date
      },
      templates
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Update event-level staffing template'
*/
router.patch('/templates/update/:id', requireSuperOrAdminOrResourceMinistryLeader(EventScheduleTemplate, 'id'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid template ID.' });
    }

    const template = await EventScheduleTemplate.findOne({ _id: id, church: req.church._id });
    if (!template) {
      return res.status(404).json({ message: 'Template not found.' });
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unable to resolve authenticated user profile.' });
    }

    const authResult = await ensureLeader(template.ministryId, currentUser._id, req.church._id);
    if (!authResult.ok) {
      return res.status(authResult.code).json({ message: authResult.message });
    }

    if (req.body.requiredCount !== undefined) {
      const count = Number(req.body.requiredCount);
      if (!Number.isInteger(count) || count < 1) {
        return res.status(400).json({ message: 'requiredCount must be an integer greater than zero.' });
      }

      const inUseSlots = await Schedule.countDocuments({
        templateId: template._id,
        eventInstanceId: { $exists: true },
        status: { $ne: 'cancelled' }
      });

      if (count < inUseSlots) {
        return res.status(409).json({ message: `Cannot set requiredCount below active assigned slots (${inUseSlots}).` });
      }
      template.requiredCount = count;
    }

    await template.save();
    return res.json({ message: 'Template updated successfully.', template });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Delete event-level staffing template'
*/
router.delete('/templates/delete/:id', requireSuperOrAdminOrResourceMinistryLeader(EventScheduleTemplate, 'id'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid template ID.' });
    }

    const template = await EventScheduleTemplate.findOne({ _id: id, church: req.church._id }).lean();
    if (!template) {
      return res.status(404).json({ message: 'Template not found.' });
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unable to resolve authenticated user profile.' });
    }

    const authResult = await ensureLeader(template.ministryId, currentUser._id, req.church._id);
    if (!authResult.ok) {
      return res.status(authResult.code).json({ message: authResult.message });
    }

    const hasSchedules = await Schedule.exists({ templateId: template._id, status: { $ne: 'cancelled' } });
    if (hasSchedules) {
      return res.status(409).json({ message: 'Template has active schedules. Cancel or remove them before deleting.' });
    }

    await EventScheduleTemplate.findByIdAndDelete(template._id);
    return res.json({ message: 'Template deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Create ministry role definition'
#swagger.description = 'Creates a reusable role (e.g., Lead Singer, Pianist) for a ministry.'
*/
router.post('/roles/create', requireSuperOrAdminOrMinistryLeader, validateScheduleRole(), async (req, res) => {
  try {
    const church = req.church;
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unable to resolve authenticated user profile.' });
    }

    const { ministryId, name, description } = req.body;
    const authResult = await ensureLeader(ministryId, currentUser._id, church._id);
    if (!authResult.ok) {
      return res.status(authResult.code).json({ message: authResult.message });
    }

    const role = await ScheduleRole.create({
      church: church._id,
      ministryId,
      name,
      description,
      createdBy: currentUser._id
    });

    return res.status(201).json({ message: 'Schedule role created successfully.', role });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This role already exists for the ministry.' });
    }
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'List roles for ministry'
*/
router.get('/roles/list/:ministryId', requireMinistryAccess, async (req, res) => {
  try {
    const { ministryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(ministryId)) {
      return res.status(400).json({ message: 'Invalid ministry ID.' });
    }

    const includeInactive = req.query.includeInactive === 'true';
    const filter = {
      church: req.church._id,
      ministryId: asObjectId(ministryId)
    };

    if (!includeInactive) {
      filter.isActive = true;
    }

    const roles = await ScheduleRole.find(filter)
      .select('name description isActive createdAt updatedAt')
      .sort({ name: 1 })
      .lean();

    return res.json({ roles });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Update ministry role definition'
*/
router.patch('/roles/update/:id', requireSuperOrAdminOrResourceMinistryLeader(ScheduleRole, 'id'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid role ID.' });
    }

    const role = await ScheduleRole.findOne({ _id: id, church: req.church._id });
    if (!role) {
      return res.status(404).json({ message: 'Schedule role not found.' });
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unable to resolve authenticated user profile.' });
    }

    const authResult = await ensureLeader(role.ministryId, currentUser._id, req.church._id);
    if (!authResult.ok) {
      return res.status(authResult.code).json({ message: authResult.message });
    }

    const allowed = ['name', 'description', 'isActive'];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        role[field] = req.body[field];
      }
    });

    await role.save();
    return res.json({ message: 'Schedule role updated successfully.', role });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A role with this name already exists in the ministry.' });
    }
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Delete ministry role definition'
*/
router.delete('/roles/delete/:id', requireSuperOrAdminOrResourceMinistryLeader(ScheduleRole, 'id'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid role ID.' });
    }

    const role = await ScheduleRole.findOne({ _id: id, church: req.church._id }).lean();
    if (!role) {
      return res.status(404).json({ message: 'Schedule role not found.' });
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unable to resolve authenticated user profile.' });
    }

    const authResult = await ensureLeader(role.ministryId, currentUser._id, req.church._id);
    if (!authResult.ok) {
      return res.status(authResult.code).json({ message: authResult.message });
    }

    const hasSchedules = await Schedule.exists({ roleId: role._id });
    if (hasSchedules) {
      return res.status(409).json({ message: 'Role has existing schedules. Deactivate it instead of deleting.' });
    }

    await ScheduleRole.findByIdAndDelete(role._id);
    return res.json({ message: 'Schedule role deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Assign member to an event-instance role slot'
#swagger.description = 'Creates assignment against EventInstance while enforcing Event-level template requiredCount and available slot.'
#swagger.parameters['body'] = {
  in: 'body',
  required: true,
  schema: {
    ministryId: '65f0f9a16c2f65c9d2ab2201',
    eventInstanceId: '65f0f9a16c2f65c9d2ab4201',
    roleId: '65f0f9a16c2f65c9d2ab3201',
    userId: '65f0f9a16c2f65c9d2ab5201',
    slotNumber: 1,
    taskNotes: 'Arrive by 8:00 AM',
    status: 'planned'
  }
}
*/
router.post('/create', requireSuperOrAdminOrMinistryLeader, validateScheduleAssignment(), async (req, res) => {
  try {
    const church = req.church;
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unable to resolve authenticated user profile.' });
    }

    const { ministryId, eventInstanceId, roleId, userId, taskNotes, status, slotNumber } = req.body;

    const authResult = await ensureLeader(ministryId, currentUser._id, church._id);
    if (!authResult.ok) {
      return res.status(authResult.code).json({ message: authResult.message });
    }

    const [eventInstance, role, memberResult] = await Promise.all([
      EventInstance.findOne({ _id: eventInstanceId, church: church._id }).lean(),
      ScheduleRole.findOne({ _id: roleId, church: church._id, ministryId, isActive: true }).lean(),
      ensureApprovedMember(ministryId, userId, roleId)
    ]);

    if (!eventInstance) {
      return res.status(404).json({ message: 'Event instance not found for this church.' });
    }

    if (!role) {
      return res.status(404).json({ message: 'Active schedule role not found for this ministry.' });
    }

    if (!memberResult.ok) {
      return res.status(memberResult.code).json({ message: memberResult.message });
    }

    const template = await EventScheduleTemplate.findOne({
      church: church._id,
      eventId: eventInstance.eventId,
      ministryId,
      roleId
    }).lean();

    if (!template) {
      return res.status(404).json({ message: 'No event template exists for this ministry role on the base event.' });
    }

    const activeSchedules = await Schedule.find({
      church: church._id,
      eventInstanceId,
      ministryId,
      roleId,
      status: { $ne: 'cancelled' }
    }).select('slotNumber').lean();

    const occupiedSlots = new Set(activeSchedules.map((s) => s.slotNumber));
    let resolvedSlot = null;

    if (slotNumber !== undefined) {
      const parsedSlot = Number(slotNumber);
      if (!Number.isInteger(parsedSlot) || parsedSlot < 1) {
        return res.status(400).json({ message: 'slotNumber must be a positive integer.' });
      }
      if (parsedSlot > template.requiredCount) {
        return res.status(409).json({ message: `slotNumber ${parsedSlot} exceeds template requiredCount (${template.requiredCount}).` });
      }
      if (occupiedSlots.has(parsedSlot)) {
        return res.status(409).json({ message: `slotNumber ${parsedSlot} is already assigned.` });
      }
      resolvedSlot = parsedSlot;
    } else {
      resolvedSlot = findNextAvailableSlot(template.requiredCount, occupiedSlots);
      if (!resolvedSlot) {
        return res.status(409).json({ message: 'All required slots for this role are already filled.' });
      }
    }

    const schedule = await Schedule.create({
      church: church._id,
      ministryId,
      eventInstanceId,
      templateId: template._id,
      roleId,
      slotNumber: resolvedSlot,
      userId,
      taskNotes: taskNotes || '',
      status: status || 'planned',
      scheduleDate: eventInstance.date,
      assignedBy: currentUser._id,
      assignedAt: new Date()
    });

    const [assignedUser, ministry] = await Promise.all([
      User.findById(userId).select('pushToken muteNotifications').lean(),
      Ministry.findById(ministryId).select('name').lean()
    ]);

    await notifyUserOnAssignment({
      assignedUser,
      roleName: role.name,
      eventTitle: eventInstance.title,
      eventDate: eventInstance.date,
      ministryName: ministry?.name || 'Ministry',
      eventInstanceId,
      ministryId,
      roleId
    });

    return res.status(201).json({
      message: 'Schedule saved successfully.',
      schedule
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Update a schedule assignment'
*/
router.patch('/update/:id', requireSuperOrAdminOrResourceMinistryLeader(Schedule, 'id'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid schedule ID.' });
    }

    const schedule = await Schedule.findOne({ _id: id, church: req.church._id });
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found.' });
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unable to resolve authenticated user profile.' });
    }

    const authResult = await ensureLeader(schedule.ministryId, currentUser._id, req.church._id);
    if (!authResult.ok) {
      return res.status(authResult.code).json({ message: authResult.message });
    }

    const previousUserId = String(schedule.userId);
    let notifyNewUser = false;

    if (req.body.userId && String(req.body.userId) !== String(schedule.userId)) {
      const memberResult = await ensureApprovedMember(schedule.ministryId, req.body.userId, schedule.roleId);
      if (!memberResult.ok) {
        return res.status(memberResult.code).json({ message: memberResult.message });
      }
      schedule.userId = req.body.userId;
      notifyNewUser = true;
    }

    if (req.body.roleId && String(req.body.roleId) !== String(schedule.roleId)) {
      const role = await ScheduleRole.findOne({
        _id: req.body.roleId,
        church: req.church._id,
        ministryId: schedule.ministryId,
        isActive: true
      }).lean();

      if (!role) {
        return res.status(404).json({ message: 'Selected role is invalid or inactive.' });
      }

      schedule.roleId = req.body.roleId;
      notifyNewUser = true;
    }

    if (req.body.userId !== undefined || req.body.roleId !== undefined) {
      const memberResult = await ensureApprovedMember(schedule.ministryId, schedule.userId, schedule.roleId);
      if (!memberResult.ok) {
        return res.status(memberResult.code).json({ message: memberResult.message });
      }
    }

    if (req.body.slotNumber !== undefined) {
      const requestedSlot = Number(req.body.slotNumber);
      if (!Number.isInteger(requestedSlot) || requestedSlot < 1) {
        return res.status(400).json({ message: 'slotNumber must be a positive integer.' });
      }

      const template = await EventScheduleTemplate.findById(schedule.templateId).lean();
      if (!template) {
        return res.status(404).json({ message: 'Schedule template not found.' });
      }

      if (requestedSlot > template.requiredCount) {
        return res.status(409).json({ message: `slotNumber ${requestedSlot} exceeds template requiredCount (${template.requiredCount}).` });
      }

      const slotTaken = await Schedule.exists({
        _id: { $ne: schedule._id },
        eventInstanceId: schedule.eventInstanceId,
        ministryId: schedule.ministryId,
        roleId: schedule.roleId,
        slotNumber: requestedSlot,
        status: { $ne: 'cancelled' }
      });

      if (slotTaken) {
        return res.status(409).json({ message: `slotNumber ${requestedSlot} is already assigned.` });
      }

      schedule.slotNumber = requestedSlot;
    }

    if (req.body.taskNotes !== undefined) {
      schedule.taskNotes = req.body.taskNotes;
    }

    if (req.body.status !== undefined) {
      const validStatuses = ['planned', 'confirmed', 'completed', 'cancelled'];
      if (!validStatuses.includes(req.body.status)) {
        return res.status(400).json({ message: 'Invalid schedule status.' });
      }
      schedule.status = req.body.status;
    }

    schedule.assignedBy = currentUser._id;
    schedule.assignedAt = new Date();

    await schedule.save();

    if (notifyNewUser || String(schedule.userId) !== previousUserId) {
      const [updatedUser, role, eventInstance, ministry] = await Promise.all([
        User.findById(schedule.userId).select('pushToken muteNotifications').lean(),
        ScheduleRole.findById(schedule.roleId).select('name').lean(),
        EventInstance.findById(schedule.eventInstanceId).select('title date').lean(),
        Ministry.findById(schedule.ministryId).select('name').lean()
      ]);

      await notifyUserOnAssignment({
        assignedUser: updatedUser,
        roleName: role?.name || 'Role',
        eventTitle: eventInstance?.title || 'Event',
        eventDate: eventInstance?.date || schedule.scheduleDate,
        ministryName: ministry?.name || 'Ministry',
        eventInstanceId: schedule.eventInstanceId,
        ministryId: schedule.ministryId,
        roleId: schedule.roleId
      });
    }

    return res.json({ message: 'Schedule updated successfully.', schedule });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Another assignment already exists for this event role.' });
    }
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'List schedules for an event instance and ministry'
*/
router.get('/event-instance/:eventInstanceId/:ministryId', requireMinistryAccess, async (req, res) => {
  try {
    const { eventInstanceId, ministryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventInstanceId) || !mongoose.Types.ObjectId.isValid(ministryId)) {
      return res.status(400).json({ message: 'Invalid event instance or ministry ID.' });
    }

    const schedules = await Schedule.find({
      church: req.church._id,
      eventInstanceId,
      ministryId
    })
      .populate({
        path: 'eventInstanceId',
        select: 'title date startTime endTime location eventId',
        populate: {
          path: 'eventId',
          select: 'name type'
        }
      })
      .populate('roleId', 'name description')
      .populate('templateId', 'requiredCount')
      .populate('userId', 'firstName lastName emailAddress phoneNumber')
      .sort({ slotNumber: 1, createdAt: 1 })
      .lean();

    return res.json({ schedules });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'List monthly schedule assignments for a ministry'
*/
router.get('/monthly', requireMinistryAccess, async (req, res) => {
  try {
    const { ministryId } = req.query;
    const month = Number(req.query.month);
    const year = Number(req.query.year);

    if (!mongoose.Types.ObjectId.isValid(ministryId)) {
      return res.status(400).json({ message: 'Invalid ministry ID.' });
    }

    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1900) {
      return res.status(400).json({ message: 'Provide valid month (1-12) and year.' });
    }

    // Get church timezone for proper month boundary calculation
    const timezone = req.church.timeZone || 'UTC';
    const { startDate, endDate } = getMonthBoundaries(year, month, timezone);

    const schedules = await Schedule.find({
      church: req.church._id,
      ministryId,
      scheduleDate: { $gte: startDate, $lt: endDate }
    })
      .populate({
        path: 'eventInstanceId',
        select: 'title date startTime endTime location eventId',
        populate: {
          path: 'eventId',
          select: 'name type'
        }
      })
      .populate('templateId', 'requiredCount')
      .populate('roleId', 'name')
      .populate('userId', 'firstName lastName')
      .sort({ scheduleDate: 1, slotNumber: 1, createdAt: 1 })
      .lean();

    return res.json({ schedules });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Delete a schedule assignment'
*/
router.delete('/delete/:id', requireSuperOrAdminOrResourceMinistryLeader(Schedule, 'id'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid schedule ID.' });
    }

    const schedule = await Schedule.findOne({ _id: id, church: req.church._id }).lean();
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found.' });
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unable to resolve authenticated user profile.' });
    }

    const authResult = await ensureLeader(schedule.ministryId, currentUser._id, req.church._id);
    if (!authResult.ok) {
      return res.status(authResult.code).json({ message: authResult.message });
    }

    await Schedule.findByIdAndDelete(schedule._id);
    return res.json({ message: 'Schedule deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['Schedule']
#swagger.summary = 'Auto-schedule a ministry for month/year'
#swagger.description = 'Automatically assigns approved ministry members to all event instances of a base event in a given month/year based on event templates.'
#swagger.parameters['body'] = {
  in: 'body',
  required: true,
  schema: {
    eventId: '65f0f9a16c2f65c9d2ab1201',
    ministryId: '65f0f9a16c2f65c9d2ab2201',
    month: 3,
    year: 2026,
    overwriteExisting: false,
    previewOnly: true
  }
}
*/
router.post('/auto-schedule', requireSuperOrAdminOrMinistryLeader, validateAutoSchedule(), async (req, res) => {
  try {
    const church = req.church;
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unable to resolve authenticated user profile.' });
    }

    const { eventId, ministryId, month, year, overwriteExisting = false, previewOnly = false } = req.body;
    const authResult = await ensureLeader(ministryId, currentUser._id, church._id);
    if (!authResult.ok) {
      return res.status(authResult.code).json({ message: authResult.message });
    }

    const event = await Event.findOne({ _id: eventId, church: church._id }).lean();
    if (!event) {
      return res.status(404).json({ message: 'Event not found for this church.' });
    }

    const templates = await EventScheduleTemplate.find({
      church: church._id,
      eventId,
      ministryId
    })
      .populate('roleId', 'name')
      .lean();

    if (!templates.length) {
      return res.status(404).json({ message: 'No templates found for this event and ministry.' });
    }

    // Get church timezone for proper month boundary calculation
    const timezone = church.timeZone || 'UTC';
    const { startDate, endDate } = getMonthBoundaries(Number(year), Number(month), timezone);

    const eventInstances = await EventInstance.find({
      church: church._id,
      eventId,
      date: { $gte: startDate, $lt: endDate }
    })
      .sort({ date: 1 })
      .lean();

    if (!eventInstances.length) {
      return res.status(200).json({
        message: 'No event instances found for the selected month/year.',
        summary: {
          createdCount: 0,
          unfilledSlots: 0,
          eventInstances: 0
        }
      });
    }

    const rolePool = {};
    for (const template of templates) {
      const roleIdKey = String(template.roleId._id || template.roleId);
      const assignments = await Assignment.find({
        ministryId,
        scheduleRoleId: roleIdKey,
        status: 'approved'
      })
        .select('userId dateAssigned')
        .sort({ dateAssigned: 1, _id: 1 })
        .lean();

      const uniqueUserIds = Array.from(new Set(assignments.map((entry) => String(entry.userId))));
      rolePool[roleIdKey] = {
        users: uniqueUserIds,
        pointer: 0,
        roleName: template.roleId?.name || 'Role'
      };
    }

    const created = [];
    const proposed = [];
    const unfilled = [];

    for (const instance of eventInstances) {
      for (const template of templates) {
        const roleId = String(template.roleId._id || template.roleId);
        const pool = rolePool[roleId];

        if (overwriteExisting && !previewOnly) {
          await Schedule.deleteMany({
            church: church._id,
            eventInstanceId: instance._id,
            ministryId,
            templateId: template._id
          });
        }

        const existingSchedules = await Schedule.find({
          church: church._id,
          eventInstanceId: instance._id,
          ministryId,
          templateId: template._id,
          status: { $ne: 'cancelled' }
        })
          .select('slotNumber userId')
          .lean();

        const occupiedSlots = new Set(existingSchedules.map((entry) => entry.slotNumber));
        const assignedUsersInRole = new Set(existingSchedules.map((entry) => String(entry.userId)));

        for (let slot = 1; slot <= template.requiredCount; slot++) {
          if (occupiedSlots.has(slot)) {
            continue;
          }

          if (!pool.users.length) {
            unfilled.push({
              eventInstanceId: instance._id,
              eventDate: instance.date,
              roleId,
              roleName: pool.roleName,
              slotNumber: slot,
              reason: 'No approved members for role'
            });
            continue;
          }

          let chosenUserId = null;
          for (let attempts = 0; attempts < pool.users.length; attempts++) {
            const candidateIndex = (pool.pointer + attempts) % pool.users.length;
            const candidateUserId = pool.users[candidateIndex];
            
            // Skip if user already assigned to this role for this instance
            if (assignedUsersInRole.has(candidateUserId)) {
              continue;
            }
            
            // Check for availability blocks
            const hasBlockConflict = await AvailabilityBlock.findOne({
              userId: candidateUserId,
              church: church._id,
              $or: [
                { ministryId: null }, // Global block
                { ministryId: ministryId } // Ministry-specific block
              ],
              startDate: { $lte: instance.date },
              endDate: { $gte: instance.date }
            }).lean();
            
            if (hasBlockConflict) {
              // Skip this candidate due to availability block
              continue;
            }
            
            chosenUserId = candidateUserId;
            pool.pointer = (candidateIndex + 1) % pool.users.length;
            break;
          }

          if (!chosenUserId) {
            unfilled.push({
              eventInstanceId: instance._id,
              eventDate: instance.date,
              roleId,
              roleName: pool.roleName,
              slotNumber: slot,
              reason: 'Not enough available members (considering availability blocks and slot constraints)'
            });
            continue;
          }

          const proposedEntry = {
            church: church._id,
            ministryId,
            eventInstanceId: instance._id,
            templateId: template._id,
            roleId,
            roleName: pool.roleName,
            slotNumber: slot,
            userId: chosenUserId,
            scheduleDate: instance.date,
            eventTitle: instance.title
          };

          if (previewOnly) {
            proposed.push(proposedEntry);
            assignedUsersInRole.add(String(chosenUserId));
            continue;
          }

          try {
            const schedule = await Schedule.create({
              church: proposedEntry.church,
              ministryId: proposedEntry.ministryId,
              eventInstanceId: proposedEntry.eventInstanceId,
              templateId: proposedEntry.templateId,
              roleId: proposedEntry.roleId,
              slotNumber: proposedEntry.slotNumber,
              userId: proposedEntry.userId,
              taskNotes: '',
              status: 'planned',
              scheduleDate: proposedEntry.scheduleDate,
              assignedBy: currentUser._id,
              assignedAt: new Date()
            });

            created.push(schedule);
            assignedUsersInRole.add(String(chosenUserId));

            const [assignedUser, ministry] = await Promise.all([
              User.findById(chosenUserId).select('pushToken muteNotifications').lean(),
              Ministry.findById(ministryId).select('name').lean()
            ]);

            await notifyUserOnAssignment({
              assignedUser,
              roleName: pool.roleName,
              eventTitle: instance.title,
              eventDate: instance.date,
              ministryName: ministry?.name || 'Ministry',
              eventInstanceId: instance._id,
              ministryId,
              roleId
            });
          } catch (error) {
            if (error.code === 11000) {
              unfilled.push({
                eventInstanceId: instance._id,
                eventDate: instance.date,
                roleId,
                roleName: pool.roleName,
                slotNumber: slot,
                reason: 'Duplicate constraint conflict during scheduling'
              });
              continue;
            }
            throw error;
          }
        }
      }
    }

    return res.status(201).json({
      message: previewOnly ? 'Auto scheduling preview generated.' : 'Auto scheduling completed.',
      summary: {
        previewOnly,
        createdCount: created.length,
        proposedCount: proposed.length,
        unfilledSlots: unfilled.length,
        eventInstances: eventInstances.length
      },
      unfilled,
      created,
      proposed
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /schedule/my-assignments:
 *   get:
 *     tags: [Schedule]
 *     summary: Get my monthly assignments
 *     description: Retrieve all assignments for the current user within a specified month and year
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         required: true
 *         description: Month (1-12)
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         required: true
 *         description: Year (e.g., 2026)
 *       - in: query
 *         name: ministryId
 *         schema:
 *           type: string
 *         description: Filter by ministry ID
 *       - in: query
 *         name: responseStatus
 *         schema:
 *           type: string
 *           enum: [pending, accepted, declined]
 *         description: Filter by response status
 *     responses:
 *       200:
 *         description: Monthly assignments retrieved successfully
 *       400:
 *         description: Invalid month or year
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/my-assignments', async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { month, year, ministryId, responseStatus } = req.query;

    // Validate month and year
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    if (!monthNum || !yearNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ message: 'Valid month (1-12) and year are required' });
    }

    // Build date range for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Build query
    const query = {
      church: currentUser.church,
      userId: currentUser._id,
      scheduleDate: { $gte: startDate, $lte: endDate }
    };

    if (ministryId) {
      query.ministryId = asObjectId(ministryId);
    }

    if (responseStatus) {
      query.responseStatus = responseStatus;
    }

    const assignments = await Schedule.find(query)
      .populate('ministryId', 'name description')
      .populate('roleId', 'name description')
      .populate('eventInstanceId')
      .populate('assignedBy', 'firstName lastName')
      .sort({ scheduleDate: 1 })
      .lean();

    // Populate event details
    const eventInstanceIds = assignments.map(a => a.eventInstanceId?._id).filter(Boolean);
    const eventInstances = await EventInstance.find({ _id: { $in: eventInstanceIds } })
      .populate('eventId', 'name type')
      .lean();

    const eventMap = {};
    eventInstances.forEach(ei => {
      eventMap[String(ei._id)] = ei;
    });

    // Enrich assignments with event data
    const enrichedAssignments = assignments.map(assignment => {
      const eventInstance = eventMap[String(assignment.eventInstanceId?._id)];
      return {
        _id: assignment._id,
        scheduleDate: assignment.scheduleDate,
        ministry: assignment.ministryId,
        role: assignment.roleId,
        event: eventInstance?.eventId,
        eventInstance: assignment.eventInstanceId,
        taskNotes: assignment.taskNotes,
        status: assignment.status,
        responseStatus: assignment.responseStatus,
        responseDate: assignment.responseDate,
        declineReason: assignment.declineReason,
        assignedBy: assignment.assignedBy,
        assignedAt: assignment.assignedAt,
        slotNumber: assignment.slotNumber
      };
    });

    // Get availability blocks for this period
    const availabilityBlocks = await AvailabilityBlock.find({
      church: currentUser.church,
      userId: currentUser._id,
      $or: [
        // Block starts within the month
        { startDate: { $gte: startDate, $lte: endDate } },
        // Block ends within the month
        { endDate: { $gte: startDate, $lte: endDate } },
        // Block spans the entire month
        { startDate: { $lte: startDate }, endDate: { $gte: endDate } }
      ]
    })
      .populate('ministryId', 'name')
      .sort({ startDate: 1 })
      .lean();

    return res.status(200).json({
      month: monthNum,
      year: yearNum,
      totalAssignments: enrichedAssignments.length,
      pending: enrichedAssignments.filter(a => a.responseStatus === 'pending').length,
      accepted: enrichedAssignments.filter(a => a.responseStatus === 'accepted').length,
      declined: enrichedAssignments.filter(a => a.responseStatus === 'declined').length,
      assignments: enrichedAssignments,
      availabilityBlocks
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /schedule/assignments/{id}/respond:
 *   patch:
 *     tags: [Schedule]
 *     summary: Accept or decline an assignment
 *     description: Allow members to accept or decline their assignments with optional reason
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Assignment (Schedule) ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - responseStatus
 *             properties:
 *               responseStatus:
 *                 type: string
 *                 enum: [accepted, declined]
 *               declineReason:
 *                 type: string
 *                 description: Required when declining
 *     responses:
 *       200:
 *         description: Response recorded successfully
 *       400:
 *         description: Invalid input or decline reason missing
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to respond to this assignment
 *       404:
 *         description: Assignment not found
 *       500:
 *         description: Server error
 */
router.patch('/assignments/:id/respond', validateAssignmentResponse(), async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { responseStatus, declineReason } = req.body;

    // Find the assignment
    const assignment = await Schedule.findById(id).populate('ministryId', 'name leaderId').lean();

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Verify the assignment belongs to the current user
    if (String(assignment.userId) !== String(currentUser._id)) {
      return res.status(403).json({ message: 'You are not authorized to respond to this assignment' });
    }

    // Verify the assignment belongs to the user's church
    if (String(assignment.church) !== String(currentUser.church)) {
      return res.status(403).json({ message: 'Assignment not found in your church' });
    }

    // Update the assignment
    const updateData = {
      responseStatus,
      responseDate: new Date()
    };

    if (responseStatus === 'declined') {
      updateData.declineReason = declineReason;
      // Optionally update status to 'cancelled' when declined
      updateData.status = 'cancelled';
    } else if (responseStatus === 'accepted') {
      // Clear any previous decline reason
      updateData.declineReason = null;
      // Update status to 'confirmed' when accepted
      if (assignment.status === 'planned') {
        updateData.status = 'confirmed';
      }
    }

    const updatedAssignment = await Schedule.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    )
      .populate('ministryId', 'name')
      .populate('roleId', 'name')
      .populate('eventInstanceId')
      .lean();

    // Notify ministry leader about the response
    if (assignment.ministryId?.leaderId) {
      const leaderUser = await User.findById(assignment.ministryId.leaderId).lean();
      if (leaderUser?.fcmToken) {
        const userName = `${currentUser.firstName} ${currentUser.lastName}`;
        const roleName = updatedAssignment.roleId?.name || 'Unknown Role';
        const statusText = responseStatus === 'accepted' ? 'accepted' : 'declined';
        
        await sendPushNotification({
          token: leaderUser.fcmToken,
          title: `Assignment ${statusText}`,
          body: `${userName} has ${statusText} the assignment for ${roleName}${responseStatus === 'declined' && declineReason ? ': ' + declineReason : ''}`,
          data: {
            type: 'assignment_response',
            assignmentId: String(updatedAssignment._id),
            ministryId: String(assignment.ministryId._id),
            responseStatus
          }
        });
      }
    }

    return res.status(200).json({
      message: `Assignment ${responseStatus} successfully`,
      assignment: updatedAssignment
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /schedule/availability/block:
 *   post:
 *     tags: [Schedule]
 *     summary: Block availability
 *     description: Create a new availability block to indicate when you're unavailable for scheduling
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *               - reason
 *             properties:
 *               ministryId:
 *                 type: string
 *                 description: Optional - block for specific ministry only
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               reason:
 *                 type: string
 *               isRecurring:
 *                 type: boolean
 *               recurrencePattern:
 *                 type: object
 *                 properties:
 *                   frequency:
 *                     type: string
 *                     enum: [weekly, monthly, yearly]
 *                   interval:
 *                     type: integer
 *                   daysOfWeek:
 *                     type: array
 *                     items:
 *                       type: integer
 *                   endRecurrence:
 *                     type: string
 *                     format: date-time
 *     responses:
 *       201:
 *         description: Availability block created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/availability/block', validateAvailabilityBlock(), async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ministryId, startDate, endDate, reason, isRecurring, recurrencePattern } = req.body;

    // Validate ministry if provided
    if (ministryId) {
      const ministry = await Ministry.findOne({
        _id: ministryId,
        church: currentUser.church
      }).lean();

      if (!ministry) {
        return res.status(404).json({ message: 'Ministry not found in your church' });
      }

      // Verify user is a member of this ministry
      const isMember = await Assignment.findOne({
        ministryId,
        userId: currentUser._id,
        status: 'approved'
      }).lean();

      if (!isMember) {
        return res.status(403).json({ message: 'You are not a member of this ministry' });
      }
    }

    // Get church timezone for proper date parsing
    const timezone = currentUser.church ? 
      (await require('../models/church').findById(currentUser.church).select('timeZone').lean())?.timeZone || 'UTC' 
      : 'UTC';

    const blockData = {
      church: currentUser.church,
      userId: currentUser._id,
      startDate: parseChurchDate(startDate, timezone),
      endDate: parseChurchDate(endDate, timezone),
      reason,
      isRecurring: isRecurring || false
    };

    if (ministryId) {
      blockData.ministryId = ministryId;
    }

    if (isRecurring && recurrencePattern) {
      blockData.recurrencePattern = recurrencePattern;
    }

    const availabilityBlock = await AvailabilityBlock.create(blockData);

    const populatedBlock = await AvailabilityBlock.findById(availabilityBlock._id)
      .populate('ministryId', 'name')
      .lean();

    return res.status(201).json({
      message: 'Availability block created successfully',
      block: populatedBlock
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /schedule/availability/blocks:
 *   get:
 *     tags: [Schedule]
 *     summary: Get my availability blocks
 *     description: Retrieve all availability blocks for the current user
 *     parameters:
 *       - in: query
 *         name: ministryId
 *         schema:
 *           type: string
 *         description: Filter by ministry ID
 *       - in: query
 *         name: upcoming
 *         schema:
 *           type: boolean
 *         description: Only show future blocks
 *     responses:
 *       200:
 *         description: Availability blocks retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/availability/blocks', async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { ministryId, upcoming } = req.query;

    const query = {
      church: currentUser.church,
      userId: currentUser._id
    };

    if (ministryId) {
      query.ministryId = asObjectId(ministryId);
    }

    if (upcoming === 'true') {
      query.endDate = { $gte: new Date() };
    }

    const blocks = await AvailabilityBlock.find(query)
      .populate('ministryId', 'name')
      .sort({ startDate: 1 })
      .lean();

    return res.status(200).json({
      total: blocks.length,
      blocks
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /schedule/availability/blocks/{id}:
 *   delete:
 *     tags: [Schedule]
 *     summary: Delete availability block
 *     description: Remove an availability block
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Availability block ID
 *     responses:
 *       200:
 *         description: Availability block deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to delete this block
 *       404:
 *         description: Availability block not found
 *       500:
 *         description: Server error
 */
router.delete('/availability/blocks/:id', async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;

    const block = await AvailabilityBlock.findById(id).lean();

    if (!block) {
      return res.status(404).json({ message: 'Availability block not found' });
    }

    // Verify ownership
    if (String(block.userId) !== String(currentUser._id)) {
      return res.status(403).json({ message: 'You are not authorized to delete this block' });
    }

    if (String(block.church) !== String(currentUser.church)) {
      return res.status(403).json({ message: 'Block not found in your church' });
    }

    await AvailabilityBlock.findByIdAndDelete(id);

    return res.status(200).json({
      message: 'Availability block deleted successfully'
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
