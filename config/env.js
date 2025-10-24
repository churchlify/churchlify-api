const dotenv = require('dotenv');

dotenv.config();

if (!process.env.MONGO_URI) {
  console.error('❌ Missing MONGO_URI in .env file');
  process.exit(1);
}

if (!process.env.PORT) {process.env.PORT = 5500;}

module.exports = {
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI,
};
