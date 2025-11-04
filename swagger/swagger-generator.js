const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// --- Configuration & Global State ---
const excludedRoutes = ["audit.js", "upload.js"];
const subDefinitions = {};

// --- Utility Functions ---

/**
 * Map Mongoose type to OpenAPI type.
 */
function mapMongooseType(mongooseType) {
  switch (mongooseType) {
    case String:
    case mongoose.Schema.Types.String:
      return { type: "string" };
    case Number:
    case mongoose.Schema.Types.Number:
      return { type: "number" };
    case Boolean:
    case mongoose.Schema.Types.Boolean:
      return { type: "boolean" };
    case Date:
    case mongoose.Schema.Types.Date:
      return { type: "string", format: "date-time" };
    case mongoose.Schema.Types.ObjectId:
      return {
        type: "string",
        pattern: "^[a-fA-F0-9]{24}$",
        example: "507f1f77bcf86cd799439011",
      };
    case mongoose.Schema.Types.Mixed:
      return { type: "object", properties: {} };
    case Array:
      return { type: "array", items: { type: "string" } };
    default:
      return { type: "string" };
  }
}

/**
 * Detect a simple [long, lat] array defined in the schema: { type: [Number] }.
 */
function isSimpleLocationArray(opts) {
  return (
    Array.isArray(opts.type) &&
    opts.type.length === 1 &&
    opts.type[0] === Number
  );
}

/**
 * Detect a Mongoose-style GeoJSON object definition.
 */
function isGeoJSON(typeDef) {
  return (
    typeof typeDef === "object" &&
    typeDef !== null &&
    !Array.isArray(typeDef) &&
    (typeDef.type || typeDef.coordinates)
  );
}

/**
 * Capitalize string
 */
function capitalize(str) {
  if (!str) {
    return "";
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Helper to generate a definition name from parts.
 */
function getDefinitionName(...parts) {
  return parts.map(capitalize).join("");
}

let schemaToSwagger;
let expandInlineObject;
let processSchemaType;

schemaToSwagger = (schema, parentName = "") => {
  const swaggerSchema = { type: "object", properties: {} };

  schema.eachPath((pathKey, schemaType) => {
    if (pathKey === "__v" || pathKey.startsWith("_")) {
      return;
    }

    const opts = schemaType.options;

    // This call is now safe because processSchemaType is defined below
    const schemaFragment = processSchemaType(pathKey, opts, parentName);

    if (opts.required) {
      if (!swaggerSchema.required) {
        swaggerSchema.required = [];
      }
      swaggerSchema.required.push(pathKey);
    }
    if (opts.default !== undefined) {
      schemaFragment.default = opts.default;
    }
    if (opts.enum) {
      schemaFragment.enum = opts.enum;
    }
    if (opts.description) {
      schemaFragment.description = opts.description;
    }

    swaggerSchema.properties[pathKey] = schemaFragment;
  });

  return swaggerSchema;
};

expandInlineObject = (obj, name = "InlineObject") => {
  const swaggerObj = { type: "object", properties: {} };

  for (const [k, v] of Object.entries(obj)) {
    if (!v) {
      continue;
    }

    const opts = typeof v === "object" && v.type ? v : { type: v };

    // This call is now safe because processSchemaType is defined below
    const schemaFragment = processSchemaType(k, opts, name);

    if (v.required) {
      if (!swaggerObj.required) {
        swaggerObj.required = [];
      }
      swaggerObj.required.push(k);
    }
    if (v.default !== undefined) {
      schemaFragment.default = v.default;
    }
    if (v.enum) {
      schemaFragment.enum = v.enum;
    }

    swaggerObj.properties[k] = schemaFragment;
  }

  return swaggerObj;
};

processSchemaType = (pathKey, opts, parentName) => {
  // 1. Array Handling
  if (Array.isArray(opts.type)) {
    const item = opts.type[0];

    // Simple [long, lat] location array
    if (isSimpleLocationArray(opts)) {
      return {
        type: "array",
        items: { type: "number" },
        description: "Location array: [Longitude, Latitude]",
        minItems: 2,
        maxItems: 2,
        example: [0, 0], // lng, lat
      };
    }

    // Array of Subdocuments/Inline Objects
    if (item instanceof mongoose.Schema) {
      const defName = getDefinitionName(parentName, pathKey, "Item");
      subDefinitions[defName] = schemaToSwagger(item, defName);
      return {
        type: "array",
        items: { $ref: `#/components/schemas/${defName}` },
      };
    }
    if (typeof item === "object" && item !== null) {
      const defName = getDefinitionName(parentName, pathKey, "Item");
      subDefinitions[defName] = expandInlineObject(item, defName);
      return {
        type: "array",
        items: { $ref: `#/components/schemas/${defName}` },
      };
    }

    // Array of Primitives
    return { type: "array", items: mapMongooseType(item) };
  }

  // 2. Subdocuments (Mongoose Schema)
  if (opts.type instanceof mongoose.Schema) {
    const defName = capitalize(pathKey);
    subDefinitions[defName] = schemaToSwagger(opts.type, defName);
    return { $ref: `#/components/schemas/${defName}` };
  }

  // 3. Inline Nested Object / GeoJSON
  if (typeof opts.type === "object" && opts.type !== null) {
    if (isGeoJSON(opts.type)) {
      return {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["Point", "Polygon", "LineString"],
            default: "Point",
          },
          coordinates: {
            type: "array",
            items: { type: "number" },
            description: "GeoJSON coordinates: [Longitude, Latitude] for Point",
            example: [0, 0],
          },
        },
      };
    }

    // General Inline Nested Object
    const defName = getDefinitionName(parentName, pathKey);
    subDefinitions[defName] = expandInlineObject(opts.type, defName);
    return { $ref: `#/components/schemas/${defName}` };
  }

  // 4. Primitive Types
  return mapMongooseType(opts.type);
};

// --- Route Scanning and Mapping ---

/**
 * Scan route files recursively.
 */
function scanRoutes(dir) {
  let files = [];
  try {
    fs.readdirSync(dir).forEach((file) => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        files = files.concat(scanRoutes(fullPath));
      } else if (file.endsWith(".js") && !excludedRoutes.includes(file)) {
        files.push(fullPath);
      }
    });
  } catch (err) {
    console.error(`Error scanning routes directory ${dir}:`, err.message);
  }
  return files;
}

const routeDefinitionMap = {
  "checkin.js": "checkIn",
  "auth.js": "auth",
  "user.js": "user",
  "church.js": "church",
  "webhook.js": "webhook",
  "event.js": "event",
  "eventInstance.js": "eventInstance",
  "devotion.js": "devotion",
  "fellowship.js": "fellowship",
  "kid.js": "kid",
  "ministry.js": "ministry",
  "donations.js": "donations",
  "prayer.js": "prayer",
  "testimony.js": "testimony",
  "assignment.js": "assignment",
  "events.js": "events",
  "subscription.js": "subscription",
  "payment.js": "payment",
  "module.js": "module",
  "settings.js": "settings",
  "chat.js": "chat",
  "timezone.js": "timezone",
  "notifications.js": "notifications",
};

function guessDefinitionFromRoute(routeFile, url, definitions) {
  const fileName = path.basename(routeFile);
  if (routeDefinitionMap[fileName]) {
    return routeDefinitionMap[fileName];
  }
  const firstSegment = url.split("/").filter(Boolean)[0];
  if (firstSegment && definitions[capitalize(firstSegment)]) {
    return capitalize(firstSegment);
  }
  return "Root";
}

function extractSwaggerPaths(routeFile, definitions) {
  let content = fs.readFileSync(routeFile, "utf-8");
  const paths = {};
  const routeRegex =
    /router\.(get|post|put|delete|patch|all)\s*\(['"`](.*?)['"`]/g;

  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1];
    const rawUrl = match[2];

    if (rawUrl.length === 0 && rawUrl !== "/") {
      continue;
    }

    const defName = guessDefinitionFromRoute(routeFile, rawUrl, definitions);

    let swaggerUrl = rawUrl.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
    swaggerUrl = `/${defName}${swaggerUrl}`;
    swaggerUrl = swaggerUrl.replace(/\/\//g, "/");

    if (!paths[swaggerUrl]) {
      paths[swaggerUrl] = {};
    }

    const parameters = [];
    const paramRegex = /:([a-zA-Z0-9_]+)/g;
    let matchParam;

    while ((matchParam = paramRegex.exec(rawUrl)) !== null) {
      parameters.push({
        name: matchParam[1],
        in: "path",
        required: true,
        schema: { type: "string" },
        description: `ID of the referenced ${defName}`,
      });
    }

    let requestBody;
    if (["post", "put", "patch"].includes(method)) {
      requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${defName}` },
          },
        },
      };
    }

    const responses = {
      200: {
        description: "Success",
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${defName}` },
          },
        },
      },
      400: { description: "Bad Request" },
      404: { description: "Not Found" },
    };

    paths[swaggerUrl][method] = {
      tags: [defName],
      summary: `${capitalize(method)} ${swaggerUrl}`,
      parameters,
      requestBody,
      responses,
    };
  }

  return paths;
}

// --- Main Generation Functions ---

function generateDefinitions(modelsDir) {
  const definitions = {};
  try {
    const files = fs.readdirSync(modelsDir).filter((f) => f.endsWith(".js"));

    files.forEach((file) => {
      const filePath = path.join(modelsDir, file);
      const exported = require(filePath);
      const baseName = path.basename(file, ".js");

      let schema = null;
      let modelName = null;

      if (exported instanceof mongoose.Schema) {
        schema = exported;
        modelName = baseName;
      } else if (exported && exported.schema) {
        schema = exported.schema;
        modelName = exported.modelName || baseName;
      }

      if (schema) {
        const defName = capitalize(modelName);
        definitions[defName] = schemaToSwagger(schema, defName);
      }
    });
  } catch (err) {
    console.error(
      `Error generating definitions from ${modelsDir}:`,
      err.message
    );
  }

  return { ...definitions, ...subDefinitions };
}

function generateSwagger(modelsDir, routesDir, outputFile = "swagger.json") {
  Object.keys(subDefinitions).forEach((key) => delete subDefinitions[key]);

  const definitions = generateDefinitions(modelsDir);
  const routes = scanRoutes(routesDir);

  const paths = {};
  routes.forEach((route) => {
    Object.assign(paths, extractSwaggerPaths(route, definitions));
  });

  const swaggerDoc = {
    openapi: "3.0.3",
    info: {
      title: "Churchlify API",
      version: "1.0.0",
      description: "Comprehensive Churchlify API documentation",
    },
    paths,
    components: {
      schemas: definitions,
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
  };

  try {
    fs.writeFileSync(outputFile, JSON.stringify(swaggerDoc, null, 2), "utf-8");
    console.log(`🚀 OpenAPI 3.0 Swagger generated at ${outputFile}`);
  } catch (err) {
    console.error(`Error writing swagger file to ${outputFile}:`, err.message);
  }
}

module.exports = generateSwagger;
