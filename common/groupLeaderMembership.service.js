const Assignment = require('../models/assignment');

async function ensureLeaderMembership({ leaderId, ministryId, fellowshipId }) {
  if (!leaderId) {
    return null;
  }

  if ((!!ministryId && !!fellowshipId) || (!ministryId && !fellowshipId)) {
    throw new Error('Exactly one of ministryId or fellowshipId is required to ensure leader membership.');
  }

  const filter = { userId: leaderId };
  const assignmentToInsert = {
    userId: leaderId,
    role: 'member',
    status: 'approved',
    note: 'pending',
    dateAssigned: new Date()
  };

  const assignmentToUpdate = {
    status: 'approved',
    note: 'pending'
  };

  if (ministryId) {
    filter.ministryId = ministryId;
    assignmentToInsert.ministryId = ministryId;
  }

  if (fellowshipId) {
    filter.fellowshipId = fellowshipId;
    assignmentToInsert.fellowshipId = fellowshipId;
  }

  try {
    return await Assignment.findOneAndUpdate(
      filter,
      { $set: assignmentToUpdate, $setOnInsert: assignmentToInsert },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error && error.code === 11000) {
      return Assignment.findOne(filter);
    }
    throw error;
  }
}

module.exports = {
  ensureLeaderMembership
};
