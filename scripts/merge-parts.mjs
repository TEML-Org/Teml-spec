// Merges a model's root file with its parts (spec §3.2), for CI.
//
//   node scripts/merge-parts.mjs <root> [-o merged.json] [--same-as <file>]
//
// -o writes the merged model as JSON, for the schema check.
// --same-as fails unless the merged model equals that single-file model.
// Exits 1 on any problem. Needs the yaml package (npm install --no-save yaml).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse } from "yaml";

const LISTS = ["types", "actors", "screens", "systems", "automations", "aggs", "views", "slices"];
const HEADER = ["apiVersion", "metadata", "include"];

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const out = opt("-o"), sameAs = opt("--same-as"), [rootPath] = args;
if (!rootPath) { console.error("usage: merge-parts.mjs <root> [-o merged.json] [--same-as <file>]"); process.exit(2); }

const problems = [];
const read = path => parse(readFileSync(path, "utf8")) ?? {};
const root = read(rootPath);
const merged = structuredClone(root);
const include = root.include ?? [];
if (!Array.isArray(include)) problems.push(`${rootPath}: include must be a list`);

const seen = new Set();
for (const p of Array.isArray(include) ? include : []) {
  const where = `${rootPath}: include ${JSON.stringify(p)}`;
  if (typeof p !== "string" || p.startsWith("/") || /[:\\]/.test(p) || p.split("/").includes("..")) { problems.push(`${where} is not a relative path inside the root's folder`); continue; }
  if (seen.has(p)) { problems.push(`${where} is listed twice`); continue; }
  seen.add(p);
  let part;
  try { part = read(join(dirname(rootPath), p)); } catch (e) { problems.push(`${where} cannot be read: ${e.message.split("\n")[0]}`); continue; }
  for (const k of HEADER) if (k in part) problems.push(`${p}: a part cannot contain ${k}`);
  for (const k of LISTS) if (part[k] !== undefined) merged[k] = [...(merged[k] ?? []), ...part[k]];
}

if (sameAs) {
  const { include: _, ...model } = merged;
  const single = read(sameAs);
  for (const k of new Set([...Object.keys(model), ...Object.keys(single)]))
    if (!isDeepStrictEqual(model[k], single[k])) problems.push(`${rootPath}: merged ${k} differs from ${sameAs}`);
}
if (out) writeFileSync(out, JSON.stringify(merged, null, 2));
for (const p of problems) console.error(p);
if (problems.length) process.exit(1);
console.log(`${rootPath}: merged ${seen.size} parts${sameAs ? `, same model as ${sameAs}` : ""}`);
