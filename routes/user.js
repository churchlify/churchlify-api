/*
#swagger.tags = ['User']
*/
// routes/user.js
const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/user');
const { validateUser } = require('../middlewares/validators');
const { cacheRoute } = require('../middlewares/tenantCache');
const { uploadImage, deleteFile, uploadToMinio } = require('../common/upload');
const { del: delCache } = require('../common/cache');
const router = express.Router();

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/*
#swagger.tags = ['User']
*/
router.post('/create', uploadImage, validateUser(), async (req, res) => {
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
router.patch('/update/:id', uploadImage, async (req, res) => {
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

        if (newPhotoUrl && oldPhotoUrl && oldPhotoUrl !== newPhotoUrl) {
          await deleteFile(oldPhotoUrl, { throwOnError: true });
        }

        await session.commitTransaction();
        session.endSession();
        session = null;
        
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
    const userToDelete = await User.findById(id);
    
    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Clean up Minio photo if it exists
    if (userToDelete.photoUrl) {
        await deleteFile(userToDelete.photoUrl);
    }

    await User.findByIdAndDelete(id);
    
    // Invalidate church's user list cache
    if (userToDelete.church) {
      await delCache(userToDelete.church.toString(), 'users:list');
    }
    
    res.status(200).json({ message: 'User deleted successfully', user: userToDelete });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;