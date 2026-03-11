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
const { getChurchTimezone, parseChurchDate, getMonthBoundaries, nowInChurchTz } = require('../common/timezone.helper');
//const event = require('../models/event');
const router = express.Router();
router.use(express.json());

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

        // Get church timezone for proper date parsing
        const timezone = await getChurchTimezone(church);
        const resolvedEndDate = recurrence?.endDate ? parseChurchDate(recurrence.endDate, timezone) : parseChurchDate(endDate, timezone);

        const eventData = {
            church,
            title,
            description,
            startDate: parseChurchDate(startDate, timezone),
            startTime,
            endDate: resolvedEndDate,
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
                daysOfWeek: recurrence.daysOfWeek || [], // For weekly recurrence
                endDate: recurrence.endDate ? parseChurchDate(recurrence.endDate, timezone) : null
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
router.get('/find/:id', async(req, res) => {
        const { id } = req.params;
        const event = await EventInstance.findById(id).populate('location').lean();
        if (!event){ return res.status(404).json({ message: `Event with id ${id} not found` });}
        // Compute effective checkin open
        const timezone = event?.church?.timeZone || 'UTC';
        const now = require('moment-timezone').tz(timezone);
        event.effectiveCheckinOpen = event.isCheckinOpen || (event.date && event.startTime && (() => {
            const eventDateInTz = require('moment-timezone').tz(event.date, timezone).format('YYYY-MM-DD');
            const eventStart = require('moment-timezone').tz(`${eventDateInTz} ${event.startTime}`, ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD HH:mm:ss'], timezone);
            if (!eventStart.isValid()) { return false; }
            const twoHoursFromNow = now.clone().add(2, 'hours');
            return eventStart.isSameOrAfter(now) && eventStart.isSameOrBefore(twoHoursFromNow);
        })());
        res.json({ event });
});
/*
#swagger.tags = ['Events']
*/
router.get('/upcoming', async (req, res) => {
    try {
        const church = req.church;
        if (!church) {
            return res.status(400).json({ message: 'Church context required' });
        }
        // Get current time in church timezone
        const timezone = church.timeZone || 'UTC';
        const now = require('moment-timezone').tz(timezone);
        let filter = {date: { $gte: now.toDate() }};
        if(church) { filter.church = church._id; }
        const event = await EventInstance.findOne(filter).populate('location').select('title date startTime location isCheckinOpen').sort({ date: 1 }).lean();
        if (event) {
                    event.effectiveCheckinOpen = event.isCheckinOpen || (event.date && event.startTime && (() => {
                        const eventDateInTz = require('moment-timezone').tz(event.date, timezone).format('YYYY-MM-DD');
                        const eventStart = require('moment-timezone').tz(`${eventDateInTz} ${event.startTime}`, ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD HH:mm:ss'], timezone);
                        if (!eventStart.isValid()) { return false; }
                        const twoHoursFromNow = now.clone().add(2, 'hours');
                        return eventStart.isSameOrAfter(now) && eventStart.isSameOrBefore(twoHoursFromNow);
                    })());
        }
        res.json({ event });
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
      updateFields[field] = req.body[field];
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
router.get('/list', async(req, res) => {
    try {
        const church = req.church;
        if (!church) {
            return res.status(400).json({ message: 'Church context required' });
        }
        // Get church timezone for proper month calculation
        const timezone = church.timeZone || 'UTC';
        const inputMoment = require('moment-timezone').tz(timezone);
        const parsedParts = parseYearMonthFromDateInput(req.query.date);
        if (parsedParts) {
            inputMoment.year(parsedParts.year).month(parsedParts.month - 1);
        }
        const { startDate, endDate } = getMonthBoundaries(
            inputMoment.year(),
            inputMoment.month() + 1,
            timezone
        );
        const filter = { date: { $gte: startDate, $lte: endDate } };
        if (church?._id) {
            filter.church = church._id;
        }
        const events = await EventInstance.find(filter)
            .populate('location', 'name address')
            .populate('eventId', 'name type')
            .select('title date location isCheckinOpen eventId')
            .sort({ date: 1 })
            .lean();
        // Add effectiveCheckinOpen to each event
        const now = require('moment-timezone').tz(timezone);
        for (const event of events) {
                    event.effectiveCheckinOpen = event.isCheckinOpen || (event.date && event.startTime && (() => {
                        const eventDateInTz = require('moment-timezone').tz(event.date, timezone).format('YYYY-MM-DD');
                        const eventStart = require('moment-timezone').tz(`${eventDateInTz} ${event.startTime}`, ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD HH:mm:ss'], timezone);
                        if (!eventStart.isValid()) { return false; }
                        const twoHoursFromNow = now.clone().add(2, 'hours');
                        return eventStart.isSameOrAfter(now) && eventStart.isSameOrBefore(twoHoursFromNow);
                    })());
        }
        const appliedMonth = `${inputMoment.year()}-${String(inputMoment.month() + 1).padStart(2, '0')}`;
        res.status(200).json({
            events,
            meta: {
                appliedTimezone: timezone,
                appliedMonth,
                rangeStart: startDate.toISOString(),
                rangeEnd: endDate.toISOString(),
            },
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

router.get('/main/find/:id', async(req, res) => {
    const { id } = req.params;
    const event = await Event.findById(id).lean();
    if (!event){ return res.status(404).json({ message: `Event with id ${id} not found` });}
    res.json({ event });
});

router.get('/main/list', async(req, res) => {
    try {
        const church = req.church;
        if (!church) {
            return res.status(400).json({ message: 'Church context required' });
        }

        const timezone = church.timeZone || 'UTC';
        const inputMoment = nowInChurchTz(timezone);
        const parsedParts = parseYearMonthFromDateInput(req.query.date);
        if (parsedParts) {
            inputMoment.year(parsedParts.year).month(parsedParts.month - 1);
        }

        const { startDate, endDate } = getMonthBoundaries(
            inputMoment.year(),
            inputMoment.month() + 1,
            timezone
        );

        const filter = {
            endDate: { $gte: startDate },
            startDate: { $lte: endDate },
        };
        if (church?._id) {
            filter.church = church._id;
        }
        const events = await Event.find(filter).sort({ startDate: 1 }).lean();
        const appliedMonth = `${inputMoment.year()}-${String(inputMoment.month() + 1).padStart(2, '0')}`;

        res.status(200).json({
            events,
            meta: {
                appliedTimezone: timezone,
                appliedMonth,
                rangeStart: startDate.toISOString(),
                rangeEnd: endDate.toISOString(),
            },
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
