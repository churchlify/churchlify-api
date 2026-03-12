// Attaches the church timezone to the response object for downstream use
module.exports = function attachTimezone(req, res, next) {
  // Default to UTC if not available
  let timezone = 'UTC';
  if (req.church && req.church.timeZone) {
    timezone = req.church.timeZone;
  }
  res.locals.churchTimezone = timezone;
  next();
};
