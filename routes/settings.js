const express = require('express');
const Setting = require('../models/settings');
const { validateSettings } = require('../middlewares/validators');
const { arrSecrets, encrypt, decrypt, isSecret, getPaymentKey } = require('../common/shared');
const router = express.Router();
router.use(express.json());

router.post('/create', validateSettings(), async (req, res) => {
  const { church, key, value } = req.body;
  const safeValue = isSecret(key) ? encrypt(value) : value;
  const newItem = new Setting({ church, key, value:safeValue});
  try {
    await newItem.save();
    res.status(201).json({ message: 'Settings registered successfully', setting: newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/find/:id', async (req, res) => {
  const { id } = req.params;
  const setting = await Setting.findById(id).populate('church');
  if (!setting){ return res.status(404).json({ message: `Setting with id ${id} not found` });}
  res.json({ setting });
});

router.patch('/update/:id', async (req, res) => {
  const { id } = req.params;
  const { value, ...rest } = req.body;
  try {
    const setting = await Setting.findById(id);
    if (!setting) {
      return res.status(404).json({ message: `Setting with id ${id} not found` });
    }
    Object.assign(setting, rest);
    if (value !== undefined) {
      const safeValue = isSecret(setting.key) ? encrypt(value) : value;
      setting.value = safeValue;
    }
    await setting.save();
    res.status(200).json({
      message: 'Record updated successfully',
      setting
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const church = req.church;
    let filter = {};
    if(church) { filter.church = church._id; }
    const settings = await Setting.find(filter).populate('church');
    const filteredSettings = settings.filter(setting => {
      const key = setting.key?.toLowerCase() || '';
      return !arrSecrets.some(sub => key.includes(sub.toLowerCase()));
    });
    res.status(200).json({ settings:filteredSettings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/payment', async (req, res) => {
  try {
    // clientKey is paypalClientId or stripePublishableKey or paystackSecretKey
    const regex = arrSecrets.join('|');
    const church = req.church;
    let filter = { key: { $regex: regex, $options: 'i' }};
    if(church) { filter.church = church._id; }
    const settings = await Setting.findOne(filter);
    if (!settings){ return res.status(404).json({ message: 'Payment settings not found' });}
    const decryptedData =  decrypt(settings.value, settings.keyVersion);
    //console.log(decryptedData)
    const key = getPaymentKey(decryptedData);
    res.status(200).json({ key, provider: decryptedData.provider});
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSetting = await Setting.findByIdAndDelete(id);
    if (!deletedSetting) {return res.status(404).json({ error: 'Setting not found' });}
    res.status(200).json({ message: 'Setting deleted successfully', setting: deletedSetting });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;