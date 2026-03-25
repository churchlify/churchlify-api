// services/checkin.service.js
const CheckIn = require('../models/checkin');
const Kid = require('../models/kid');
const { getIO } = require('../config/socket');
const { getChurchUpcomingEvent } = require('./event.service');

// ---- helpers ----
async function generatePickupCode() {
  let code, exists = true;
  while (exists) {
    code = Math.floor(1000 + Math.random() * 9000).toString();
    exists = await CheckIn.exists({ pickupCode: code });
  }
  return code;
}

function filterActiveChildren(children) {
  const now = Date.now();
  return children.filter(c => {
    if (c.status !== 'check_in_request') {return true;}
    return c.expiresAt && new Date(c.expiresAt).getTime() > now;
  });
}

// ---- core ----
async function getActiveEvent(user) {
  const event = await getChurchUpcomingEvent(user);
  if (!event) {return null;}

  return {
    id: event._id,
    title: event.title,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    isCheckinOpen: event.isCheckinOpen
  };
}

async function getActiveCheckIn(user) {
  const event = await getChurchUpcomingEvent(user);
  if (!event) {return { hasActiveCheckIn: false };}

  const checkin = await CheckIn.findOne({
    requestedBy: user._id,
    eventInstance: event._id,
    'children.status': { $in: ['check_in_request', 'dropped_off'] }
  })
    .populate('children.child', 'firstName lastName')
    .lean();

  if (!checkin) {return { hasActiveCheckIn: false };}

  checkin.children = filterActiveChildren(checkin.children);
  if (!checkin.children.length) {return { hasActiveCheckIn: false };}

  return { hasActiveCheckIn: true, checkIn: checkin };
}

async function searchCheckins(user, query) {
  const { pickupCode, lastName, eventId } = query;

  // 1. Get active event (or fallback to provided)
  const event = await getChurchUpcomingEvent(user, eventId);
  if (!event) {
    throw { status: 400, message: 'No active event' };
  }

  const mongoQuery = {
    eventInstance: event._id
  };

  // 3. Pickup code search (FAST path - indexed)
  if (pickupCode) {
    mongoQuery.pickupCode = pickupCode;
  }

  // 4. Last name search (optimized)
  if (lastName) {
    const kids = await Kid.find({
      church: user.church,
      lastName: { $regex: `^${lastName}$`, $options: 'i' }
    }).select('_id');

    if (!kids.length) {
      return { checkIns: [] }; // early exit
    }

    mongoQuery['children.child'] = { $in: kids.map(k => k._id) };
  }

  // 5. Query check-ins
  const checkins = await CheckIn.find(mongoQuery)
    .populate('children.child', 'firstName lastName')
    .populate('requestedBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .lean();

    const filtered = checkins
  .map(c => {
    const children = filterActiveChildren(c.children);
    if (!children.length) {return null;}

    return {
      ...c,
      children
    };
  })
  .filter(Boolean);

  return { checkIns: filtered };
}

async function initiateCheckIn(user, body) {
  const { child, eventId } = body;

  const event = await getChurchUpcomingEvent(user, eventId);
  if (!event) {throw { status: 400, message: 'No active event' };}

  // atomic protection
  const existing = await CheckIn.findOne({
    requestedBy: user._id,
    eventInstance: event._id,
    'children.status': { $in: ['check_in_request', 'dropped_off'] }
  });

  if (existing) {throw { status: 400, message: 'Active check-in already exists' };}

  if (!Array.isArray(child) || !child.length) {
    throw { status: 400, message: 'No children selected' };
  }

  const kids = await Kid.find({ _id: { $in: child } });
  const invalid = kids.some(k => String(k.parent) !== String(user._id));
  if (invalid || kids.length !== child.length) {
    throw { status: 403, message: 'Invalid children' };
  }

  const expiry = new Date(Date.now() + 15 * 60000);

  const checkin = await CheckIn.create({
    eventInstance: event._id,
    requestedBy: user._id,
    pickupCode: await generatePickupCode(),
    children: child.map(id => ({ child: id, status: 'check_in_request', expiresAt: expiry }))
  });

  await checkin.populate('children.child', 'firstName lastName');

  // socket scoped
  try {
    getIO().to(`church:${user.church}`).emit('checkin:initiated', {
      checkInId: checkin._id,
      children: checkin.children
    });
  } catch {}

  return { message: 'Check-in initiated', checkIn: checkin };
}

async function confirmDropoff(user, checkinId, childIds) {
  const checkin = await CheckIn.findById(checkinId).populate('children.child');
  if (!checkin) {throw { status: 404, message: 'Not found' };}

  let count = 0;
  checkin.children.forEach(c => {
    if (childIds.includes(String(c.child._id)) && c.status === 'check_in_request') {
      c.status = 'dropped_off';
      c.droppedOffBy = user._id;
      c.droppedOffAt = new Date();
      count++;
    }
  });

  if (!count) {throw { status: 400, message: 'Nothing to confirm' };}

  await checkin.save();

  try {
    getIO().to(`church:${user.church}`).emit('checkin:dropoff-confirmed', {
      checkInId: checkin._id
    });
  } catch {}

  return { message: `Confirmed ${count}` };
}

async function pickupChildren(user, checkinId, body) {
  const { childIds, pickupCode } = body;

  const checkin = await CheckIn.findById(checkinId).populate('children.child');
  if (!checkin) {throw { status: 404, message: 'Not found' };}

  const isParent = checkin.children.some(c => String(c.child.parent) === String(user._id));

  if (!isParent && pickupCode !== checkin.pickupCode) {
    throw { status: 403, message: 'Invalid pickup code' };
  }

  let count = 0;
  checkin.children.forEach(c => {
    if (childIds.includes(String(c.child._id)) && c.status === 'dropped_off') {
      c.status = 'picked_up';
      c.pickedUpBy = user._id;
      c.pickedUpAt = new Date();
      count++;
    }
  });

  await checkin.save();

  try {
    getIO().to(`church:${user.church}`).emit('checkin:picked-up', {
      checkInId: checkin._id
    });
  } catch {}

  return { message: `Picked up ${count}` };
}

module.exports = {
  getActiveEvent,
  getActiveCheckIn,
  initiateCheckIn,
  confirmDropoff,
  pickupChildren,
  searchCheckins
};
