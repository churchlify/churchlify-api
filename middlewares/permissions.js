// middlewares/permissions.js
const User = require('../models/user');
const Ministry = require('../models/ministry');
const Fellowship = require('../models/fellowship');
const Assignment = require('../models/assignment');

/**
 * Get current user from Firebase UID
 */
async function getCurrentUser(req) {
  const firebaseUid = req.user?.uid;
  if (!firebaseUid) {
    return null;
  }
  return User.findOne({ firebaseId: firebaseUid }).lean();
}

/**
 * Check if user has super or admin role
 */
function isSuperOrAdmin(user) {
  return user && (user.role === 'super' || user.role === 'admin');
}

/**
 * Check if user is leader of a specific ministry
 */
async function isMinistryLeader(userId, ministryId) {
  if (!userId || !ministryId) {
    return false;
  }

  const ministry = await Ministry.findById(ministryId).select('leaderId').lean();
  return ministry && String(ministry.leaderId) === String(userId);
}

/**
 * Check if user is leader of a specific fellowship
 */
async function isFellowshipLeader(userId, fellowshipId) {
  if (!userId || !fellowshipId) {
    return false;
  }

  const fellowship = await Fellowship.findById(fellowshipId).select('leaderId').lean();
  return fellowship && String(fellowship.leaderId) === String(userId);
}

async function canManageApprovalForGroup(currentUser, { ministryId, fellowshipId }) {
  if (isSuperOrAdmin(currentUser)) {
    return true;
  }

  if (ministryId) {
    return isMinistryLeader(currentUser._id, ministryId);
  }

  if (fellowshipId) {
    return isFellowshipLeader(currentUser._id, fellowshipId);
  }

  return false;
}

/**
 * Middleware: Require super or admin role
 */
const requireSuperOrAdmin = async (req, res, next) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!isSuperOrAdmin(currentUser)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This action requires admin or super privileges'
      });
    }

    req.currentUser = currentUser;
    next();
  } catch (error) {
    console.error('Permission check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware: Require super or admin OR ministry leader for specific ministry
 * Ministry ID can come from params, body, or query
 */
const requireSuperOrAdminOrMinistryLeader = async (req, res, next) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if super or admin first
    if (isSuperOrAdmin(currentUser)) {
      req.currentUser = currentUser;
      return next();
    }

    // Get ministry ID from various sources
    const ministryId = req.params.ministryId || req.body.ministryId || req.query.ministryId;

    if (!ministryId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Ministry ID is required'
      });
    }

    // Check if user is ministry leader
    const isLeader = await isMinistryLeader(currentUser._id, ministryId);

    if (!isLeader) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This action requires admin privileges or ministry leadership'
      });
    }

    req.currentUser = currentUser;
    next();
  } catch (error) {
    console.error('Permission check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware: Require super or admin OR fellowship leader for specific fellowship
 */
const requireSuperOrAdminOrFellowshipLeader = async (req, res, next) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if super or admin first
    if (isSuperOrAdmin(currentUser)) {
      req.currentUser = currentUser;
      return next();
    }

    // Get fellowship ID from various sources
    const fellowshipId = req.params.fellowshipId || req.body.fellowshipId || req.query.fellowshipId;

    if (!fellowshipId) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Fellowship ID is required'
      });
    }

    // Check if user is fellowship leader
    const isLeader = await isFellowshipLeader(currentUser._id, fellowshipId);

    if (!isLeader) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This action requires admin privileges or fellowship leadership'
      });
    }

    req.currentUser = currentUser;
    next();
  } catch (error) {
    console.error('Permission check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware: Require super or admin OR ministry leader for resource update/delete
 * This checks the ministry ID from the existing resource in the database
 */
const requireSuperOrAdminOrResourceMinistryLeader = (Model, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      const currentUser = await getCurrentUser(req);

      if (!currentUser) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if super or admin first
      if (isSuperOrAdmin(currentUser)) {
        req.currentUser = currentUser;
        return next();
      }

      // Get the resource
      const resourceId = req.params[resourceIdParam];

      if (!resourceId) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Resource ID is required'
        });
      }

      const resource = await Model.findById(resourceId).select('ministryId').lean();

      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      if (!resource.ministryId) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Resource does not belong to a ministry'
        });
      }

      // Check if user is ministry leader
      const isLeader = await isMinistryLeader(currentUser._id, resource.ministryId);

      if (!isLeader) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'This action requires admin privileges or ministry leadership'
        });
      }

      req.currentUser = currentUser;
      req.resource = resource;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Middleware: Require super or admin OR fellowship leader for resource update/delete
 * This checks the fellowship ID from the existing resource (Fellowship model)
 */
const requireSuperOrAdminOrResourceFellowshipLeader = (Model, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      const currentUser = await getCurrentUser(req);

      if (!currentUser) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Check if super or admin first
      if (isSuperOrAdmin(currentUser)) {
        req.currentUser = currentUser;
        return next();
      }

      // Get the resource
      const resourceId = req.params[resourceIdParam];

      if (!resourceId) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Resource ID is required'
        });
      }

      const resource = await Model.findById(resourceId).select('leaderId').lean();

      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      // Check if user is fellowship leader
      const isLeader = String(resource.leaderId) === String(currentUser._id);

      if (!isLeader) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'This action requires admin privileges or fellowship leadership'
        });
      }

      req.currentUser = currentUser;
      req.resource = resource;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Middleware: Check ministry membership or leadership
 * Used for read operations
 */
const requireMinistryAccess = async (req, res, next) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Super and admin can access all
    if (isSuperOrAdmin(currentUser)) {
      req.currentUser = currentUser;
      return next();
    }

    const ministryId = req.params.ministryId || req.params.id || req.query.ministryId;

    if (ministryId) {
      // Check if user is leader
      const isLeader = await isMinistryLeader(currentUser._id, ministryId);

      if (isLeader) {
        req.currentUser = currentUser;
        return next();
      }

      // Check if user is a member (has approved assignment)
      const Assignment = require('../models/assignment');
      const isMember = await Assignment.exists({
        userId: currentUser._id,
        ministryId: ministryId,
        status: 'approved'
      });

      if (isMember) {
        req.currentUser = currentUser;
        return next();
      }

      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this ministry'
      });
    }

    // If no specific ministry, just ensure authenticated
    req.currentUser = currentUser;
    next();
  } catch (error) {
    console.error('Permission check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware: Allow any authenticated user to create pending assignments.
 * Creating a non-pending assignment requires super/admin or group leader privileges.
 */
const requireAssignmentCreatePermission = async (req, res, next) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const status = req.body?.status || 'pending';
    if (status === 'pending') {
      req.currentUser = currentUser;
      return next();
    }

    const allowed = await canManageApprovalForGroup(currentUser, {
      ministryId: req.body?.ministryId,
      fellowshipId: req.body?.fellowshipId,
    });

    if (!allowed) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admin/super or the group leader can create non-pending assignments',
      });
    }

    req.currentUser = currentUser;
    return next();
  } catch (error) {
    console.error('Permission check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware: Allow any authenticated user to perform non-approval updates.
 * Updating an assignment to approved requires super/admin or group leader privileges.
 */
const requireAssignmentUpdatePermission = async (req, res, next) => {
  try {
    const currentUser = await getCurrentUser(req);

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.body?.status !== 'approved') {
      req.currentUser = currentUser;
      return next();
    }

    let ministryId = req.body?.ministryId;
    let fellowshipId = req.body?.fellowshipId;

    if (!ministryId && !fellowshipId) {
      const assignmentId = req.params?.id;
      if (!assignmentId) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Assignment ID is required',
        });
      }

      const assignment = await Assignment.findById(assignmentId)
        .select('ministryId fellowshipId')
        .lean();

      if (!assignment) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      ministryId = assignment.ministryId;
      fellowshipId = assignment.fellowshipId;
    }

    const allowed = await canManageApprovalForGroup(currentUser, {
      ministryId,
      fellowshipId,
    });

    if (!allowed) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admin/super or the group leader can approve assignments',
      });
    }

    req.currentUser = currentUser;
    return next();
  } catch (error) {
    console.error('Permission check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getCurrentUser,
  isSuperOrAdmin,
  isMinistryLeader,
  isFellowshipLeader,
  requireSuperOrAdmin,
  requireSuperOrAdminOrMinistryLeader,
  requireSuperOrAdminOrFellowshipLeader,
  requireSuperOrAdminOrResourceMinistryLeader,
  requireSuperOrAdminOrResourceFellowshipLeader,
  requireMinistryAccess,
  requireAssignmentCreatePermission,
  requireAssignmentUpdatePermission
};
