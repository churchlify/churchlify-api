// swagger/swagger.js
const generatedDefs = require('./generated-definitions.json');
module.exports = {
  info: {
    title: 'Churchlify API',
    description: 'Auto-generated Swagger documentation',
    version: '1.0.0',
  },
  host: 'localhost:5500',
  basePath: '/',
  schemes: ['http'],
  consumes: ['application/json'],
  produces: ['application/json'],
  tags: [
    { name: 'User', description: 'User management endpoints' },
    { name: 'Auth', description: 'Authentication endpoints' },
    { name: 'Church', description: 'Church management endpoints' },         
    { name: 'Event', description: 'Event management endpoints' },
    { name: 'Kid', description: 'Kid management endpoints' },
    { name: 'Audit', description: 'Audit trail endpoints' },
    { name: 'Checkin', description: 'Check-in management endpoints' },
    { name: 'Ministry', description: 'Ministry management endpoints' },
    { name: 'Fellowship', description: 'Fellowship management endpoints' },
    { name: 'Prayer', description: 'Prayer request management endpoints' },
    { name: 'Devotion', description: 'Devotional content management endpoints' },
    { name: 'Testimony', description: 'Testimony management endpoints' },   
  ],
 definitions: {
    ...generatedDefs
  }
};