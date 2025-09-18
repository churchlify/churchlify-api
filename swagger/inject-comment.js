const fs = require('fs');
const path = require('path');
const recast = require('recast');
const parser = require('@babel/parser');
const definitions = require('../swagger/generated-definitions.json');

const routesDir = path.join(__dirname, '../routes');

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function parseCode(code) {
  return recast.parse(code, {
    parser: {
      parse: source => parser.parse(source, {
        sourceType: 'module',
        plugins: ['jsx', 'classProperties'],
      }),
    },
  });
}

function generateSwaggerComments(tag, method, routePath) {
  const schemaRef = definitions[tag] ? `"#/definitions/${tag}"` : null;

  const comments = [
    `#swagger.tags = ['${tag}']`,
    `#swagger.description = '${method} ${routePath}'`,
  ];

  if (['POST', 'PATCH'].includes(method) && schemaRef) {
    comments.push(
      `#swagger.requestBody = {\n  required: true,\n  content: {\n    "application/json": {\n      schema: { $ref: ${schemaRef} }\n    }\n  }\n}`
    );
  }

  if (schemaRef) {
    comments.push(
      `#swagger.responses[200] = {\n  description: 'Success',\n  schema: { $ref: ${schemaRef} }\n}`
    );
  }

  return comments.join('\n');
}

function updateSwaggerCommentsInFile(file) {
  if (!file.endsWith('.js')) {return;}

  const fullPath = path.join(routesDir, file);
  const code = fs.readFileSync(fullPath, 'utf8');
  const ast = parseCode(code);
  const tag = capitalize(file.replace('.js', ''));

  recast.types.visit(ast, {
    visitCallExpression(path) {
      const { node } = path;
      const callee = node.callee;

      if (
        callee.type === 'MemberExpression' &&
        callee.object.name === 'router' &&
        ['get', 'post', 'patch', 'delete'].includes(callee.property.name)
      ) {
        const method = callee.property.name.toUpperCase();
        const routePath = node.arguments[0]?.value || '';
        const commentText = generateSwaggerComments(tag, method, routePath);

        // Remove existing #swagger comments
        node.comments = (node.comments || []).filter(
          comment => !comment.value.includes('#swagger')
        );

        // Attach new block comment
        node.comments.push(
          recast.types.builders.commentBlock(commentText, true, false)
        );
      }

      this.traverse(path);
    },
  });

  const output = recast.print(ast).code;
  fs.writeFileSync(fullPath, output);
  console.log(`✅ Updated Swagger comments in: ${file}`);
}

// Process all files in the routes directory
fs.readdirSync(routesDir).forEach(updateSwaggerCommentsInFile);
