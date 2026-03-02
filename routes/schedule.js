const express = require('express');
const mongoose = require('mongoose');

const Assignment = require('../models/assignment');
const Event = require('../models/event');
const EventInstance = require('../models/eventinstance');
const EventScheduleTemplate = require('../models/eventScheduleTemplate');
const Ministry = require('../models/ministry');
const Schedule = require('../models/schedule');
const ScheduleRole = require('../models/scheduleRole');
const User = require('../models/user');
const { sendPushNotification } = require('../common/notification.service');

const { validateScheduleRole, validateScheduleAssignment, validateScheduleTemplate } = require('../middlewares/validators');

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

async function ensureApprovedMember(ministryId, userId) {
  const assignment = await Assignment.findOne({
    ministryId,
    userId,
    status: 'approved'
  }).lean();

  if (!assignment) {
    return { ok: false, code: 400, message: 'Selected user is not an approved member of this ministry.' };
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
router.post('/templates/create', validateScheduleTemplate(), async (req, res) => {
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

    return res.json({ templates });
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
router.patch('/templates/update/:id', async (req, res) => {
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
router.delete('/templates/delete/:id', async (req, res) => {
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
router.post('/roles/create', validateScheduleRole(), async (req, res) => {
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
router.get('/roles/list/:ministryId', async (req, res) => {
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
router.patch('/roles/update/:id', async (req, res) => {
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
router.delete('/roles/delete/:id', async (req, res) => {
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
router.post('/create', validateScheduleAssignment(), async (req, res) => {
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
      ensureApprovedMember(ministryId, userId)
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
router.patch('/update/:id', async (req, res) => {
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
      const memberResult = await ensureApprovedMember(schedule.ministryId, req.body.userId);
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
router.get('/event-instance/:eventInstanceId/:ministryId', async (req, res) => {
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
router.get('/monthly', async (req, res) => {
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

    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const schedules = await Schedule.find({
      church: req.church._id,
      ministryId,
      scheduleDate: { $gte: startDate, $lt: endDate }
    })
      .populate('eventInstanceId', 'title date startTime endTime location')
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
router.delete('/delete/:id', async (req, res) => {
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

module.exports = router;
