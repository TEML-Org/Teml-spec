// Tests for the board layout in board/board.js, against the acceptance criteria in issue #2.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { parse } from "../teml-core.mjs";
import { layout } from "../board/board.js";

const here = f => new URL(f, import.meta.url).pathname;
const read = f => fs.readFileSync(f, "utf8");
const hotel = read(here("../../../Examples/hotel.teml.yaml"));
const placed = L => L.notes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)) && L.lanes.every(l => Number.isFinite(l.y));
const laneOf = (L, kind, name) => L.notes.find(n => n.kind === kind && n.name === name)?.lane;

const files = ["../../../Examples/", "../../../Examples/features/", "fixtures/"]
  .flatMap(d => fs.readdirSync(here(d)).filter(f => f.endsWith(".yaml")).map(f => here(d + f)));
for (const file of files) test(`layout of ${file.split("/").pop()} places every sticky`, () => {
  const { model } = parse(read(file));
  if (model) assert.ok(placed(layout(model)));
});

test("hotel: 15 slices, 4 actor lanes, a Payment Provider lane, 3 aggregate lanes", () => {
  const L = layout(parse(hotel).model), ids = L.lanes.map(l => l.id);
  assert.equal(parse(hotel).model.slices.length, 15);
  assert.deepEqual(ids.filter(l => l.startsWith("actor:")), ["actor:Guest", "actor:Manager", "actor:FrontDesk", "actor:Housekeeping"]);
  assert.deepEqual(ids.filter(l => l.startsWith("sys:")), ["sys:PaymentProvider"]);
  assert.deepEqual(ids.filter(l => l.startsWith("agg:")), ["agg:GuestAgg", "agg:RoomAgg", "agg:BookingAgg"]);
});

test("in every view slice, readers are drawn to the right of the read model", () => {
  for (const file of files) {
    const { model } = parse(read(file));
    if (!model) continue;
    for (const e of layout(model).edges.filter(e => e.t === "read")) assert.ok(e.b.x > e.a.x + 140, `${file}: ${e.b.name}`);
  }
});

test("changing a slice's agg moves its events to that aggregate's lane", () => {
  assert.equal(laneOf(layout(parse(hotel).model), "evt", "RoomCleaned"), "agg:RoomAgg");
  const moved = hotel.replace(/(MarkRoomCleaned:[\s\S]*?agg: )RoomAgg/, "$1BookingAgg");
  assert.equal(laneOf(layout(parse(moved).model), "evt", "RoomCleaned"), "agg:BookingAgg");
});

test("an undeclared aggregate is reported with its line and gets its own lane", () => {
  const broken = hotel.replace(/(MarkRoomCleaned:[\s\S]*?agg: )RoomAgg/, "$1Nope");
  const line = broken.slice(0, broken.indexOf("agg: Nope")).split("\n").length;
  const r = parse(broken);
  assert.ok(r.problems.some(p => p.level === "error" && p.line === line && p.where.endsWith(".agg")));
  const L = layout(r.model), lane = L.lanes.find(l => l.id === "agg:Nope");
  assert.ok(placed(L));
  assert.ok(lane?.undeclared);
  assert.equal(L.lanes.at(-1), lane, "undeclared aggregates come after the declared ones");
});

test("screens with an undeclared actor and undeclared systems get lanes too", () => {
  const r = parse(`apiVersion: teml.org/v-alpha-003
screens:
  - Kiosk: { actor: Ghost }
slices:
  - Order:
      agg: Cart
      trigger: { screen: Kiosk }
      events: [ Ordered: {} ]
  - Pay:
      agg: Cart
      trigger: { system: Bank }
      events: [ Paid: {} ]
`);
  const L = layout(r.model);
  assert.ok(placed(L));
  assert.deepEqual(L.lanes.filter(l => l.undeclared).map(l => l.id), ["actor:Ghost", "sys:Bank", "agg:Cart"]);
});

test("a document with no slices lays out an empty board", () => {
  for (const text of ["apiVersion: teml.org/v-alpha-003\nmetadata: { name: Empty }\n", "slices: []\n", "metadata: { name: Sketch }\n"]) {
    const L = layout(parse(text).model);
    assert.equal(L.notes.length, 0);
  }
});

test("repeated names in different slices keep distinct ids", () => {
  const r = parse(`slices:
  - A: { agg: X, events: [ Done ] }
  - B: { agg: X, events: [ Done ] }
`);
  const ids = layout(r.model).notes.map(n => n.id);
  assert.equal(new Set(ids).size, ids.length);
});
