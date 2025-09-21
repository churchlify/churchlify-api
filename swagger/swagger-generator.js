const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const excludedRoutes = [
  'audit.js',
  'upload.js'
];

/**
 * Map JS/Mongoose types to Swagger types
 */
function mapType(type) {
  switch (type.toLowerCase()) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'date': return 'string';
    case 'objectid': return 'string';
    default: return 'string';
  }
}

function getTypeName(type) {
  if (!type){ return 'string';}
  if (typeof type === 'function') {return type.name;}
  if (typeof type === 'string') {return type;}
  if (type.constructor && type.constructor.name) {return type.constructor.name;}
  return 'string';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert a Mongoose schema to Swagger definition recursively
 */
function schemaToSwagger(schema) {
  const swaggerSchema = { type: 'object', properties: {} };

  for (const [key, value] of Object.entries(schema.obj)) {
    let fieldType;

    // Embedded schema
    if (value instanceof mongoose.Schema) {
      swaggerSchema.properties[key] = { $ref: `#/definitions/${capitalize(key)}` };
      continue;
    }

    // Arrays
    if (Array.isArray(value)) {
      if (value.length && value[0] instanceof mongoose.Schema) {
        swaggerSchema.properties[key] = {
          type: 'array',
          items: { $ref: `#/definitions/${capitalize(key)}Item` }
        };
      } else {
        swaggerSchema.properties[key] = {
          type: 'array',
          items: { type: mapType(getTypeName(value[0])) }
        };
      }
      continue;
    }

    // { type: Something }
    if (value && value.type) {
      if (value.type instanceof mongoose.Schema) {
        swaggerSchema.properties[key] = { $ref: `#/definitions/${capitalize(key)}` };
        continue;
      }
      fieldType = getTypeName(value.type);
    } else {
      fieldType = getTypeName(value);
    }

    swaggerSchema.properties[key] = { type: mapType(fieldType) };
  }

  return swaggerSchema;
}

/**
 * Recursively scan a folder for route files
 */
function scanRoutes(dir) {
  let files = [];
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(scanRoutes(fullPath));
    } else if (file.endsWith('.js')) {
      if (!excludedRoutes.includes(file)) { // skip excluded files
        files.push(fullPath);
      }
    }
  });
  return files;
}

/**
 * Explicit route file -> definition mapping
 */
const routeDefinitionMap = {
  'checkin.js': 'CheckIn',
  'auth.js': 'Auth',
  'user.js': 'User',
  'church.js': 'Church',
  'event.js': 'Event',
  'eventInstance.js': 'EventInstance',
  'devotion.js': 'Devotion',
  'fellowship.js': 'Fellowship',
  'kid.js': 'Kid',
  'ministry.js': 'Ministry',
  'prayer.js': 'Prayer',
  'testimony.js': 'Testimony',
  'audit.js': 'Audit',
  'assignment.js': 'Assignment',
  'events.js': 'Events',
  'subscription.js': 'Subscription',
  'payment.js': 'Payment',
  'module.js': 'Module',
  'settings.js': 'Settings' 
};

/**
 * Guess definition based on route file and URL
 */
function guessDefinitionFromRoute(routeFile, url, definitions) {
  const fileName = path.basename(routeFile);
  if (routeDefinitionMap[fileName]) {return routeDefinitionMap[fileName];}

  const firstSegment = url.split('/').filter(Boolean)[0];
  if (firstSegment && definitions[capitalize(firstSegment)]) {return capitalize(firstSegment);}

  return 'Root';
}

/**
 * Inject Swagger comments into route files
 */
function injectSwaggerComments(routeFile, definitions) {
  let content = fs.readFileSync(routeFile, 'utf-8');

  // Remove swagger comments and clean blank lines
  content = content.replace(/\/\*#swagger[\s\S]*?\*\//g, '');
  content = content.replace(/\n{2,}/g, '\n');

  const paths = {};
  const routeRegex = /(router\.(get|post|put|delete))\(['"`](.*?)['"`],/g;

  content = content.replace(routeRegex, (match, p1, method, url) => {
    const defName = guessDefinitionFromRoute(routeFile, url, definitions);
    const swaggerUrl = `/${defName}${url}`;

    if (!paths[swaggerUrl]) { paths[swaggerUrl] = {}; }

    // Prepare parameters
    const parameters = [];
    const paramRegex = /:([a-zA-Z0-9_]+)/g;
    let matchParam;
    while ((matchParam = paramRegex.exec(url)) !== null) {
      parameters.push({
        name: matchParam[1],
        in: 'path',
        required: true,
        type: 'string'
      });
    }

    if (['post', 'put'].includes(method)) {
      parameters.push({
        name: 'body',
        in: 'body',
        required: true,
        description: `${defName} data`,
        schema: { $ref: `#/definitions/${defName}` }
      });
    }

    paths[swaggerUrl][method] = {
      tags: [defName],
      description: `${method.toUpperCase()} ${url}`,
      parameters,
      responses: {
        200: { description: 'Success', schema: { $ref: `#/definitions/${defName}` } }
      }
    };

    // Ensure exactly one line before each comment
    const comment = `\n/*#swagger.tags = ['${defName}']
#swagger.description = "${method.toUpperCase()} ${url}"
#swagger.responses[200] = { description: 'Success', schema: { $ref: "#/definitions/${defName}" } }*/`;

    console.log(`Swagger path: [${method.toUpperCase()}] ${swaggerUrl} -> ${defName}`);
    return comment + '\n' + match;
  });

  content = content.replace(/\n{3,}/g, '\n\n');

  fs.writeFileSync(routeFile, content, 'utf-8');
  return paths;
}

/**
 * Generate Swagger definitions from Mongoose models folder
 */
function generateDefinitions(modelsDir) {
  const definitions = {};
  const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));

  files.forEach(file => {
    const model = require(path.join(modelsDir, file));
    if (model.schema) {
      const name = model.modelName || path.basename(file, '.js');
      console.log(`✅ Processing model: ${capitalize(name)}`);
      definitions[capitalize(name)] = schemaToSwagger(model.schema);
    }
  });

  return definitions;
}

/**
 * Main generator
 */
function generateSwagger(modelsDir, routesDir, outputFile = 'swagger.json') {
  const definitions = generateDefinitions(modelsDir);
  const routes = scanRoutes(routesDir);

  const paths = {};
  routes.forEach(route => {
    const newPaths = injectSwaggerComments(route, definitions);
    Object.assign(paths, newPaths);
  });

  const swaggerDoc = {
    swagger: '2.0',
    info: { version: '1.0.0', title: 'API Documentation' },
    paths,
    definitions
  };

  fs.writeFileSync(outputFile, JSON.stringify(swaggerDoc, null, 2), 'utf-8');
  console.log(`🚀 Swagger generated at ${outputFile}`);
}

module.exports = generateSwagger;
