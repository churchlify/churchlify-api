const moment = require('moment-timezone');
const Church = require('../models/church');

/**
 * Timezone Helper Utility
 * Centralizes all timezone-aware date/time operations
 * MongoDB stores dates as UTC - this handles conversions at application layer
 */

/**
 * Get church timezone, with fallback to UTC
 * @param {ObjectId|Object} churchIdOrObject - Church ID or church object with timeZone property
 * @returns {Promise<string>} Timezone string (e.g., 'America/New_York')
 */
async function getChurchTimezone(churchIdOrObject) {
  if (!churchIdOrObject) {
    return 'UTC';
  }

  // If object with timeZone property
  if (typeof churchIdOrObject === 'object' && churchIdOrObject.timeZone) {
    return churchIdOrObject.timeZone || 'UTC';
  }

  // If ObjectId, fetch from DB
  try {
    const church = await Church.findById(churchIdOrObject).select('timeZone').lean();
    return church?.timeZone || 'UTC';
  } catch (err) {
    console.error('Error fetching church timezone:', err);
    return 'UTC';
  }
}

/**
 * Get current time in church's timezone
 * @param {string} timezone - Timezone string
 * @returns {moment.Moment} Moment object in church timezone
 */
function nowInChurchTz(timezone = 'UTC') {
  return moment.tz(timezone);
}

/**
 * Parse a date string in church timezone and return UTC Date for MongoDB
 * @param {string|Date} dateString - Date string (YYYY-MM-DD or ISO)
 * @param {string} timezone - Church timezone
 * @returns {Date} UTC Date object for MongoDB storage
 */
function parseChurchDate(dateString, timezone = 'UTC') {
  if (!dateString) {
    return null;
  }

  // If already a Date object, assume it's in the intended timezone
  if (dateString instanceof Date) {
    return dateString;
  }

  // Parse in church timezone, return as UTC Date
  return moment.tz(dateString, timezone).toDate();
}

/**
 * Parse a datetime (date + time) in church timezone and return UTC Date for MongoDB
 * @param {string} dateString - Date string (YYYY-MM-DD)
 * @param {string} timeString - Time string (HH:mm or HH:mm:ss)
 * @param {string} timezone - Church timezone
 * @returns {Date} UTC Date object for MongoDB storage
 */
function parseChurchDateTime(dateString, timeString, timezone = 'UTC') {
  if (!dateString || !timeString) {
    return null;
  }

  const dateTimeString = `${dateString} ${timeString}`;
  return moment.tz(dateTimeString, 'YYYY-MM-DD HH:mm', timezone).toDate();
}

/**
 * Get month boundaries in church timezone (for MongoDB range queries)
 * @param {number} year - Year (e.g., 2026)
 * @param {number} month - Month (1-12)
 * @param {string} timezone - Church timezone
 * @returns {{ startDate: Date, endDate: Date }} UTC Date objects for MongoDB queries
 */
function getMonthBoundaries(year, month, timezone = 'UTC') {
  // Start of month in church timezone -> convert to UTC
  const startDate = moment.tz(`${year}-${String(month).padStart(2, '0')}-01`, timezone)
    .startOf('day')
    .toDate();

  // End of month in church timezone -> convert to UTC
  const endDate = moment.tz(`${year}-${String(month).padStart(2, '0')}-01`, timezone)
    .endOf('month')
    .endOf('day')
    .toDate();

  return { startDate, endDate };
}

/**
 * Get day boundaries in church timezone (for MongoDB range queries)
 * @param {string|Date} date - Date string or Date object
 * @param {string} timezone - Church timezone
 * @returns {{ startOfDay: Date, endOfDay: Date }} UTC Date objects for MongoDB queries
 */
function getDayBoundaries(date, timezone = 'UTC') {
  const m = moment.tz(date, timezone);

  return {
    startOfDay: m.clone().startOf('day').toDate(),
    endOfDay: m.clone().endOf('day').toDate()
  };
}

/**
 * Convert UTC Date to church timezone for display
 * @param {Date} utcDate - UTC Date from MongoDB
 * @param {string} timezone - Church timezone
 * @param {string} format - Moment format string (optional)
 * @returns {string|moment.Moment} Formatted string or moment object
 */
function formatInChurchTz(utcDate, timezone = 'UTC', format = null) {
  if (!utcDate) {
    return null;
  }

  const m = moment.tz(utcDate, timezone);
  return format ? m.format(format) : m;
}

/**
 * Add time to a date in church timezone
 * @param {Date} date - Starting date
 * @param {number} amount - Amount to add
 * @param {string} unit - Unit ('minutes', 'hours', 'days', 'months', 'years')
 * @param {string} timezone - Church timezone
 * @returns {Date} UTC Date object for MongoDB
 */
function addTimeInChurchTz(date, amount, unit, timezone = 'UTC') {
  return moment.tz(date, timezone).add(amount, unit).toDate();
}

/**
 * Check if a date falls within a range (timezone-aware)
 * @param {Date} date - Date to check
 * @param {Date} startDate - Range start
 * @param {Date} endDate - Range end
 * @returns {boolean}
 */
function isDateInRange(date, startDate, endDate) {
  const d = moment(date);
  return d.isSameOrAfter(startDate) && d.isSameOrBefore(endDate);
}

/**
 * Compare two dates in church timezone (ignoring time)
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @param {string} timezone - Church timezone
 * @returns {boolean} True if same day in church timezone
 */
function isSameDay(date1, date2, timezone = 'UTC') {
  const m1 = moment.tz(date1, timezone).startOf('day');
  const m2 = moment.tz(date2, timezone).startOf('day');
  return m1.isSame(m2);
}

module.exports = {
  getChurchTimezone,
  nowInChurchTz,
  parseChurchDate,
  parseChurchDateTime,
  getMonthBoundaries,
  getDayBoundaries,
  formatInChurchTz,
  addTimeInChurchTz,
  isDateInRange,
  isSameDay
};
