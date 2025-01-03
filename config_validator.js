const Ajv = require("ajv/dist/2020");
const draft7MetaSchema = require("ajv/dist/refs/json-schema-draft-07.json");
const yaml = require("yaml");
const fs = require("fs");
const path = require("node:path");

const schemaFile = path.resolve(__dirname, "config_schema.yaml");
const schema = yaml.parse(fs.readFileSync(schemaFile, "utf8"));
delete schema.$schema; // MetaSchema is built in into ajv

const ajv = new Ajv({allErrors: false, unevaluated: false});
ajv.addMetaSchema(draft7MetaSchema);
const validate = ajv.compile(schema);

module.exports = function configValidator(config) {
  const valid = validate(config);
  if(!valid) {
    console.log(validate.errors);
    process.exit(1);
  }
};
