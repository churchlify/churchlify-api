/*
#swagger.tags = ['Checkin']
*/
// routes/checkin.js
const {authenticateFirebaseToken} = require('../middlewares/auth');
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

async function getActiveCheckInForUser(userId) {
  return await CheckIn.findOne({
    requestedBy: userId,
    // We only care about check-ins that haven't been fully 'picked_up' yet
    'children.status': { $in: ['check_in_request', 'dropped_off'] }
  })
  .populate('children.child', 'firstName lastName')
  .populate('eventInstance', 'title date startTime endTime')
  .lean();
}

// Generate a random 4-digit pickup code
function generatePickupCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/*
#swagger.tags = ['Checkin']
#swagger.description = 'Checks if the user has a pending or active check-in session.'
*/
router.get('/active', authenticateFirebaseToken, async (req, res) => {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {return res.status(401).json({ error: 'Unauthorized' });}

    const activeCheckIn = await getActiveCheckInForUser(currentUser._id);

    if (!activeCheckIn) {
      return res.status(200).json({ hasActiveCheckIn: false });
    }

    // Check if the check-in has expired (if it was never confirmed)
    if (activeCheckIn.expiresAt && new Date() > new Date(activeCheckIn.expiresAt)) {
      return res.status(200).json({ hasActiveCheckIn: false, message: 'Previous request expired.' });
    }

    res.status(200).json({
      hasActiveCheckIn: true,
      checkIn: activeCheckIn
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// isAutoCheckinWindowOpen function removed (unused)
//initiate drop-off
/*
#swagger.tags = ['Checkin']
*/
/*
#swagger.tags = ['Checkin']
*/
router.post('/initiate', authenticateFirebaseToken, async (req, res) => {
  const { child } = req.body; 

  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {return res.status(401).json({ error: 'Unauthorized' });}

    // 1. Prevent multiple active check-in sessions
    const existing = await getActiveCheckInForUser(currentUser._id);
    if (existing) {
      return res.status(400).json({ 
        message: 'You already have an active check-in session.', 
        checkInId: existing._id 
      });
    }

    // 2. Validate Children
    if (!Array.isArray(child) || child.length === 0) {
      return res.status(400).json({ error: 'No children selected' });
    }

    const kids = await Kid.find({ _id: { $in: child } });
    if (kids.length !== child.length) {
      return res.status(400).json({ error: 'One or more child IDs do not exist' });
    }

    const unauthorizedKids = kids.filter(kid => 
      String(kid.parent._id) !== String(currentUser._id)
    );
    
    if (unauthorizedKids.length > 0) {
      return res.status(403).json({ 
        error: 'You are not authorized to check in one or more of these children',
        unauthorizedKids: unauthorizedKids.map(k => k._id)
      });
    }

    const church = await Church.findById(currentUser.church).select('timeZone').lean();
    const churchTimezone = church?.timeZone || 'UTC';
    const nowInChurchTz = moment.tz(churchTimezone);

    // 3. Find Today's Events
    const startOfDay = nowInChurchTz.clone().startOf('day').toDate();
    const endOfDay = nowInChurchTz.clone().endOf('day').toDate();

    const todayInstances = await EventInstance.find({
      church: currentUser.church,
      date: { $gte: startOfDay, $lte: endOfDay }
    }).lean();

    const checkinOpenInstance = todayInstances.find(instance => {
      if (instance.isCheckinOpen) {return true;}
      
      const literalDate = new Date(instance.date).toISOString().split('T')[0];
      const eventStart = moment.tz(`${literalDate} ${instance.startTime}`, 'YYYY-MM-DD HH:mm', churchTimezone);
      const eventEnd = moment.tz(`${literalDate} ${instance.endTime}`, 'YYYY-MM-DD HH:mm', churchTimezone);
      
      return nowInChurchTz.isBetween(eventStart.clone().subtract(2, 'hours'), eventEnd);
    });

    if (!checkinOpenInstance) {
      return res.status(400).json({ message: 'No events are currently open for check-in.' });
    }

    const newCheckIn = new CheckIn({
      children: child.map(id => ({ child: id, status: 'check_in_request' })),
      expiresAt: new Date(Date.now() + 15 * 60000), 
      eventInstance: checkinOpenInstance._id,
      requestedBy: currentUser._id,
      pickupCode: generatePickupCode()
    });

    await newCheckIn.save();
   await newCheckIn.populate('children.child', 'firstName lastName');

    try {
      getIO().emit('checkin:initiated', {
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
    } catch (err) { console.error('Socket fail:', err.message); }
    res.status(201).json({ message: 'Check-in initiated', checkIn: newCheckIn });

  } catch (err) {
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