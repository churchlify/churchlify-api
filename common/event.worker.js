const EventService = require('./event.service');
const mongoose = require('mongoose');

class EventWorker {
  constructor() {
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('Event worker started');
    await this._run();
    
    // Run every hour
    setInterval(() => this._run(), 60 * 60 * 1000);
  }

  async _run() {
    try {
      await this._generateFutureInstances();
      await this._cleanupPastInstances();
    } catch (error) {
      console.error('Event worker error:', error);
    }
  }

  async _generateFutureInstances() {
    const now = new Date();
    
    // Find recurring events that need instance generation
    const recurringEvents = await mongoose.model('Events').find({
      isRecurring: true,
      isInstance: false,
      $or: [
        { nextCheckDate: { $lte: now } },
        { nextCheckDate: { $exists: false } }
      ]
    });

    for (const event of recurringEvents) {
      try {
        await EventService._generateInstances(event, 6);
        
        // Update next check date
        const nextCheckDate = new Date();
        nextCheckDate.setMonth(nextCheckDate.getMonth() + 3);
        event.nextCheckDate = nextCheckDate;
        await event.save();
      } catch (error) {
        console.error(`Error generating instances for event ${event._id}:`, error);
      }
    }
  }

  async _cleanupPastInstances() {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    await mongoose.model('Events').deleteMany({
      isInstance: true,
      endDate: { $lt: oneMonthAgo }
    });
  }
}

module.exports = new EventWorker();