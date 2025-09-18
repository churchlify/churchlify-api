// swagger/generate-swagger.js
const swaggerAutogen = require('swagger-autogen')();
const doc = require('./swagger');

const outputFile = './swagger/swagger-output.json';
const endpointsFiles = [
    '../routes/user.js',
    '../routes/auth.js',
     '../routes/church.js',
     '../routes/event.js',
    '../routes/kid.js',
    '../routes/audit.js',
    '../routes/checkin.js',
    '../routes/ministry.js',
    '../routes/fellowship.js',
    '../routes/prayer.js',
    '../routes/devotion.js',
    '../routes/testimony.js',
    ];

swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
  console.log('✅ Swagger documentation generated');
});
