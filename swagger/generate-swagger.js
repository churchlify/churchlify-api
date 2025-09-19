// swagger/generate-swagger.js
// const swaggerAutogen = require('swagger-autogen')();
// const path = require('path');
// const doc = require('./swagger');

// const outputFile = './swagger/swagger-output.json';
// const endpointsFiles = [
//   path.resolve(__dirname, '../routes/prayer.js'),
//     ];

// swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
//   console.log('✅ Swagger documentation generated');
// });
const path = require('path');
const generateSwagger = require('./swagger-generator');

console.log('Models dir:', path.resolve(__dirname, '../models'));
console.log('Routes dir:', path.resolve(__dirname, '../routes'));

generateSwagger(
  path.resolve(__dirname, '../models'),   // ✅ absolute path
  path.resolve(__dirname, '../routes'),   // ✅ absolute path
  path.resolve(__dirname, './swagger.json')
);