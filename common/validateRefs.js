const mongoose = require('mongoose');

module.exports = function validateRefs(schema, options) {
  const refs = options.refs || [];

  refs.forEach(({ field, model }) => {
    const schemaPath = schema.path(field);
    if (!schemaPath || typeof schemaPath.validate !== 'function') {
      throw new Error(`Field '${field}' not found or not directly validatable in schema`);
    }

    schemaPath.validate({
      validator: async function (value) {
        if (value == null) {return true;}
        if (!mongoose.Types.ObjectId.isValid(value)) {return false;}
        const exists = await mongoose.model(model).exists({ _id: value });
        return !!exists;
      },
      message: `Referenced ${model} document in '${field}' does not exist`,
    });
  });
};
