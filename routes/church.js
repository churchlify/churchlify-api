/*
#swagger.tags = ['Church']
*/
// routes/churches.js
// const {authenticateFirebaseToken, authenticateToken} = require('../middlewares/auth');
const {validateChurch} = require('../middlewares/validators');
const express = require('express');
const Church = require('../models/church');
const User = require('../models/user');
const {uploadImage} = require('../common/shared');
const router = express.Router();
/*
#swagger.tags = ['Church']
*/
// Helper function to create church and update user
async function createChurchRecord(data, res) {
  try {
    const newItem = new Church(data);
    await newItem.save();
    await User.findByIdAndUpdate(data.createdBy, { church: newItem._id });
    res.status(201).json({ message: 'Church registered successfully', church: newItem });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create church record' });
  }
}

router.post('/create', validateChurch(), async (req, res) => {
  const { name, shortName, createdBy, emailAddress, phoneNumber, address, timeZone } = req.body;
  try {
    const [existingEmail, existingPhone, existingUser] = await Promise.all([
      Church.findOne({ emailAddress }),
      Church.findOne({ phoneNumber }),
      Church.findOne({ createdBy }),
    ]);

    if (existingEmail) {
      return res.status(422).json({
        errors: [{ type: 'auth_existing_email', msg: `Record with email ${emailAddress} already exists` }],
      });
    }

    if (existingPhone) {
      return res.status(422).json({
        errors: [{ type: 'auth_existing_phone', msg: `Record with phone number ${phoneNumber} already exists` }],
      });
    }

    if (existingUser) {
      return res.status(422).json({
        errors: [{ type: 'auth_existing_user', msg: 'Current User is currently affiliated to a church' }],
      });
    }

    // Handle logo upload only if logo is provided
    if (req.file) {
      uploadImage(req, res, async (err) => {
        if (err) { return res.status(400).json({ message: err }); }
        if (!req.file) { return res.status(400).json({ message: 'No file selected!' }); }
        await createChurchRecord({ name, shortName,createdBy,emailAddress,phoneNumber,address,
          logo: `${process.env.API_BASE_URL}/uploads/${req.file.filename}`, timeZone, }, res);
      });
    } else {
      await createChurchRecord({ name, shortName, createdBy, emailAddress, phoneNumber, address,timeZone,}, res);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/update-logo/:id', (req, res) => {
  uploadImage(req, res, async (err) => {
    if (err) {return res.status(400).json({ message: err });}
    if (!req.file) {return res.status(400).json({ message: 'No image uploaded!' });}
    try {
      const churchId = req.params.id;
      const logoUrl = `${process.env.API_BASE_URL}/uploads/${req.file.filename}`;
      const updated = await Church.findByIdAndUpdate( churchId, { logo: logoUrl }, { new: true });
      if (!updated) { return res.status(404).json({ message: 'Church not found' }); }
      res.status(200).json({ message: 'Logo updated successfully', logo: updated.logo });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
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
router.put('/update/:id',validateChurch(),  async(req, res) => {
    const { id } = req.params;
    const { name, shortName, createdBy, emailAddress, phoneNumber, address,logo, timeZone  } = req.body;
    try {
        const updatedChurch = await Church.findByIdAndUpdate(id, {$set: { name, shortName, createdBy, emailAddress, phoneNumber, address,logo, timeZone  }}, { new: true, runValidators: true });
        if (!updatedChurch) {
            return res.status(404).json({ message: `Church with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', church: updatedChurch });
    } catch (err) {
        res.status(400).json({ error: err.message });
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
