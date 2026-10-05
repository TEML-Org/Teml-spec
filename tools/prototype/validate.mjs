// Validates TEML documents against the JSON Schema (structure only), with line numbers.
import Ajv from "ajv/dist/2020.js"; import addFormats from "ajv-formats"; import fs from "fs";
import { parse } from "./teml-core.mjs";
// Usage: node validate.mjs <schema.json> <file.teml.yaml>...
const [schemaPath, ...files] = process.argv.slice(2);
const ajv = new Ajv({ allErrors: true, strict: true, strictTypes: false, strictRequired: false, allowMatchingProperties: true }); addFormats(ajv);
const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
// A JSON Pointer such as /slices/2/BookRoom/agg, as a path into the parsed YAML.
const pathOf = ptr => ptr.split("/").slice(1).map(s => s.replace(/~1/g, "/").replace(/~0/g, "~")).map(s => (/^\d+$/.test(s) ? +s : s));
for (const f of files) {
  const { data, problems, lineAt } = parse(fs.readFileSync(f, "utf8"));
  if (data === null) { console.log("INVALID", f, `\n    line ${problems[0].line}: YAML ${problems[0].message}`); process.exitCode = 1; continue; }
  const ok = validate(data);
  console.log(ok ? "VALID  " : "INVALID", f);
  if (ok) continue;
  process.exitCode = 1;
  for (const e of validate.errors.slice(0, 6))
    console.log(`    line ${lineAt(pathOf(e.instancePath)).line}:`, e.instancePath, e.message, JSON.stringify(e.params));
}
