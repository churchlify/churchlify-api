/*
#swagger.tags = ['User']
*/
// routes/user.js
const express = require('express');
const User = require('../models/user');

const { validateUser } = require('../middlewares/validators');
const {uploadImage, deleteFile} = require('../common/upload');
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
    
    if (req.file) {
        newUser.photoUrl = `${process.env.API_BASE_URL}/uploads/${req.file.filename}`;
    } else if (req.body.photoUrl) {
        newUser.photoUrl = req.body.photoUrl;
    }

    const newItem = new User(newUser);

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
        
        await newItem.save();

        res.status(201).json({ 
            message: 'User registered successfully', 
            user: newItem 
        });

    } catch (err) {
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
  const user = await User.findById(id).populate('church');
  if (!user) {
    return res.status(404).json({ message: `User with id ${id} not found` });
  }
  res.json({ user });
});

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

    const users = await User.find(filter);

    if (users.length === 0) {
      return res.status(404).json({ message: 'No matching users found' });
    }

    res.json({ users });
  } catch (error) {
    // This now safely catches errors from the find operation and general issues
    console.error('Search error (Caught by Route Handler):', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/*
#swagger.tags = ['User']
*/
router.get('/findByUid/:firebaseId', async (req, res) => {
  const { firebaseId } = req.params;
  const user = await User.findOne({ firebaseId });
  if (!user) {
    return res
      .status(404)
      .json({ message: `User with firebaseId ${firebaseId} not found` });
  }
  res.json({ user });
});
/*
#swagger.tags = ['User']
*/
router.put('/update/:id', validateUser(), async (req, res) => {
  const { id } = req.params;
  const {
    church,
    firstName,
    lastName,
    emailAddress,
    phoneNumber,
    address,
    gender,
    dateOfBirth,
    isMarried,
    anniversaryDate,
    isChurchAdmin,
    role,
  } = req.body;
  try {
    const updatedUser = await User.findByIdAndUpdate(
      id,
      {
        $set: {
          church,
          firstName,
          lastName,
          emailAddress,
          phoneNumber,
          address,
          gender,
          dateOfBirth,
          isMarried,
          anniversaryDate,
          isChurchAdmin,
          role,
        },
      },
      { new: true, runValidators: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ message: `User with id ${id} not found` });
    }
    res
      .status(200)
      .json({ message: 'Record updated successfully', user: updatedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
#swagger.tags = ['User']
*/
router.patch('/update/:id', uploadImage, async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const updateObject = {}; 

    try {
        const existingUser = await User.findById(id);
        if (!existingUser) {
            return res.status(404).json({ errors: [{ msg: 'User not found.' }] });
        }

        for (const key in updates) {
            if (updates[key] !== undefined && key !== '_id' && key !== 'password') {
                updateObject[key] = updates[key];
            }
        }

        if (req.file) {
            updateObject.photoUrl = `${process.env.API_BASE_URL}/uploads/${req.file.filename}`;
          
            if (existingUser.photoUrl) {
                await deleteFile(existingUser.photoUrl); 
            }
        }

        if (Object.keys(updateObject).length === 0) {
            return res.status(400).json({ errors: [{ msg: 'No valid update fields or file provided.' }] });
        }

        if (updateObject.email) {
            const emailExists = await User.findOne({ 
                email: updateObject.email,
                _id: { $ne: id } 
            });
            
            if (emailExists) {
                return res.status(422).json({ errors: [{ msg: `Email ${updateObject.email} already registered by another user.` }] });
            }
        }

        const updatedUser = await User.findByIdAndUpdate(
            id,
            { $set: updateObject },
            { new: true, runValidators: true }
        );
        
        if (!updatedUser) {
            return res.status(404).json({ errors: [{ msg: 'User not found.' }] });
        }

        res.status(200).json({
            message: 'User record updated successfully',
            user: updatedUser
        });

    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(422).json({ errors: [{ msg: err.message }] });
        }
        if (err.kind === 'ObjectId') {
             return res.status(404).json({ errors: [{ msg: 'Invalid User ID format.' }] });
        }
        console.error(err);
        res.status(500).json({ errors: [{ msg: 'Server error during user update.' }] });
    }
});

/*
#swagger.tags = ['User']
*/
router.get('/list', async (req, res) => {
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
    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    res
      .status(200)
      .json({ message: 'User deleted successfully', user: deletedUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
