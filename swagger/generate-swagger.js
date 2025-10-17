const path = require('path');
const generateSwagger = require('./swagger-generator');

console.log('Models dir:', path.resolve(__dirname, '../models'));
console.log('Routes dir:', path.resolve(__dirname, '../routes'));

generateSwagger(
  path.resolve(__dirname, '../models'),
  path.resolve(__dirname, '../routes'),
  path.resolve(__dirname, './swagger.json')
);