// swagger/generate-api.js
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const m2s = require('mongoose-to-swagger');

const modelsDir = path.join(__dirname, '../models');
const outputPath = path.join(__dirname, '../swagger/generated-definitions.json');

const definitions = {};

/**
 * Capitalizes the first letter of a string
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert a Mongoose schema to Swagger definition
 * @param {string} name
 * @param {mongoose.Model} model
 */
function convertSchema(name, model) {
  definitions[name] = m2s(model);
  console.log(`✅ Converted schema: ${name}`);
}

/**
 * Handle embedded schemas manually
 */
function handleEmbeddedSchemas() {
  const embeddedSchemas = {
    Address: require('../models/address'),
  };

  Object.entries(embeddedSchemas).forEach(([name, schema]) => {
    const tempModel = mongoose.model(name, schema);
    convertSchema(name, tempModel);
  });
}

/**
 * Handle all models dynamically from the models directory
 */
function handleModels() {
  fs.readdirSync(modelsDir).forEach(file => {
    const name = capitalize(path.basename(file, '.js'));

    if (!file.endsWith('.js') || definitions[name]) {return;}

    const fullPath = path.join(modelsDir, file);
    try {
      const model = require(fullPath);
      const schema = model.schema || (model.prototype && model.prototype.schema);

      if (!schema) {
        console.warn(`⚠️ Skipped (no schema found): ${file}`);
        return;
      }

      convertSchema(name, model);
    } catch (err) {
      console.error(`❌ Error loading ${file}: ${err.message}`);
    }
  });
}

/**
 * Main function
 */
function generateSwaggerDefinitions() {
  handleEmbeddedSchemas();
  handleModels();

  fs.writeFileSync(outputPath, JSON.stringify(definitions, null, 2));
  console.log(`📁 Swagger definitions saved to: ${outputPath}`);
}

generateSwaggerDefinitions();
