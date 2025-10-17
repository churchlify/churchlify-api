// middlewares/stripeRaw.js
const bodyParser = require('body-parser');

module.exports = bodyParser.raw({ type: 'application/json' });
