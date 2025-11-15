const express = require('express');
const mongoose = require('mongoose');
const Verification = require('../models/verification');
const Church = require('../models/church');
const { validateVerification } = require('../middlewares/validators');
const { uploadDocs } = require('../common/upload');
const router = express.Router();

router.post(
  '/create',
  uploadDocs([
    { name: 'governmentId', maxCount: 1 },
    { name: 'registrationProof', maxCount: 1 },
  ]),
  validateVerification(),
  async (req, res) => {
    try {
      const {
        incorporationNumber,
        craNumber,
        churchId,
        submittedBy,
        supportingDocs: rawSupportingDocs,
      } = req.body;

      // Check for existing pending verification
      const existing = await Verification.findOne({
        churchId,
        status: 'pending',
      });
      if (existing) {
        return res.status(422).json({
          errors: [{ msg: 'You already have a pending verification.' }],
        });
      }

      // Extract uploaded files
      const files = Object.values(req.files || {}).flat();
      const getFile = (field) => files.find((f) => f.fieldname === field);
      const governmentId = getFile('governmentId');
      const registrationProof = getFile('registrationProof');

      if (!governmentId || !registrationProof) {
        return res.status(400).json({
          errors: [
            { msg: 'Government ID and Proof of Registration are required.' },
          ],
        });
      }

      // Parse supportingDocs metadata
      let supportingDocsMeta = [];
      try {
        if (rawSupportingDocs) {
          supportingDocsMeta = JSON.parse(rawSupportingDocs);
        }
      } catch {
        console.warn('Invalid supportingDocs metadata');
      }

      // Map uploaded supportingDocs
      const supportingDocs = files
        .filter((f) => f.fieldname.startsWith('supportingDocs'))
        .map((f, i) => ({
          type: supportingDocsMeta[i]?.type || 'other',
          fileUrl: `${process.env.API_BASE_URL}/uploads/${f.filename}`,
          originalName: f.originalname,
        }));

      const submitter = submittedBy || req.headers['x-user'];
      const church = churchId || req.church._id;

      // Create and save verification
      const verification = new Verification({
        churchId: church,
        submittedBy: submitter,
        incorporationNumber,
        craNumber,
        governmentId: {
          fileUrl: `${process.env.API_BASE_URL}/uploads/${governmentId.filename}`,
          originalName: governmentId.originalname,
        },
        registrationProof: {
          fileUrl: `${process.env.API_BASE_URL}//uploads/${registrationProof.filename}`,
          originalName: registrationProof.originalname,
        },
        supportingDocs,
      });

      await verification.save();

      return res.status(201).json({
        message: 'Verification submitted successfully.',
        verification,
      });
    } catch (err) {
      console.error('Verification error:', err);
      return res.status(400).json({ error: err.message });
    }
  }
);

/*
#swagger.tags = ['Verification']
*/
router.get('/find/:churchId', async(req, res) => {
    const { churchId } = req.params;
    const request = await Verification.findOne({churchId});
    if (!request) {return res.status(400).json({ message: `Verification request for church  ${churchId} not found` });}
    res.json({ request });
});
/*
#swagger.tags = ['Verification']
*/
router.patch(
  '/update/:id',
  uploadDocs([
    { name: 'governmentId', maxCount: 1 },
    { name: 'registrationProof', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        incorporationNumber,
        craNumber,
        churchId,
        submittedBy,
        status,
        supportingDocs: rawSupportingDocs
      } = req.body;

      const verification = await Verification.findById(id);
      if (!verification) {
        return res.status(404).json({ error: 'Verification request not found.' });
      }

      // Extract uploaded files
      const files = Object.values(req.files || {}).flat();
      const getFile = (field) => files.find((f) => f.fieldname === field);

      const governmentId = getFile('governmentId');
      const registrationProof = getFile('registrationProof');

      // Parse supportingDocs metadata
      let supportingDocsMeta = [];
      try {
        if (rawSupportingDocs) {
          supportingDocsMeta = JSON.parse(rawSupportingDocs);
        }
      } catch {
        console.warn('Invalid supportingDocs metadata');
      }

      const supportingDocs = files
        .filter((f) => f.fieldname.startsWith('supportingDocs'))
        .map((f, i) => ({
          type: supportingDocsMeta[i]?.type || 'other',
          fileUrl: `${process.env.API_BASE_URL}/uploads/${f.filename}`,
          originalName: f.originalname
        }));

      // Apply updates
      if (churchId) {verification.churchId = churchId;}
      if (submittedBy) {verification.submittedBy = submittedBy;}
      if (incorporationNumber) {verification.incorporationNumber = incorporationNumber;}
      if (craNumber) {verification.craNumber = craNumber;}
      if (status) {verification.status = status;}

      if (governmentId) {
        verification.governmentId = {
          fileUrl: `${process.env.API_BASE_URL}/uploads/${governmentId.filename}`,
          originalName: governmentId.originalname
        };
      }

      if (registrationProof) {
        verification.registrationProof = {
          fileUrl: `${process.env.API_BASE_URL}/uploads/${registrationProof.filename}`,
          originalName: registrationProof.originalname
        };
      }

      if (supportingDocs.length > 0) {
        verification.supportingDocs = supportingDocs;
      }

      await verification.save();

      return res.status(200).json({
        message: 'Verification updated successfully.',
        verification
      });
    } catch (err) {
      console.error('Verification update error:', err);
      return res.status(400).json({ error: err.message });
    }
  }
);


router.patch('/status/:churchId', async (req, res) => {
  const { churchId } = req.params;
  const { status } = req.body;
  const churchStatus = status === 'approved';

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const verification = await Verification.findOne({ churchId }).session(session);
    if (!verification) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Verification request not found.' });
    }

    const updatedVerification = await Verification.findOneAndUpdate(
      { churchId },
      { status },
      { new: true, session }
    );

    await Church.findByIdAndUpdate(
      churchId,
      { isApproved: churchStatus, isPublished: churchStatus },
      { session }
    );

    await session.commitTransaction();
    console.log('Transaction committed successfully');

    return res.json({ success: true, verification: updatedVerification });
  } catch (err) {
    await session.abortTransaction();
    console.error('Transaction aborted due to error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    session.endSession();
  }
});


/*
#swagger.tags = ['Verification']
*/
router.get('/list', async(req, res) => {
    try {
        const churchId = req.church._id;
        const verification = await Verification.find({churchId});
        res.status(200).json({ verification });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/*
#swagger.tags = ['Verification']
*/
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedItem = await Verification.findByIdAndDelete(id);
        if (!deletedItem) {return res.status(404).json({ error: 'Verification Item not found' });}
        res.status(200).json({ message: 'Verification request deleted successfully', event: deletedItem });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



module.exports = router;
