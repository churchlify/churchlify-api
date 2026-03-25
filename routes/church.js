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
const { normalizeAddressPayload } = require('../middlewares/addressNormalizer');
const {uploadImage, deleteFile, uploadToMinio} = require('../common/upload');
const { cleanupChurchData } = require('../common/church.cleanup.service');
const router = express.Router();

const uploadChurchImageStrict = (req, res, next) => {
    uploadImage(req, res, (err) => {
        if (err) {
            return res.status(422).json({
                errors: [{ msg: err.message || 'Invalid image upload payload.' }]
            });
        }

        return next();
    });
};
/*
#swagger.tags = ['Church']
*/

async function createChurchRecord(churchData, res, uploadedLogoUrl = null) {
    let session;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
        const newChurch = new Church(churchData);
        await newChurch.save({ session });
        const updatedUser = await User.findByIdAndUpdate(
            churchData.createdBy,
            { church: newChurch._id, adminAt: newChurch._id },
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
        if (uploadedLogoUrl) {
            try {
                await deleteFile(uploadedLogoUrl, { throwOnError: true });
            } catch (cleanupError) {
                console.error('Failed to cleanup uploaded church logo after transaction abort:', cleanupError);
            }
        }
        console.error('Transaction aborted:', error);
        if (error.code === 11000) {
            return res.status(409).json({ message: 'A record with this email or phone already exists.' });
        }
        return res.status(500).json({ error: error.message || 'Database transaction failed.' });
    }
}

/*
#swagger.tags = ['Church']
*/
router.post('/create', uploadChurchImageStrict, normalizeAddressPayload, validateChurch(), async (req, res) => {
    let logoUrl = null;
  try {
    const { name, shortName, createdBy, emailAddress, phoneNumber, timeZone, themeSettings } = req.body;
    const address = req.body.address || null;
    const [existingEmail, existingPhone, existingUser] = await Promise.all([
      Church.findOne({ emailAddress }),
      Church.findOne({ phoneNumber }),
      Church.findOne({ createdBy }),
    ]);

    if (existingEmail){ return res.status(422).json({ errors: [{ msg: `Email ${emailAddress} exists` }] });}
    if (existingPhone){ return res.status(422).json({ errors: [{ msg: `Phone ${phoneNumber} exists` }] });}
    if (existingUser) {return res.status(422).json({ errors: [{ msg: 'User already affiliated' }] });}

    // --- REFACTORED FOR MINIO ---
    if (req.file) {
      logoUrl = await uploadToMinio(req.file);
    }

    await createChurchRecord({
        name, shortName, createdBy, emailAddress, phoneNumber, address, logo: logoUrl, timeZone,
        ...(themeSettings && { themeSettings })
        }, res, logoUrl);

    } catch (err) {
        if (logoUrl) {
            try {
                await deleteFile(logoUrl, { throwOnError: true });
            } catch (cleanupErr) {
                console.error('Failed to cleanup uploaded church logo after create failure:', cleanupErr);
            }
        }
    res.status(400).json({ error: err.message });
  }
});

/*
#swagger.tags = ['Church']
*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const church = await Church.findById(id).lean();
    if (!church) {return res.status(400).json({ message: `Church with id ${id} not found` });}
    res.json({ church });
});
/*
#swagger.tags = ['Church']
*/
router.patch('/update/:churchId', uploadChurchImageStrict, normalizeAddressPayload, async (req, res) => {
    let newLogoUrl = null;
    let oldLogoUrl = null;
    let session;
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
            newLogoUrl = await uploadToMinio(req.file);
            updateObject.logo = newLogoUrl;
            oldLogoUrl = existingChurch.logo || null;
        }

        if (Object.keys(updateObject).length === 0) {
            return res.status(400).json({ errors: [{ msg: 'No valid update fields provided.' }] });
        }

        if (updateObject.emailAddress || updateObject.phoneNumber) {
            const duplicate = await Church.findOne({
                $or: [
                    updateObject.emailAddress ? { emailAddress: updateObject.emailAddress } : {},
                    updateObject.phoneNumber ? { phoneNumber: updateObject.phoneNumber } : {}
                ],
                _id: { $ne: churchId }
            });
            if (duplicate) {
                const field = duplicate.emailAddress === updateObject.emailAddress ? 'Email' : 'Phone';
                if (newLogoUrl) {
                    try {
                        await deleteFile(newLogoUrl, { throwOnError: true });
                    } catch (cleanupErr) {
                        console.error('Failed to cleanup uploaded church logo after duplicate check:', cleanupErr);
                    }
                }
                return res.status(422).json({ errors: [{ msg: `${field} already exists with another church.` }] });
            }
        }

        session = await mongoose.startSession();
        session.startTransaction();

        const updatedChurch = await Church.findByIdAndUpdate(
            churchId,
            { $set: updateObject },
            { new: true, runValidators: true, session }
        );

        if (!updatedChurch) {
            throw new Error('Church not found during update transaction.');
        }

        if (newLogoUrl && oldLogoUrl && oldLogoUrl !== newLogoUrl) {
            await deleteFile(oldLogoUrl, { throwOnError: true });
        }

        await session.commitTransaction();
        session.endSession();
        session = null;

        return res.status(200).json({
            message: 'Church updated successfully',
            church: updatedChurch
        });

    } catch (err) {
        if (session) {
            await session.abortTransaction();
            session.endSession();
        }
        if (newLogoUrl) {
            try {
                await deleteFile(newLogoUrl, { throwOnError: true });
            } catch (cleanupErr) {
                console.error('Failed to cleanup newly uploaded church logo after rollback:', cleanupErr);
            }
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
        const churches = await Church.find({isPublished: true}).select('name shortName emailAddress phoneNumber address timeZone').lean();
        res.status(200).json({ churches });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/search', async (req, res) => {
  try {
    const { search = '', page = 0, limit = 25 } = req.query;

    // Convert page/limit to numbers
    const pageNum = parseInt(page, 10) || 0;
    const limitNum = parseInt(limit, 10) || 25;

    // Create case-insensitive search filter
const searchFilter = {
  isPublished: true,
  ...(search && {
    $or: [
      { name: { $regex: search, $options: 'i' } },
      { 'address.city': { $regex: search, $options: 'i' } },
      { 'address.state': { $regex: search, $options: 'i' } },
      { 'address.country': { $regex: search, $options: 'i' } },
    ],
  }),
};

    // Fetch paginated results
    const churches = await Church.find(searchFilter)
      .select('name shortName address.city address.state address.country')
      .sort({ name: 1 })
      .skip(pageNum * limitNum)
      .limit(limitNum)
      .lean();

    // Optional: get total count for client pagination
    const total = await Church.countDocuments(searchFilter);

    res.status(200).json({
      churches,
      total,
      page: pageNum,
      hasMore: (pageNum + 1) * limitNum < total,
    });
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
        const previewOnly = req.query.preview === 'true';
        const confirmationToken = req.query.confirm;

        if (!previewOnly && confirmationToken !== 'DELETE_CHURCH') {
            return res.status(400).json({
                error: 'Deletion not confirmed. Pass confirm=DELETE_CHURCH to execute.',
                hint: 'Use preview=true first to inspect impact safely.'
            });
        }

        const result = await cleanupChurchData(id, { previewOnly });

        if (!result.deleted && !result.preview) {
            return res.status(404).json({ error: 'Church not found' });
        }

        if (result.preview) {
            return res.status(200).json({
                message: 'Preview generated. No data was deleted.',
                preview: true,
                summary: result.summary
            });
        }

        res.status(200).json({ message: 'Church deleted successfully', preview: false, summary: result.summary });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
