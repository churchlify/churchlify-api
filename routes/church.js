/*
#swagger.tags = ['Church']
*/
// routes/churches.js
// const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const {validateChurch} = require('../middlewares/validators');
const mongoose = require('mongoose');
const express = require('express');
const Church = require('../models/church');
const User = require('../models/user');
const {uploadImage, deleteFile} = require('../common/upload');
const router = express.Router();
/*
#swagger.tags = ['Church']
*/

async function createChurchRecord(churchData, res) {
    let session;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
        const newChurch = new Church(churchData);
        await newChurch.save({ session });
        const updatedUser = await User.findByIdAndUpdate(
            churchData.createdBy,
            { church: newChurch._id, adminAt: newChurch._id }, // Link the new Church ID to the User
            { new: true, session }
        );
        if (!updatedUser) {
            throw new Error('User update failed: Affiliated user not found.');
        }
        await session.commitTransaction();
        session.endSession();
        return res.status(201).json({ 
            message: 'Church created and user updated successfully', 
            church: newChurch,
            user: updatedUser
        });

    } catch (error) {
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }     
        console.error('Transaction aborted:', error);
        if (error.code === 11000) { 
            return res.status(409).json({ message: 'A record with this email or phone already exists.' });
        }
        return res.status(500).json({ error: error.message || 'Database transaction failed.' });
    }
}

router.post('/create',uploadImage, validateChurch(), async (req, res) => {
  try {
    const { name, shortName, createdBy, emailAddress, phoneNumber, timeZone } = req.body;
    const address = req.body.address || null;
    const [existingEmail, existingPhone, existingUser] = await Promise.all([
      Church.findOne({ emailAddress }),
      Church.findOne({ phoneNumber }),
      Church.findOne({ createdBy }),
    ]);
    console.log(req.body);
    if (existingEmail) {return res.status(422).json({ errors: [{ msg: `Email ${emailAddress} exists` }] });}
    if (existingPhone) {return res.status(422).json({ errors: [{ msg: `Phone ${phoneNumber} exists` }] });}
    if (existingUser) {return res.status(422).json({ errors: [{ msg: 'User already affiliated' }] });}

    const logoUrl = req.file ? `${process.env.API_BASE_URL}/uploads/${req.file.filename}` : null;
    await createChurchRecord({ name, shortName, createdBy, emailAddress, phoneNumber, address, logo: logoUrl, timeZone }, res);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/*
#swagger.tags = ['Church']
*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const church = await Church.findById(id);
    if (!church) {return res.status(400).json({ message: `Church with id ${id} not found` });}
    res.json({ church });
});
/*
#swagger.tags = ['Church']
*/
router.patch('/update/:churchId', uploadImage, async (req, res) => {
    try {
        const { churchId } = req.params;
        const updates = req.body;
        const updateObject = {};
        const existingChurch = await Church.findById(churchId);
        if (!existingChurch) {
            return res.status(404).json({ errors: [{ msg: 'Church not found.' }] });
        }
        for (const key in updates) {
            if (updates[key] !== undefined && key !== '_id' && key !== 'createdBy') {
                updateObject[key] = updates[key];
            }
        }
        if (req.file) {
            updateObject.logo = `${process.env.API_BASE_URL}/uploads/${req.file.filename}`;
            if (existingChurch.logo) {
                await deleteFile(existingChurch.logo); // Deletes old file
            }
        }
        if (Object.keys(updateObject).length === 0) {
            return res.status(400).json({ errors: [{ msg: 'No valid update fields provided.' }] });
        }
        if (updateObject.emailAddress || updateObject.phoneNumber) {
            const existingChurch = await Church.findOne({
                $or: [
                    updateObject.emailAddress ? { emailAddress: updateObject.emailAddress } : {},
                    updateObject.phoneNumber ? { phoneNumber: updateObject.phoneNumber } : {}
                ],
                _id: { $ne: churchId } 
            });
            if (existingChurch) {
                if (existingChurch.emailAddress === updateObject.emailAddress) {
                    return res.status(422).json({ errors: [{ msg: `Email ${updateObject.emailAddress} already exists with another church.` }] });
                }
                if (existingChurch.phoneNumber === updateObject.phoneNumber) {
                    return res.status(422).json({ errors: [{ msg: `Phone ${updateObject.phoneNumber} already exists with another church.` }] });
                }
            }
        }
        const updatedChurch = await Church.findByIdAndUpdate(churchId, { $set: updateObject }, { new: true, runValidators: true } );
        if (!updatedChurch) {
            return res.status(404).json({ errors: [{ msg: 'Church not found.' }] });
        }

        return res.status(200).json({
            message: 'Church updated successfully',
            church: updatedChurch
        });

    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(422).json({ errors: [{ msg: err.message }] });
        }
        if (err.kind === 'ObjectId') {
             return res.status(404).json({ errors: [{ msg: 'Invalid Church ID format.' }] });
        }
        console.error(err);
        res.status(500).json({ error: 'Server error during church update.' });
    }
});
/*
#swagger.tags = ['Church']
*/
router.get('/list', async(req, res) => {
    try {
        const churches = await Church.find();
        res.status(200).json({ churches });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Church']
*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedItem = await Church.findByIdAndDelete(id);
        if (!deletedItem) {return res.status(404).json({ error: 'Churc not found' });}
        res.status(200).json({ message: 'Church deleted successfully', event: deletedItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
