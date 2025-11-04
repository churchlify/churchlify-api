const Church = require('../models/church');
const mongoose = require('mongoose');
const CHURCH_HEADER = 'x-church';
const CHURCH_QUERY = 'church';
const cache = new Map();

exports.churchResolver = async (req, res, next) => {
    const host = req.headers[CHURCH_HEADER] || req.query[CHURCH_QUERY];
      if (req.path.includes('/findByUid')) {
        return next();
    }
    if (!host) {
        return res.status(400).json({ error: 'Church identifier not provided' });
    }
    if (!mongoose.Types.ObjectId.isValid(host)) {
        return res.status(400).json({ error: 'Invalid church identifier provided' });
    }
    if (cache.has(host)) {
        req.church = cache.get(host);
        return next(); // <--- Instant response!
    }
    try {
        const church = await Church.findById(host).lean();
        if (!church) {
            return res.status(404).json({ error: 'Church not found' });
        }
        cache.set(host, church);
        req.church = church;
        console.log(` Resolved ${church.name}`);
        next();
    } catch (err) {
        console.error('Church resolver critical error:', err);
        res.status(500).json({ error: 'Internal server error during church resolution' });
    }
};
