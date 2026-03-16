const UserDeletionRequest = require('../models/userDeletionRequest');
const { cleanupUserData } = require('./user.cleanup.service');

class UserDeletionWorker {
  constructor() {
    this.isRunning = false;
    this.isTickInProgress = false;
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('User deletion worker started');

    await this._run();

    // Run every hour to execute due deletion requests.
    setInterval(() => this._run(), 60 * 60 * 1000);
  }

  async _run() {
    if (this.isTickInProgress) {
      return;
    }

    this.isTickInProgress = true;

    try {
      const now = new Date();
      const dueRequests = await UserDeletionRequest.find({
        status: { $in: ['pending', 'blocked', 'failed'] },
        executeAfter: { $lte: now }
      })
        .select('_id userId attempts')
        .sort({ executeAfter: 1 })
        .limit(100)
        .lean();

      for (const request of dueRequests) {
        await this._processRequest(request);
      }
    } catch (error) {
      console.error('User deletion worker error:', error);
    } finally {
      this.isTickInProgress = false;
    }
  }

  async _processRequest(request) {
    const claimed = await UserDeletionRequest.findOneAndUpdate(
      {
        _id: request._id,
        status: { $in: ['pending', 'blocked', 'failed'] }
      },
      {
        $set: {
          status: 'processing',
          lastError: null
        },
        $inc: { attempts: 1 }
      },
      { new: true }
    ).lean();

    if (!claimed) {
      return;
    }

    try {
      const result = await cleanupUserData(claimed.userId.toString(), { previewOnly: false });

      if (result.deleted || (!result.deleted && !result.blocked)) {
        await UserDeletionRequest.deleteOne({ _id: claimed._id });
        return;
      }

      if (result.blocked) {
        await UserDeletionRequest.findByIdAndUpdate(claimed._id, {
          $set: {
            status: 'blocked',
            lastError: 'Deletion still blocked by required references.',
            summarySnapshot: result.summary
          }
        });
      }
    } catch (error) {
      await UserDeletionRequest.findByIdAndUpdate(claimed._id, {
        $set: {
          status: 'failed',
          lastError: error.message
        }
      });
    }
  }
}

module.exports = new UserDeletionWorker();
