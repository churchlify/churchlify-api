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
  } catch (_e) {
    console.warn(`Cache get warning: value for key ${k} is not valid JSON`, _e.message);
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
 * invalidate one or multiple keys for a church using SCAN (non-blocking)
 * avoids blocking entire Redis instance on large datasets
 */
async function del(churchId, keyPattern) {
  const pattern = tenantKey(churchId, keyPattern);
  let cursor = '0';
  const deleteKeys = [];

  // Use SCAN to paginate without blocking
  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      deleteKeys.push(...keys);
    } while (cursor !== '0');

    // Delete in batches to avoid memory spikes
    if (deleteKeys.length > 0) {
      for (let i = 0; i < deleteKeys.length; i += 1000) {
        await redis.del(...deleteKeys.slice(i, i + 1000));
      }
    }
  } catch (e) {
    console.error('Cache del error during scan:', e.message);
    throw e;
  }
}

module.exports = { get, set, del, tenantKey };
