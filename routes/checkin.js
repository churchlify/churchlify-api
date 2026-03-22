/*
#swagger.tags = ['Checkin']
*/
// routes/checkin.js
const {authenticateFirebaseToken} = require('../middlewares/auth');
const {isValidObjectId} = require('../middlewares/validators');
const moment = require('moment-timezone');
const EventInstance = require('../models/eventinstance');
const Church = require('../models/church');
const express = require('express');
const CheckIn = require('../models/checkin');
const Kid = require('../models/kid');
const User = require('../models/user');
const { getIO } = require('../config/socket');
const router = express.Router();
router.use(express.json());

// Helper function to get current user from Firebase token
async function getCurrentUser(req) {
  const firebaseUid = req.user?.uid;
  if (!firebaseUid) {
    return null;
  }
  return User.findOne({ firebaseId: firebaseUid }).lean();
}

// Generate a random 4-digit pickup code
function generatePickupCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// isAutoCheckinWindowOpen function removed (unused)
//initiate drop-off
/*
#swagger.tags = ['Checkin']
*/
router.post('/initiate', authenticateFirebaseToken, async (req, res) => {
  const { child } = req.body; // expecting an array of ObjectIds

  try {
    // Get authenticated user
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
    }

    // Validate input
    if (!Array.isArray(child) || child.length === 0 || !child.every(isValidObjectId)) {
      return res.status(400).json({ error: 'Invalid or missing child IDs' });
    }

    // Fetch all kids and validate existence
    const kids = await Kid.find({ _id: { $in: child } }).populate('parent');
    if (kids.length !== child.length) {
      return res.status(400).json({ error: 'One or more child IDs do not exist' });
    }

    // SECURITY: Verify current user is the parent of all children
    const unauthorizedKids = kids.filter(kid => 
      String(kid.parent._id) !== String(currentUser._id)
    );
    
    if (unauthorizedKids.length > 0) {
      return res.status(403).json({ 
        error: 'You are not authorized to check in one or more of these children',
        unauthorizedKids: unauthorizedKids.map(k => k._id)
      });
    }

    // Assume all kids share the same parent/church (verified by authorization)
    const churchId = currentUser.church;

    // Get church timezone for proper date/time comparisons
    const church = await Church.findById(churchId).select('timeZone').lean();
    const churchTimezone = church?.timeZone || 'UTC';

    // Get current time in church timezone
    const nowInChurchTz = moment.tz(churchTimezone);
    const now = nowInChurchTz.toDate(); // Current time as Date object
    const expiresAt = new Date(now.getTime() + 15 * 60000); // 15 minutes from now

    // Calculate start and end of today in church timezone, then convert to UTC for MongoDB query
    const startOfDayInChurchTz = nowInChurchTz.clone().startOf('day');
    const endOfDayInChurchTz = nowInChurchTz.clone().endOf('day');
    const startOfDay = startOfDayInChurchTz.toDate(); // UTC equivalent
    const endOfDay = endOfDayInChurchTz.toDate(); // UTC equivalent

    // Find event instances for today and allow manual override or auto-open window (next 2 hours)
    const todayInstances = await EventInstance.find({
      church: churchId,
      date: { $gte: startOfDay, $lte: endOfDay }
    })
      .sort({ date: 1, startTime: 1 })
      .lean();

    // Helper function to check if check-in is allowed for an event instance
    // Check-in is allowed if:
    // 1. isCheckinOpen is manually set to true, OR
    // 2. Current time (in church timezone) is within 2 hours of event start time (before or after) AND event end date is in the future
    const isCheckinAllowed = (instance) => {
      if (instance.isCheckinOpen) {
        return true;
      }

      if (!instance.date || !instance.startTime || !instance.endTime) {
        return false;
      }

      // Parse event start and end times in church timezone
      const eventDateStr = moment.tz(instance.date, churchTimezone).format('YYYY-MM-DD');
      const eventStartDateTime = moment.tz(`${eventDateStr} ${instance.startTime}`, 'YYYY-MM-DD HH:mm', churchTimezone);
      const eventEndDateTime = moment.tz(`${eventDateStr} ${instance.endTime}`, 'YYYY-MM-DD HH:mm', churchTimezone);

      // Current time in church timezone
      const currentTimeInChurchTz = moment.tz(churchTimezone);

      // Two hours from now in church timezone
      const twoHoursFromNowInChurchTz = currentTimeInChurchTz.clone().add(2, 'hours');

      // Check if event starts within the next 2 hours (event start is between now and 2 hours from now)
      const isEventStartingSoon = eventStartDateTime.isSameOrAfter(currentTimeInChurchTz) &&
        eventStartDateTime.isSameOrBefore(twoHoursFromNowInChurchTz);

      // Check if event end date is in the future
      const isEventEndInFuture = eventEndDateTime.isAfter(currentTimeInChurchTz);

      return isEventStartingSoon && isEventEndInFuture;
    };

    const checkinOpenInstance = todayInstances.find(isCheckinAllowed);

    if (!checkinOpenInstance) {
      return res.status(400).json({
        message: 'Check-in opens automatically for same-day events starting within the next 2 hours.'
      });
    }

    // Check for conflicts per child
    for (const kidId of child) {
      // Check if child already has an active check-in for this event
      const existingCheckIn = await CheckIn.findOne({
        'children.child': kidId,
        'children.status': { $in: ['check_in_request', 'dropped_off'] },
        eventInstance: checkinOpenInstance._id
      });

      if (existingCheckIn) {
        return res.status(400).json({
          message: `Child ${kidId} already has an active check-in request for this event.`
        });
      }
    }

    // Create and save the new check-in REQUEST (pending staff confirmation)
    const pickupCode = generatePickupCode();
    const children = child.map(kidId => ({
      child: kidId,
      status: 'check_in_request' // Pending confirmation from church staff
    }));

    const newCheckIn = new CheckIn({
      children,
      expiresAt,
      eventInstance: checkinOpenInstance._id,
      requestedBy: currentUser._id,
      pickupCode
    });

    await newCheckIn.save();
    await newCheckIn.populate('children.child', 'firstName lastName');

    // Emit WebSocket event for real-time updates
    try {
      const io = getIO();
      io.emit('checkin:initiated', {
        checkInId: newCheckIn._id,
        eventInstance: checkinOpenInstance._id,
        eventTitle: checkinOpenInstance.title,
        children: newCheckIn.children.map(c => ({
          childId: c.child._id,
          childName: `${c.child.firstName} ${c.child.lastName}`,
          status: c.status
        })),
        requestedBy: currentUser._id,
        timestamp: new Date()
      });
    } catch (socketErr) {
      console.error('Socket emission failed:', socketErr.message);
    }

    res.status(201).json({
      message: 'Check-in request created successfully. Waiting for staff confirmation.',
      checkIn: newCheckIn,
      eventTitle: checkinOpenInstance.title,
      pickupCode: pickupCode // ONE code for all kids - can be used multiple times
    });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: err.message });
  }
});


// Confirm drop-off (for church staff/volunteers)
/*
#swagger.tags = ['Checkin']
*/
router.patch('/:id/confirm-dropoff', authenticateFirebaseToken, async (req, res) => {
    const { childIds } = req.body; // childIds = array of kid IDs to confirm drop-off
    
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
      }

      // Validate input
      if (!Array.isArray(childIds) || childIds.length === 0) {
        return res.status(400).json({ error: 'childIds array is required' });
      }

      const checkIn = await CheckIn.findById(req.params.id)
        .populate('children.child');
        
      if (!checkIn) {
        return res.status(404).json({ message: 'Check-in not found' });
      }

      // Update status for specified children from check_in_request to dropped_off
      let confirmedCount = 0;
      checkIn.children.forEach(child => {
        if (childIds.includes(String(child.child._id)) && child.status === 'check_in_request') {
          child.status = 'dropped_off';
          child.droppedOffBy = currentUser._id;
          child.droppedOffAt = new Date();
          confirmedCount++;
        }
      });

      if (confirmedCount === 0) {
        return res.status(400).json({ 
          error: 'None of the specified children are pending confirmation' 
        });
      }

      await checkIn.save();
      await checkIn.populate('children.child', 'firstName lastName');
      
      // Emit WebSocket event for real-time updates
      try {
        const io = getIO();
        io.emit('checkin:dropoff-confirmed', {
          checkInId: checkIn._id,
          eventInstance: checkIn.eventInstance,
          children: checkIn.children
            .filter(c => childIds.includes(String(c.child._id)))
            .map(c => ({
              childId: c.child._id,
              childName: `${c.child.firstName} ${c.child.lastName}`,
              status: c.status,
              droppedOffBy: currentUser._id,
              droppedOffAt: c.droppedOffAt
            })),
          confirmedBy: currentUser._id,
          timestamp: new Date()
        });
      } catch (socketErr) {
        console.error('Socket emission failed:', socketErr.message);
      }
      
      res.json({
        message: `Successfully confirmed drop-off for ${confirmedCount} child(ren)`,
        checkIn
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });


  // Update status (for church staff/volunteers)
  /*
#swagger.tags = ['Checkin']
*/
router.patch('/:id/pickup', authenticateFirebaseToken, async (req, res) => {
    const { childIds, pickupCode } = req.body; // childIds = array of kid IDs to pick up
    
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
      }

      // Validate input
      if (!Array.isArray(childIds) || childIds.length === 0) {
        return res.status(400).json({ error: 'childIds array is required' });
      }

      const checkIn = await CheckIn.findById(req.params.id)
        .populate('children.child');
        
      if (!checkIn) {
        return res.status(404).json({ message: 'Check-in not found' });
      }

      // SECURITY: Verify pickup code or parent authorization
      const childrenToPickup = checkIn.children.filter(c => 
        childIds.includes(String(c.child._id))
      );

      if (childrenToPickup.length === 0) {
        return res.status(400).json({ error: 'None of the specified children are in this check-in' });
      }

      // Check if user is the parent of ANY of the kids
      const isParent = checkIn.children.some(c => 
        String(c.child.parent) === String(currentUser._id)
      );

      if (!isParent) {
        // If not parent, must be church staff with valid pickup code
        if (!pickupCode || pickupCode !== checkIn.pickupCode) {
          return res.status(403).json({ 
            error: 'Invalid pickup code. Only the parent or authorized staff with the correct code can complete pickup.' 
          });
        }
      }

      // Update status for specified children
      let pickedUpCount = 0;
      checkIn.children.forEach(child => {
        if (childIds.includes(String(child.child._id)) && child.status === 'dropped_off') {
          child.status = 'picked_up';
          child.pickedUpBy = currentUser._id;
          child.pickedUpAt = new Date();
          pickedUpCount++;
        }
      });

      await checkIn.save();
      
      // Emit WebSocket event for real-time updates
      try {
        const io = getIO();
        io.emit('checkin:picked-up', {
          checkInId: checkIn._id,
          eventInstance: checkIn.eventInstance,
          children: checkIn.children
            .filter(c => childIds.includes(String(c.child._id)) && c.status === 'picked_up')
            .map(c => ({
              childId: c.child._id,
              childName: `${c.child.firstName} ${c.child.lastName}`,
              status: c.status,
              pickedUpBy: currentUser._id,
              pickedUpAt: c.pickedUpAt
            })),
          pickedUpBy: currentUser._id,
          timestamp: new Date()
        });
      } catch (socketErr) {
        console.error('Socket emission failed:', socketErr.message);
      }
      
      res.json({
        message: `Successfully picked up ${pickedUpCount} child(ren)`,
        checkIn
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
/*
#swagger.tags = ['Checkin']
*/
router.get('/find/:id', authenticateFirebaseToken, async(req, res) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
      }

      const { id } = req.params;
      const checkin = await CheckIn.findById(id)
        .populate('children.child')
        .populate('requestedBy', 'firstName lastName')
        .populate('children.droppedOffBy', 'firstName lastName')
        .populate('children.pickedUpBy', 'firstName lastName')
        .populate('eventInstance', 'title date')
        .lean();
        
      if (!checkin) {
        return res.status(404).json({ message: `CheckIn with id ${id} not found` });
      }

      // SECURITY: Only parent or church staff can view check-in details
      const kidIds = checkin.children.map(c => c.child._id);
      const kids = await Kid.find({ _id: { $in: kidIds } }).lean();
      const isParent = kids.some(kid => 
        String(kid.parent) === String(currentUser._id)
      );
      const isChurchStaff = String(currentUser.church) === String(kids[0]?.church);

      if (!isParent && !isChurchStaff) {
        return res.status(403).json({ error: 'Not authorized to view this check-in' });
      }

      // Hide pickup code from non-parents
      if (!isParent) {
        delete checkin.pickupCode;
      }

      res.json({ checkin });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
});
/*
#swagger.tags = ['Checkin']
*/
router.get('/list', authenticateFirebaseToken, async(req, res) => {
    try {
        const currentUser = await getCurrentUser(req);
        if (!currentUser) {
          return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
        }

        // Only show check-ins for the current user's church
        const checkins = await CheckIn.find({ eventInstance: { $exists: true } })
          .select('children expiresAt eventInstance requestedBy createdAt pickupCode')
          .populate({
            path: 'eventInstance',
            match: { church: currentUser.church },
            select: 'title date church'
          })
          .populate('children.child', 'firstName lastName')
          .populate('requestedBy', 'firstName lastName')
          .lean();

        // Filter out null eventInstances (from different churches)
        const filteredCheckins = checkins.filter(c => c.eventInstance !== null);

        res.status(200).json({ checkins: filteredCheckins });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Checkin']
*/
router.get('/list/:child', authenticateFirebaseToken, async(req, res) => {
    try {
        const currentUser = await getCurrentUser(req);
        if (!currentUser) {
          return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
        }

        const { child } = req.params;
        
        // SECURITY: Verify user is the parent of this child
        const kidData = await Kid.findById(child).lean();
        if (!kidData) {
          return res.status(404).json({ error: 'Child not found' });
        }

        if (String(kidData.parent) !== String(currentUser._id)) {
          return res.status(403).json({ error: 'Not authorized to view check-ins for this child' });
        }

        const checkins = await CheckIn.find({ 'children.child': child })
          .select('children expiresAt createdAt eventInstance')
          .populate('eventInstance', 'title date')
          .populate('children.child', 'firstName lastName')
          .populate('children.droppedOffBy', 'firstName lastName')
          .populate('children.pickedUpBy', 'firstName lastName')
          .sort({ createdAt: -1 })
          .lean();
        
        // Filter to show only this child's data from each check-in
        const filtered = checkins.map(c => ({
          ...c,
          children: c.children.filter(ch => String(ch.child._id) === String(child))
        }));
          
        res.status(200).json({ checkins: filtered });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Checkin']
*/
router.delete('/delete/:id', authenticateFirebaseToken, async (req, res) => {
    try {
        const currentUser = await getCurrentUser(req);
        if (!currentUser) {
          return res.status(401).json({ error: 'Unable to resolve authenticated user profile' });
        }

        const { id } = req.params;
        const checkInRecord = await CheckIn.findById(id).populate('children.child').lean();
        
        if (!checkInRecord) {
            return res.status(404).json({ error: 'Check in record not found' });
        }

        // SECURITY: Only parent or church admin can delete
        const kidIds = checkInRecord.children.map(c => c.child._id);
        const kids = await Kid.find({ _id: { $in: kidIds } }).lean();
        const isParent = kids.some(kid => 
          String(kid.parent) === String(currentUser._id)
        );
        const isAdmin = currentUser.role === 'admin' || currentUser.role === 'super' || currentUser.church === currentUser.adminAt;

        if (!isParent && !isAdmin) {
          return res.status(403).json({ error: 'Not authorized to delete this check-in record' });
        }

        const deletedItem = await CheckIn.findByIdAndDelete(id);
        res.status(200).json({ message: 'Check in record deleted successfully', deletedItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;