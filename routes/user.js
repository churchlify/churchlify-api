/*
#swagger.tags = ['User']
*/
// routes/user.js
const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/user');
const { validateUser } = require('../middlewares/validators');
const { normalizeAddressPayload } = require('../middlewares/addressNormalizer');
const { cacheRoute } = require('../middlewares/tenantCache');
const { uploadImage, deleteFile, uploadToMinio } = require('../common/upload');
const { cleanupUserData } = require('../common/user.cleanup.service');
const UserDeletionRequest = require('../models/userDeletionRequest');
const router = express.Router();

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseRetainDays(value) {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return NaN;
  }

  return parsed;
}

/*
#swagger.tags = ['User']
*/
router.post('/create', uploadImage, normalizeAddressPayload, validateUser(), async (req, res) => {
    const {
        church, firstName, lastName, emailAddress, phoneNumber, address, gender, 
        dateOfBirth, isMarried, anniversaryDate, firebaseId, pushToken, role,
    } = req.body;

    const newUser = {
        church, firstName, lastName, emailAddress, phoneNumber, address, gender, 
        dateOfBirth, isMarried, anniversaryDate, firebaseId, pushToken, role,
    };
    let uploadedPhotoUrl = null;
    
    try {
        const existingEmail = await User.findOne({ emailAddress });
        if (existingEmail) {
            return res.status(422).json({ 
                errors: [{
                    type: 'auth_existing_email',
                    msg: `Record with email ${emailAddress} already exists.`,
                }],
            });
        }
        
        const existingPhone = await User.findOne({ phoneNumber });
        if (existingPhone) {
            return res.status(422).json({
                errors: [{
                    type: 'auth_existing_phone',
                    msg: `Record with phone number ${phoneNumber} already exists.`,
                }],
            });
        }

        // --- REFACTORED FOR MINIO ---
        if (req.file) {
          uploadedPhotoUrl = await uploadToMinio(req.file);
          newUser.photoUrl = uploadedPhotoUrl;
        } else if (req.body.photoUrl) {
            newUser.photoUrl = req.body.photoUrl;
        }

        const newItem = new User(newUser);
        await newItem.save();

        res.status(201).json({ 
            message: 'User registered successfully', 
            user: newItem 
        });

    } catch (err) {
      if (uploadedPhotoUrl) {
        try {
          await deleteFile(uploadedPhotoUrl, { throwOnError: true });
        } catch (cleanupErr) {
          console.error('Failed to cleanup uploaded user photo after create failure:', cleanupErr);
        }
      }
        if (err.name === 'ValidationError') {
            return res.status(422).json({ errors: [{ msg: err.message }] });
        }
        console.error(err);
        res.status(500).json({ errors: [{ msg: 'Server error during user registration.' }] });
    }
});

/*
#swagger.tags = ['User']
*/
router.get('/find/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findById(id).select('-password').lean();
    if (!user) {
      return res.status(404).json({ message: `User with id ${id} not found` });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/*
#swagger.tags = ['User']
*/
router.get('/search', async (req, res) => {
  const { q } = req.query;
  const church = req.church;

  try {
    if (!q) {
      return res.status(400).json({ error: 'Missing search query' });
    }
    const escapedQ = escapeRegExp(q);
    const regex = new RegExp(escapedQ, 'i');

    let filter = {
      $or: [{ firstName: regex }, { lastName: regex }],
    };
    if (church) {
      filter.church = church._id;
    }

    const users = await User.find(filter).select('firstName lastName phoneNumber emailAddress photoUrl').lean();

    if (users.length === 0) {
      return res.status(404).json({ message: 'No matching users found' });
    }

    res.json({ users });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/*
#swagger.tags = ['User']
*/
router.get('/findByUid/:firebaseId', async (req, res) => {
  try {
    const { firebaseId } = req.params;
    const user = await User.findOne({ firebaseId }).select('-password').lean();
    if (!user) {
      res.clearCookie('__session', { path: '/' })
        .clearCookie('__role', { path: '/' })
        .clearCookie('__user_exists', { path: '/' });

      return res.status(404).json({
        message: `User with firebaseId ${firebaseId} not found`,
        userExists: false,
      });
    }

    res
      .cookie('__session', firebaseId, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 86400 * 1000,
        path: '/',
      })
      .cookie('__role', user.role ?? '', {
        httpOnly: false,
        secure: true,
        sameSite: 'none',
        maxAge: 86400 * 1000,
        path: '/',
      })
      .cookie('__user_exists', 'true', {
        httpOnly: false,
        secure: true,
        sameSite: 'none',
        maxAge: 86400 * 1000,
        path: '/',
      });

    return res.status(200).json({ user });
  } catch (err) {
    console.error('findByUid error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/*
#swagger.tags = ['User']
*/
router.patch('/update/:id', uploadImage, normalizeAddressPayload, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
  const updateObject = {};
  let newPhotoUrl = null;
  let oldPhotoUrl = null;
  let session;

    try {
        const existingUser = await User.findById(id);
        if (!existingUser) {
            return res.status(404).json({ errors: [{ msg: 'User not found.' }] });
        }

        for (const key in updates) {
            // Avoid overwriting sensitive fields accidentally
            if (updates[key] !== undefined && key !== '_id' && key !== 'password') {
                updateObject[key] = updates[key];
            }
        }

        // --- REFACTORED FOR MINIO ---
        if (req.file) {
            // Upload new image
          newPhotoUrl = await uploadToMinio(req.file);
            updateObject.photoUrl = newPhotoUrl;
          oldPhotoUrl = existingUser.photoUrl || null;
        }

        if (Object.keys(updateObject).length === 0) {
            return res.status(400).json({ errors: [{ msg: 'No valid update fields or file provided.' }] });
        }

        // Validate unique email if it's being updated
        if (updateObject.emailAddress) {
            const emailExists = await User.findOne({ 
                emailAddress: updateObject.emailAddress,
                _id: { $ne: id } 
            });
            if (emailExists) {
            if (newPhotoUrl) {
              try {
                await deleteFile(newPhotoUrl, { throwOnError: true });
              } catch (cleanupErr) {
                console.error('Failed to cleanup uploaded user photo after duplicate email check:', cleanupErr);
              }
            }
                return res.status(422).json({ errors: [{ msg: `Email ${updateObject.emailAddress} is already in use.` }] });
            }
        }

        session = await mongoose.startSession();
        session.startTransaction();

        const transactionalUpdatedUser = await User.findByIdAndUpdate(
            id,
            { $set: updateObject },
            { new: true, runValidators: true, session }
        );

        if (!transactionalUpdatedUser) {
            throw new Error('User not found during update transaction.');
        }

        await session.commitTransaction();
        session.endSession();
        session = null;

        if (newPhotoUrl && oldPhotoUrl && oldPhotoUrl !== newPhotoUrl) {
          try {
            await deleteFile(oldPhotoUrl, { throwOnError: true });
          } catch (cleanupErr) {
            // Do not fail a successful DB update because old asset cleanup failed.
            console.error('Failed to cleanup replaced user photo:', cleanupErr);
          }
        }
        
        res.status(200).json({
            message: 'User record updated successfully',
            user: transactionalUpdatedUser
        });

    } catch (err) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
      if (newPhotoUrl) {
        try {
          await deleteFile(newPhotoUrl, { throwOnError: true });
        } catch (cleanupErr) {
          console.error('Failed to cleanup newly uploaded user photo after rollback:', cleanupErr);
        }
      }
        if (err.name === 'ValidationError') {
            return res.status(422).json({ errors: [{ msg: err.message }] });
        }
        console.error(err);
        res.status(500).json({ errors: [{ msg: 'Server error during user update.' }] });
    }
});

/*
#swagger.tags = ['User']
*/
router.get('/list', cacheRoute('users:list', 60), async (req, res) => {
  try {
    const church = req.church;
    let filter = {};
    if (church) {
      filter.church = church._id;
    }
    const users = await User.find(filter).populate('church');
    res.status(200).json({ users });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/*
#swagger.tags = ['User']
*/
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const previewOnly = req.query.preview === 'true';
    const confirmationToken = req.query.confirm;
    const retainDays = parseRetainDays(req.query.retainDays);

    if (Number.isNaN(retainDays)) {
      return res.status(400).json({ error: 'retainDays must be a positive integer when provided.' });
    }

    if (retainDays !== null && retainDays !== 30) {
      return res.status(400).json({
        error: 'Only retainDays=30 is currently supported.'
      });
    }

    if (!previewOnly && confirmationToken !== 'DELETE_USER') {
      return res.status(400).json({
        error: 'Deletion not confirmed. Pass confirm=DELETE_USER to execute.',
        hint: 'Use preview=true first to inspect impact safely.'
      });
    }

    if (previewOnly && retainDays === 30) {
      const previewResult = await cleanupUserData(id, { previewOnly: true });

      if (!previewResult.preview && !previewResult.deleted) {
        return res.status(404).json({ error: 'User not found' });
      }

      const retentionUntil = new Date();
      retentionUntil.setDate(retentionUntil.getDate() + 30);

      return res.status(200).json({
        message: 'Preview generated. No data was deleted.',
        preview: true,
        retention: {
          enabled: true,
          retainDays: 30,
          scheduledDeletionAt: retentionUntil
        },
        summary: previewResult.summary
      });
    }

    if (!previewOnly && retainDays === 30) {
      const previewResult = await cleanupUserData(id, { previewOnly: true });

      if (!previewResult.preview && !previewResult.deleted) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (previewResult.summary?.hasBlockingReferences) {
        return res.status(409).json({
          error: 'User deletion blocked. Reassign or remove blocking references first.',
          preview: false,
          summary: previewResult.summary,
          hint: 'Use preview=true to inspect blockingReferences.'
        });
      }

      const scheduledDeletionAt = new Date();
      scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + 30);

      await UserDeletionRequest.findOneAndUpdate(
        { userId: id },
        {
          $set: {
            retainDays: 30,
            executeAfter: scheduledDeletionAt,
            status: 'pending',
            lastError: null,
            summarySnapshot: previewResult.summary,
            requestedAt: new Date()
          },
          $setOnInsert: {
            attempts: 0
          }
        },
        { upsert: true, new: true }
      );

      return res.status(202).json({
        message: 'User deletion scheduled. Data will be retained for 30 days.',
        preview: false,
        retention: {
          enabled: true,
          retainDays: 30,
          scheduledDeletionAt
        },
        summary: previewResult.summary
      });
    }

    const result = await cleanupUserData(id, { previewOnly });

    if (result.deleted) {
      await UserDeletionRequest.deleteOne({ userId: id });
    }

    if (!result.deleted && !result.preview && !result.blocked) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (result.preview) {
      return res.status(200).json({
        message: 'Preview generated. No data was deleted.',
        preview: true,
        summary: result.summary
      });
    }

    if (result.blocked) {
      return res.status(409).json({
        error: 'User deletion blocked. Reassign or remove blocking references first.',
        preview: false,
        summary: result.summary,
        hint: 'Use preview=true to inspect blockingReferences.'
      });
    }

    res.status(200).json({
      message: 'User deleted successfully',
      preview: false,
      summary: result.summary
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;