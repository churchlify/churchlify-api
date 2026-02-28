const Church = require('../models/church');
const mongoose = require('mongoose');
const { get, set } = require('../common/cache');

const CHURCH_HEADER = 'x-church';
const CHURCH_QUERY = 'church';

// attach the cache helper to every request so routes can easily
// perform tenant-aware caching without requiring their own import
exports.cacheMiddleware = (req, res, next) => {
    req.cache = require('../common/cache');
    next();
};

exports.churchResolver = async (req, res, next) => {
    const host = req.headers[CHURCH_HEADER] || req.query[CHURCH_QUERY];
    if (req.path.includes('/findByUid') || (req.path.includes('/user/create') && req.body.role === 'admin')) {
        return next();
    }

    if (!host) {
        return res.status(400).json({ error: 'Church identifier not provided' });
    }
    if (!mongoose.Types.ObjectId.isValid(host)) {
        return res.status(400).json({ error: 'Invalid church identifier provided' });
    }

    try {
        // attempt to load from Redis first
        const cached = await get(host, 'church');
        if (cached) {
            req.church = cached;
            return next();
        }

        const church = await Church.findById(host).lean();
        if (!church) {
            return res.status(404).json({ error: 'Church not found' });
        }

        // cache for an hour (3600s); could be longer if you prefer
        await set(host, 'church', church, 3600);
        req.church = church;
        console.log(`Resolved ${church.name}`);
        next();
    } catch (err) {
        console.error('Church resolver critical error:', err);
        res.status(500).json({ error: 'Internal server error during church resolution' });
    }
};
