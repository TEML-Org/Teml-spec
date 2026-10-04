// Validates TEML documents against the JSON Schema (structure only).
import Ajv from "ajv/dist/2020.js"; import addFormats from "ajv-formats"; import YAML from "yaml"; import fs from "fs";
// Usage: node validate.mjs <schema.json> <file.teml.yaml>...
const [schemaPath, ...files] = process.argv.slice(2);
const ajv = new Ajv({ allErrors: true, strict: true, strictTypes: false, strictRequired: false, allowMatchingProperties: true }); addFormats(ajv);
const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
for (const f of files) {
  let doc;
  try { doc = YAML.parse(fs.readFileSync(f, "utf8"), { version: "1.2" }); }
  catch (e) { console.log("INVALID", f, "\n    YAML", e.message.split("\n")[0]); process.exitCode = 1; continue; }
  const ok = validate(doc);
  console.log(ok ? "VALID  " : "INVALID", f);
  if (ok) continue;
  process.exitCode = 1;
  for (const e of validate.errors.slice(0, 6)) console.log("   ", e.instancePath, e.message, JSON.stringify(e.params));
}
