const { get, set } = require('../common/cache');

/**
 * Lightweight tenant-aware response cache middleware generator.
 * - Attempts to load a cached response for `churchId:key` and send if present.
 * - If not present, proxies `res.json` to capture the outgoing body and store it.
 * - Designed for simple list endpoints; avoids over-engineering.
 *
 * Usage: add `cacheRoute('events:list', 60)` before the handler.
 */
function cacheRoute(key, ttlSeconds = 300) {
  return async (req, res, next) => {
    try {
      const churchId = req.church?._id || req.headers['x-church'] || req.query.church;
      if (!churchId) {return next();}

      const cached = await get(churchId.toString(), key);
      if (cached != null) {
        // cached value already contains the full response body
        return res.status(200).json(cached);
      }

      // capture res.json to save body after handler runs
      const originalJson = res.json.bind(res);
      let sent = false;
      res.json = async (body) => {
        try {
          // only cache successful (2xx) responses
          if (res.statusCode >= 200 && res.statusCode < 300) {
            await set(churchId.toString(), key, body, ttlSeconds);
          }
        } catch (e) {
          // ignore cache errors; don't block response
          console.error('tenantCache set error', e && e.message);
        }
        sent = true;
        return originalJson(body);
      };

      // ensure we proceed to handler
      await next();

      // If handler didn't call res.json (e.g., used res.send/res.end), we do nothing
      if (!sent) {
        // noop
      }
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { cacheRoute };
