/*
#swagger.tags = ['Ministry']
*/
// routes/ministry.js
const express = require('express');
const Ministry = require('../models/ministry');
const Assignment = require('../models/assignment');
const {validateMinistry} = require('../middlewares/validators');
const { requireSuperOrAdmin, requireSuperOrAdminOrResourceMinistryLeader, requireMinistryAccess } = require('../middlewares/permissions');
const { ensureLeaderMembership } = require('../common/groupLeaderMembership.service');
const router = express.Router();
router.use(express.json());
/*
#swagger.tags = ['Ministry']
*/
router.post('/create', requireSuperOrAdmin, validateMinistry(), async(req, res) => {
    const { church, name, description, leaderId } = req.body;
    const newItem = new Ministry({ church, name, description, leaderId });
    let saved = false;
    let shouldRollback = false;
    try {
        await newItem.save();

        saved = true;
        shouldRollback = true;
        await ensureLeaderMembership({
            leaderId: newItem.leaderId,
            ministryId: newItem._id
        });

        shouldRollback = false;

        res.status(201).json({ message: 'Ministry registered successfully', ministry: newItem });
    } catch (err) {
        if (saved && shouldRollback) {
            await Ministry.findByIdAndDelete(newItem._id).catch(() => null);
        }
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Ministry']
*/
router.get('/find/:id', async(req, res) => {
    const { id } = req.params;
    const ministry = await Ministry.findById(id).populate('church').lean();
    if (!ministry) {return res.status(404).json({ message: `Ministry with id ${id} not found` });}
    res.json({ ministry });
});
/*
#swagger.tags = ['Ministry']
*/
router.patch('/update/:id', requireSuperOrAdminOrResourceMinistryLeader(Ministry), async(req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const existingMinistry = await Ministry.findById(id).select('leaderId').lean();
        if (!existingMinistry) {
            return res.status(404).json({ message: `Ministry with id ${id} not found` });
        }

        const hasLeaderIdUpdate = Object.prototype.hasOwnProperty.call(updates, 'leaderId');
        const effectiveLeaderId = hasLeaderIdUpdate ? updates.leaderId : existingMinistry.leaderId;

        await ensureLeaderMembership({
            leaderId: effectiveLeaderId,
            ministryId: id
        });

        const updatedMinistry = await Ministry.findByIdAndUpdate(id, {$set:updates}, { new: true, runValidators: true });
        if (!updatedMinistry) {
            return res.status(404).json({ message: `Ministry with id ${id} not found` });
        }
        res.status(200).json({ message: 'Record updated successfully', ministry: updatedMinistry });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
/*
#swagger.tags = ['Ministry']
*/
router.get('/list', async(req, res) => {
    try {
        const church = req.church;
        let filter = {};
        if(church) { filter.church = church._id; }
        const ministries = await Ministry.find(filter).select('name description leaderId church').lean();
        res.status(200).json({ ministries });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

/*
#swagger.tags = ['Ministry']
*/
router.get('/:id/members', requireMinistryAccess, async (req, res) => {
    try {
        const { id } = req.params;
        const church = req.church;

        const ministryFilter = { _id: id };
        if (church?._id) {
            ministryFilter.church = church._id;
        }

        const ministry = await Ministry.findOne(ministryFilter)
            .select('name church leaderId')
            .lean();

        if (!ministry) {
            return res.status(404).json({ message: 'Ministry not found for this church' });
        }

        const assignments = await Assignment.find({ ministryId: id })
            .populate('userId', 'firstName lastName emailAddress phoneNumber photoUrl firebaseId church role')
            .populate('scheduleRoleId', 'name ministryId')
            .select('userId ministryId scheduleRoleId role status dateAssigned skills')
            .sort({ dateAssigned: -1 })
            .lean();

        res.status(200).json({
            ministry,
            members: assignments,
            total: assignments.length,
            counts: {
                approved: assignments.filter((item) => item.status === 'approved').length,
                pending: assignments.filter((item) => item.status === 'pending').length
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
/*
#swagger.tags = ['Ministry']
*/
router.delete('/delete/:id', requireSuperOrAdminOrResourceMinistryLeader(Ministry), async (req, res) => {
    try {
        const { id } = req.params;
        const deletedMinistry = await Ministry.findByIdAndDelete(id);
        if (!deletedMinistry) {
            return res.status(404).json({ error: 'Ministry not found' });
        }
        res.status(200).json({ message: 'Ministry deleted successfully', ministry: deletedMinistry });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;
