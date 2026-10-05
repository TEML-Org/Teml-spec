// Tests for teml-core.mjs. Run with `npm test`.
// Each fixture in fixtures/ lists the errors it must produce as "# expect: <code> line <n>" comments.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { parse } from "../teml-core.mjs";

const here = f => new URL(f, import.meta.url).pathname;
const read = f => fs.readFileSync(f, "utf8");
const errors = r => r.problems.filter(p => p.level === "error").map(p => `${p.code} line ${p.line}`).sort();

const examples = ["../../../Examples/", "../../../Examples/features/"]
  .flatMap(d => fs.readdirSync(here(d)).filter(f => f.endsWith(".yaml")).map(f => here(d + f)));

for (const file of examples) test(`example ${file.split("/").pop()} has no errors and a model`, () => {
  const r = parse(read(file));
  assert.deepEqual(errors(r), []);
  assert.ok(r.model.slices.length > 0);
});

for (const f of fs.readdirSync(here("fixtures/"))) test(`fixture ${f}`, () => {
  const text = read(here("fixtures/" + f));
  const expected = [...text.matchAll(/^# expect: (\S+) line (\d+)$/gm)].map(m => `${m[1]} line ${m[2]}`).sort();
  assert.ok(expected.length, "fixture lists no expected errors");
  const r = parse(text);
  assert.deepEqual(errors(r), expected);
  // A broken model still draws as far as it can; only unparseable YAML has no model.
  assert.equal(r.model === null, expected.some(e => e.startsWith("YAML")));
});

test("the hotel model has the board's lanes and slices", () => {
  const { model } = parse(read(here("../../../Examples/hotel.teml.yaml")));
  assert.equal(model.slices.length, 15);
  assert.equal(model.actors.length, 4);
  assert.deepEqual(model.systems.map(s => s.name), ["PaymentProvider"]);
  assert.equal(model.aggs.length, 3);
});

test("a sketch gets warnings, not errors", () => {
  const r = parse(read(here("../../../Examples/user-sketch.teml.yaml")));
  assert.equal(r.model.compliant, false);
  assert.deepEqual(errors(r), []);
  assert.ok(r.problems.length > 0);
});

test("a reference moves an event to its aggregate", () => {
  const src = read(here("../../../Examples/hotel.teml.yaml"));
  const slice = m => m.slices.find(s => s.kind === "change" && s.agg === "RoomAgg");
  const before = slice(parse(src).model);
  const after = parse(src.replace(/agg: RoomAgg\b/, "agg: BookingAgg")).model.slices.find(s => s.name === before.name);
  assert.equal(after.agg, "BookingAgg");
});

test("lineAt finds a path into the document", () => {
  const r = parse("aggs:\n  - Room: { roomId: g }\nslices:\n  - AddRoom:\n      agg: Room\n");
  assert.equal(r.lineAt(["slices", 0, "AddRoom", "agg"]).line, 5);
  assert.equal(r.lineAt(["slices", 0, "AddRoom", "missing"]).line, 5);
});
