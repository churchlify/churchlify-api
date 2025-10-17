// utils/key.registry.js
module.exports = {
  CURRENT_KEY_VERSION: 'v1',
  KEY_REGISTRY: {
    v1: process.env.ENCRYPTION_KEY_V1,
    v2: process.env.ENCRYPTION_KEY_V2,
    v3: process.env.ENCRYPTION_KEY_V1,
    v4: process.env.ENCRYPTION_KEY_V2
  }
};