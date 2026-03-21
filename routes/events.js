/*
#swagger.tags = ['Events']
*/
// routes/events.js
//const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const {validateEvent} = require('../middlewares/validators');
// const {getFlatennedMonthEvents} = require('../common/shared');
const express = require('express');
const Event = require('../models/event');
const Venue = require('../models/venue');
const EventInstance = require('../models/eventinstance');
const EventService = require('../common/event.service');
const {uploadImage, deleteFile, uploadToMinio} = require('../common/upload');
// Unused imports removed
//const event = require('../models/event');
const router = express.Router();
router.use(express.json());
const attachTimezone = require('../middlewares/attachTimezone');

function parseYearMonthFromDateInput(value) {
    if (!value) {
        return null;
    }

    const match = String(value).trim().match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return null;
    }

    return { year, month };
}
/*
#swagger.tags = ['Events']
*/
router.post('/create', uploadImage, validateEvent(), async(req, res) => {
    const { church, title, description, startDate, startTime, endDate,endTime, location, allowKidsCheckin, checkinStartTime, reminder, recurrence, createdBy } = req.body;
    //const newItem = new Event({ church, title, description, startDate, startTime, endDate,endTime, location, flier, allowKidsCheckin, checkinStartTime, reminder, recurrence, createdBy } );
    try {
        // Prepare the event data object
         let venueId;
          if (typeof location === 'string') {
                const venue = await Venue.findById(location);
                if (!venue){ throw new Error('Venue not found');}
                venueId = venue._id;
            } else if (location?.name && location?.address) {
                let venue = await Venue.findOne({ name: location.name, church});
                if (!venue) {
                venue = await Venue.create({ name: location.name, address: location.address, church});
                }
                venueId = venue._id;
            } else {
                throw new Error('Invalid location: must be a venue ID or venue object with name and address');
            }
        
        // Handle flier image upload if provided
        let flierUrl = null;
        if (req.file) {
          flierUrl = await uploadToMinio(req.file);
        }

        // Save all dates in UTC (assume input is UTC or ISO)
        const eventData = {
            church,
            title,
            description,
            startDate: startDate ? new Date(startDate) : null,
            startTime,
            endDate: endDate ? new Date(endDate) : null,
            endTime,
            location: venueId,
            flier: flierUrl,
            allowKidsCheckin,
            checkinStartTime,
            reminder,
            createdBy
        };
        // Add recurrence data if it exists
        if (recurrence) {
            eventData.isRecurring = true;
            eventData.recurrence = {
                frequency: recurrence.frequency,
                interval: recurrence.interval || 1,
                daysOfWeek: recurrence.daysOfWeek || [],
                endDate: recurrence.endDate ? new Date(recurrence.endDate) : null
            };
        }
         // Use the EventService to create the event
        const newEvent = await EventService.createEvent(eventData);
         res.status(201).json({
            message: eventData.isRecurring ?
                'Recurring event series created successfully' :
                'Event created successfully',
            event: newEvent
        });
    } catch (err) {
       console.error('Error creating event:', err);
        res.status(500).json({
            error: err.message,
            details: err.errors ? Object.values(err.errors).map(e => e.message) : null
        });
    }
});
/*
#swagger.tags = ['Events']
*/
router.get('/find/:id', attachTimezone, async(req, res) => {
        const { id } = req.params;
        const event = await EventInstance.findById(id).populate('location').lean();
        if (!event){ return res.status(404).json({ message: `Event with id ${id} not found` });}
        // Compute effective checkin open (display only)
        event.effectiveCheckinOpen = event.isCheckinOpen;
        res.json({ event, timezone: res.locals.churchTimezone });
});
/*
#swagger.tags = ['Events']
*/
router.get('/upcoming', attachTimezone, async (req, res) => {
    try {
        const church = req.church;
        const timezone = res.locals.churchTimezone || 'UTC'; // Fallback to UTC

        if (!church) {
            return res.status(400).json({ message: 'Church context required' });
        }

        // 1. Get the current time in the CHURCH'S timezone
        const now = new Date();
        
        // 2. Format "today" to match your DB's ISO format (YYYY-MM-DDT00:00:00.000Z)
        const todayString = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
        const today = new Date(`${todayString}T00:00:00.000Z`);

        // 3. Format "currentTime" as HH:MM in the CHURCH'S timezone
        const currentTime = now.toLocaleTimeString('en-GB', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false, 
            timeZone: timezone 
        });

        let filter = {
          $or: [
            { date: { $gt: today } },
            { date: today, startTime: { $gt: currentTime } }
          ],
          church: church._id
        };

        console.log(`Timezone: ${timezone} | Today: ${todayString} | Now: ${currentTime}`);
        
        const event = await EventInstance.findOne(filter)
            .populate('location')
            .select('title date startTime location isCheckinOpen')
            .sort({ date: 1, startTime: 1 })
            .lean();

        if (event) {
            event.effectiveCheckinOpen = event.isCheckinOpen;
        }

        res.json({ event, churchTimezone: timezone });
    } catch (error) {
        console.error('Error fetching upcoming event:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
/*
#swagger.tags = ['Events']
*/
router.patch('/update/:id', uploadImage, validateEvent(), async (req, res) => {
  const { id } = req.params;
    const allowedFields = ['church', 'title', 'description', 'startDate', 'startTime', 'endDate', 'endTime', 'location', 'flier', 'reminder', 'allowKidsCheckin', 'checkinStartTime', 'recurrence', 'createdBy'];
    const updateFields = {};
    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            // Save all dates in UTC
            if (['startDate', 'endDate'].includes(field)) {
                updateFields[field] = req.body[field] ? new Date(req.body[field]) : null;
            } else if (field === 'recurrence' && req.body.recurrence) {
                updateFields.recurrence = {
                    ...req.body.recurrence,
                    endDate: req.body.recurrence.endDate ? new Date(req.body.recurrence.endDate) : null
                };
            } else {
                updateFields[field] = req.body[field];
            }
        }
    });
  try {
    const existingEvent = await Event.findById(id);
    if (!existingEvent) {
      return res.status(404).json({ message: `Event with id ${id} not found` });
    }

    // Handle flier image upload if provided
    if (req.file) {
      const newFlierUrl = await uploadToMinio(req.file);
      updateFields.flier = newFlierUrl;

      // Delete old flier image if it exists
      if (existingEvent.flier) {
        await deleteFile(existingEvent.flier);
      }
    }

        const updatedEvent = await Event.findByIdAndUpdate(id, { $set: updateFields }, { new: true, runValidators: true }).lean();
        await EventService.syncEventInstancesForEvent(id);

    res.status(200).json({ message: 'Record updated successfully', event: updatedEvent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/*
#swagger.tags = ['Events']
*/
router.get('/list', attachTimezone, async(req, res) => {
    try {
        const church = req.church;
        if (!church) {
            return res.status(400).json({ message: 'Church context required' });
        }
        // Use UTC for all date/time handling
        let year, month;
        if (req.query.date) {
            const parsedParts = parseYearMonthFromDateInput(req.query.date);
            if (parsedParts) {
                year = parsedParts.year;
                month = parsedParts.month;
            }
        }
        const now = new Date();
        if (!year || !month) {
            year = now.getUTCFullYear();
            month = now.getUTCMonth() + 1;
        }
        // Month boundaries in UTC
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 1));
        const filter = { date: { $gte: startDate, $lt: endDate } };
        if (church?._id) {
            filter.church = church._id;
        }
        const events = await EventInstance.find(filter)
            .populate('location', 'name address')
            .populate('eventId', 'name type')
            .select('title date location isCheckinOpen eventId startTime endTime')
            .sort({ date: 1 })
            .lean();
        // Add effectiveCheckinOpen to each event (display only)
        for (const event of events) {
            event.effectiveCheckinOpen = event.isCheckinOpen;
        }
        const appliedMonth = `${year}-${String(month).padStart(2, '0')}`;
        res.status(200).json({
            events,
            meta: {
                appliedMonth,
                rangeStart: startDate.toISOString(),
                rangeEnd: endDate.toISOString(),
            },
            churchTimezone: res.locals.churchTimezone
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Events']
*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
         // Delete the base event
        const deletedEvent = await Event.findByIdAndDelete(id);
        if (!deletedEvent) {return res.status(404).json({ error: 'Event not found' });}
        
        // Delete associated flier image if it exists
        if (deletedEvent.flier) {
            await deleteFile(deletedEvent.flier);
        }
        
        await EventInstance.deleteMany({ eventId: id });   // Delete all cached instances
        res.status(200).json({ message: 'Event deleted successfully', event: deletedEvent });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Events']
*/
router.put('/update-checkin-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { isCheckinOpen } = req.body;
        if (typeof isCheckinOpen !== 'boolean') {
            return res.status(400).json({ error: 'isCheckinOpen must be a boolean value.' });
        }
        // Find the specific event instance and update the field
        const updatedInstance = await EventInstance.findByIdAndUpdate( id,
            { $set: { isCheckinOpen: isCheckinOpen } },
            { new: true, runValidators: true }
        );
        if (!updatedInstance) {
            return res.status(404).json({ error: 'Event instance not found.' });
        }
        const statusMessage = isCheckinOpen ? 'open' : 'closed';
        res.status(200).json({
            message: `Check-in for instance "${updatedInstance.title}" on ${updatedInstance.date.toDateString()} is now ${statusMessage}.`,
            eventInstance: updatedInstance
        });
    } catch (err) {
        console.error('Error updating check-in status:', err);
        res.status(500).json({ error: 'Server error occurred while updating check-in status.' });
    }
});

router.get('/main/find/:id', attachTimezone, async(req, res) => {
    const { id } = req.params;
    const event = await Event.findById(id).lean();
    if (!event){ return res.status(404).json({ message: `Event with id ${id} not found` });}
    res.json({ event, timezone: res.locals.churchTimezone });
});

router.get('/main/list', attachTimezone, async(req, res) => {
    try {
        const church = req.church;
        if (!church) {
            return res.status(400).json({ message: 'Church context required' });
        }

        // Use UTC for all date/time handling
        let year, month;
        if (req.query.date) {
            const parsedParts = parseYearMonthFromDateInput(req.query.date);
            if (parsedParts) {
                year = parsedParts.year;
                month = parsedParts.month;
            }
        }
        const now = new Date();
        if (!year || !month) {
            year = now.getUTCFullYear();
            month = now.getUTCMonth() + 1;
        }
        // Month boundaries in UTC
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 1));
        const filter = {
            endDate: { $gte: startDate },
            startDate: { $lt: endDate },
        };
        if (church?._id) {
            filter.church = church._id;
        }
        const events = await Event.find(filter).sort({ startDate: 1 }).lean();
        const appliedMonth = `${year}-${String(month).padStart(2, '0')}`;

        res.status(200).json({
            events,
            meta: {
                appliedMonth,
                rangeStart: startDate.toISOString(),
                rangeEnd: endDate.toISOString(),
            },
            churchTimezone: res.locals.churchTimezone
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/*
#swagger.tags = ['Events']
*/
router.get('/findByDate/:date/:church', async(req, res) => {
    const { church, date, to } = req.params;
    const event = await EventService.getEvents({ from:date,to, church });
    if (!event){ return res.status(event.code || 500).json({  error: event.error , message: `Event with date ${date} not found` });}
    res.json({ event });
});
/*
#swagger.tags = ['Events']
*/
router.get('/findByDate/:date', async(req, res) => {
    const { church, date, to } = req.params;
    const event = await EventService.getEvents({ from:date,to, church });
    if (!event){ return res.status(event.code || 500).json({  error: event.error , message: `Event with date ${date} not found` });}
    res.json({ event });
});
/*
#swagger.tags = ['Events']
*/
router.get('/events', async (req, res) => {
  const { from, to, church } = req.query;
  const result = await EventService.getEvents({ from, to, church });
  if (!result.success) {
    return res.status(result.code || 500).json({ error: result.error });
  }
  res.json(result);
});
module.exports = router;
