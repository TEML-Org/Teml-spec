// Checks TEML documents against the semantic rules in spec §14 (the rules live in teml-core.mjs).
// Errors for compliant documents, warnings for sketches; exits non-zero on any error.
// Usage: node check.mjs <file.teml.yaml>...
import fs from "fs";
import { parse } from "./teml-core.mjs";

for (const file of process.argv.slice(2)) {
  const { data, problems } = parse(fs.readFileSync(file, "utf8"));
  const count = level => problems.filter(p => p.level === level).length;
  const kind = data?.apiVersion !== undefined ? "compliant" : "sketch";
  console.log(`${file.split("/").pop()} (${kind}): ${count("error")} errors, ${count("warning")} warnings`);
  for (const p of problems)
    console.log(`  ${p.level === "error" ? "ERROR" : "warn "} line ${p.line}: ${p.code} ${p.where ? p.where + ": " : ""}${p.message}`);
  if (count("error")) process.exitCode = 1;
}
