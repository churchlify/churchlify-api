// common/cache.js
const redis = require('./redis.connection');

// helper to compose tenant-aware key
function tenantKey(churchId, key) {
  if (!churchId){ throw new Error('churchId required for cache key');}
  return `church:${churchId}:${key}`;
}

/**
 * retrieve cached value (JSON) or null
 * @param {string} churchId
 * @param {string} key
 */
async function get(churchId, key) {
  const k = tenantKey(churchId, key);
  const val = await redis.get(k);
  if (val == null) {return null;}
  try {
    return JSON.parse(val);
  } catch (e) {
    return val;
  }
}

/**
 * set cache with optional ttl (seconds)
 */
async function set(churchId, key, value, ttl = 300) {
  const k = tenantKey(churchId, key);
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (ttl > 0) {
    await redis.set(k, str, 'EX', ttl);
  } else {
    await redis.set(k, str);
  }
}

/**
 * invalidate one or multiple keys for a church
 */
async function del(churchId, keyPattern) {
  const pattern = tenantKey(churchId, keyPattern);
  const keys = await redis.keys(pattern);
  if (keys.length) {
    await redis.del(...keys);
  }
}

module.exports = { get, set, del, tenantKey };
