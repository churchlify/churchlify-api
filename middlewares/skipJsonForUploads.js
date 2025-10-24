const skipJsonForUploads = (req, res, next) => {
    console.log(req.path);
    const isUploadRoute = req.path.startsWith('/church/create') || req.path.startsWith('/church/update'); 
    const isMultipart = req.headers['content-type'] && req.headers['content-type'].startsWith('multipart/form-data');
    if (isUploadRoute && isMultipart) {
        return next('route'); 
    }
    next();
};

const reconstructNestedFields = (body) => {
  const result = {};
  console.log({ body });
  
  Object.entries(body).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null) {
        console.warn(`Skipping key ${key}: Value is an object and cannot be parsed as a form data primitive.`);
        return; // Skip this key/value pair
    }
    
    const keys = key.split('.'); 
    let current = result;
    keys.forEach((part, index) => {
      const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
      if (arrayMatch) {
        const arrayKey = arrayMatch[1];
        const arrayIndex = parseInt(arrayMatch[2], 10);
        current[arrayKey] = current[arrayKey] || [];
        if (index === keys.length - 1) {
          // Final assignment: Apply numeric conversion only on simple types
          current[arrayKey][arrayIndex] = isNaN(value) ? value : parseFloat(value);
        } else {
          current[arrayKey][arrayIndex] = current[arrayKey][arrayIndex] || {};
          current = current[arrayKey][arrayIndex];
        }
      } else {
        if (index === keys.length - 1) {
          // Final assignment: Apply numeric conversion only on simple types
          current[part] = isNaN(value) ? value : parseFloat(value);
        } else {
          current[part] = current[part] || {};
          current = current[part];
        }
      }
    });
  });
  console.log('Reconstructed Body:', result);
  return result;
};

module.exports = { skipJsonForUploads, reconstructNestedFields };