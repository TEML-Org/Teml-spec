// Prototype semantic checker for TEML (spec §14). Works on the YAML AST so aliases
// resolve by anchor and view overrides are read before merging (§5.2).
// Usage: node check.mjs <file.teml.yaml>...
import YAML, { isMap, isSeq, isScalar, isAlias } from "yaml";
import fs from "fs";

const VERSIONS = ["teml.org/v-alpha-001", "teml.org/v-alpha-002"];
const PRIM = { g:"g", guid:"g", uuid:"g", s:"s", str:"s", string:"s", int:"int", i:"int", integer:"int",
  dec:"dec", decimal:"dec", float:"float", f:"float", bool:"bool", b:"bool", boolean:"bool", date:"date",
  time:"time", dt:"dt", datetime:"dt", timestamp:"dt", dur:"dur", duration:"dur", uri:"uri", url:"uri", any:"any" };
const LISTS = ["types", "actors", "screens", "aggs", "views", "wfes", "systems", "slices"];
const CHANGE_KEYS = ["agg", "command", "event", "events", "views", "wfes", "trigger"];

for (const file of process.argv.slice(2)) {
  const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"), { merge: true });
  const out = []; const err = m => out.push("  ERROR " + m); const warn = m => out.push("  warn  " + m);
  // YAML-level problems (syntax errors, aliases with no matching anchor) stop the check here.
  let js;
  try { if (doc.errors.length) throw doc.errors[0]; js = doc.toJS({ maxAliasCount: -1 }); }
  catch (e) { console.log(`${file.split("/").pop()}: 1 errors, 0 warnings\n  ERROR YAML ${e.message.split("\n")[0]}`); continue; }
  const root = doc.contents;
  const compliant = js.apiVersion !== undefined;
  const E = compliant ? err : warn;
  if (compliant && !VERSIONS.includes(js.apiVersion)) err(`E1 unsupported apiVersion ${js.apiVersion}`);
  if (compliant && !js.metadata?.name) err("E1 metadata.name missing");

  // E2: anchors must be unique document-wide
  const anchors = new Set();
  YAML.visit(doc, (_, node) => {
    if (node?.anchor) { if (anchors.has(node.anchor)) E(`E2 anchor &${node.anchor} is defined more than once`); anchors.add(node.anchor); }
  });

  // Named lists -> registries keyed by name, plus anchor -> (kind, name)
  const reg = Object.fromEntries(LISTS.map(k => [k, new Map()]));
  const byAnchor = new Map();
  for (const kind of LISTS) {
    const list = root.get(kind, true);
    if (!isSeq(list)) continue;
    for (const item of list.items) {
      const pair = item.items?.[0]; if (!pair) continue;
      const name = String(pair.key.value);
      if (reg[kind].has(name)) E(`E2 duplicate ${kind} name ${name}`);
      reg[kind].set(name, pair.value);
      if (pair.value?.anchor) byAnchor.set(pair.value.anchor, { kind, name });
    }
  }
  const used = new Set(); const mark = (kind, name) => name && used.add(`${kind}:${name}`);
  const resolve = (node, kind, where) => {
    if (isAlias(node)) {
      const t = byAnchor.get(node.source);
      if (!t) return E(`E3 ${where}: alias *${node.source} is not the anchor of any definition`);
      if (t.kind !== kind) return E(`E3 ${where}: *${node.source} is a ${t.kind} entry, expected ${kind}`);
      return mark(kind, t.name), t.name;
    }
    if (isScalar(node)) {
      const n = String(node.value);
      // Without a `screens` list, screen names are free text (§10.2).
      if (kind === "screens" && !root.has("screens")) return n;
      if (!reg[kind].has(n)) return E(`E3 ${where}: no ${kind} entry named ${n}`);
      return mark(kind, n), n;
    }
    E(`E3 ${where}: expected a reference to ${kind}`);
  };

  // E4: types
  const typeOk = (expr, where) => {
    const base = String(expr).replace(/(\[\])*\??$/, "");
    if (base === "x") return E(`E4 ${where}: 'x' is only allowed as a view override marker`);
    if (!(base in PRIM) && !reg.types.has(base)) E(`E4 ${where}: unknown type ${expr}`);
  };
  const checkProps = (node, where) => {
    if (node == null) return;
    if (isAlias(node)) node = node.resolve(doc);
    if (isSeq(node) && node.items.every(isScalar)) return E(`E4 ${where}: untyped props (sketch style)`);
    if (!isMap(node)) return E(`E4 ${where}: props must be a map`);
    for (const p of node.items) {
      const k = `${where}.${p.key.value}`, v = p.value;
      if (isScalar(v)) v.value == null ? E(`E4 ${k}: no type`) : typeOk(v.value, k);
      else if (isSeq(v)) isScalar(v.items[0]) ? typeOk(v.items[0].value, k) : checkProps(v.items[0], k);
      else checkProps(v, k);
    }
  };
  const propKeys = n => (isMap(n) ? n.items.map(p => String(p.key.value)) : null);
  for (const [n, body] of reg.types) {
    if (n in PRIM || n === "x") E(`E4 type ${n} shadows a primitive`);
    if (!(isMap(body) && body.has("enum"))) checkProps(body, `types.${n}`);
  }
  for (const k of ["aggs", "views"]) for (const [n, body] of reg[k]) checkProps(body, `${k}.${n}`);

  // Actors and screens
  for (const [n, body] of reg.screens) if (isMap(body) && body.has("actor")) resolve(body.get("actor", true), "actors", `screens.${n}.actor`);

  // Events: from slices and from external systems share one namespace (E2)
  const events = new Map(), commands = new Map();
  const wfeTriggered = new Set(), wfeReads = new Set(), viewUpdated = new Set(), viewRead = new Set();
  const addEvent = (e, where) => {
    const en = isScalar(e) ? String(e.value) : String(e.get("name"));
    if (events.has(en)) E(`E2 event ${en} is defined more than once`);
    events.set(en, isMap(e) ? propKeys(e.get("props", true)) : null);
    if (isMap(e)) checkProps(e.get("props", true), `${where} ${en}`);
    if (!/(ed|Paid|Sent|Built|Made|Done|Left|Held|Kept|Sold|Taken|Given|Won|Lost)([A-Z]|$)/.test(en)) warn(`W1 event ${en} may not be past tense`);
    return en;
  };
  for (const [n, body] of reg.systems) for (const e of (isMap(body) ? body.get("events", true)?.items : null) ?? []) {
    addEvent(e, `systems.${n}.event`);
    for (const w of e.get("wfes", true)?.items ?? []) wfeTriggered.add(resolve(w, "wfes", `systems.${n}.events.wfes`));
  }

  // Slices
  const kinds = new Map();
  for (const [sname, s] of reg.slices) {
    const w = `slices.${sname}`;
    if (!isMap(s)) continue;
    const isChange = s.has("event") || s.has("events"), isView = s.has("view");
    if (isChange === isView) { E(`E5 ${w}: must have either an event (change slice) or a view (view slice)${isChange ? ", not both" : ""}`); continue; }

    if (isView) {
      kinds.set(sname, { kind: "view" });
      for (const k of CHANGE_KEYS) if (s.has(k)) E(`E5 ${w}: view slices cannot have '${k}'`);
      const vn = resolve(s.get("view", true), "views", `${w}.view`);
      if (vn) viewRead.add(vn);
      kinds.get(sname).view = vn;
      for (const [i, r] of (s.get("readBy", true)?.items ?? []).entries()) {
        if (!isMap(r) || r.items.length !== 1) { E(`E5 ${w}.readBy[${i}]: expected one of screen: or wfe:`); continue; }
        if (r.has("screen")) resolve(r.get("screen", true), "screens", `${w}.readBy[${i}].screen`);
        else if (r.has("wfe")) wfeReads.add(resolve(r.get("wfe", true), "wfes", `${w}.readBy[${i}].wfe`));
        else E(`E5 ${w}.readBy[${i}]: expected one of screen: or wfe:`);
      }
      continue;
    }

    if (s.has("event") && s.has("events")) E(`E5 ${w}: both event and events`);
    if (s.has("agg")) resolve(s.get("agg", true), "aggs", `${w}.agg`);
    const trig = s.get("trigger", true);
    let byWfe = null;
    if (isMap(trig)) {
      if (trig.has("screen")) resolve(trig.get("screen", true), "screens", `${w}.trigger.screen`);
      if (trig.has("wfe")) byWfe = resolve(trig.get("wfe", true), "wfes", `${w}.trigger.wfe`);
    }
    kinds.set(sname, { kind: byWfe ? "wfe" : "change", issuer: byWfe });
    const c = s.get("command", true);
    const cname = isScalar(c) ? String(c.value) : isMap(c) && c.get("name") ? String(c.get("name")) : sname;
    if (commands.has(cname)) warn(`W1 command ${cname} is issued by more than one slice`);
    commands.set(cname, isMap(c) ? propKeys(c.get("props", true)) : null);
    kinds.get(sname).command = cname;
    if (isMap(c) && c.get("props", true)) checkProps(c.get("props", true), `${w}.command.props`);
    for (const e of s.get("events", true)?.items ?? [s.get("event", true)]) addEvent(e, `${w}.event`);

    for (const [i, v] of (s.get("views", true)?.items ?? []).entries()) {
      const where = `${w}.views[${i}]`;
      if (!isMap(v)) { const vn = resolve(v, "views", where); if (vn) viewUpdated.add(vn); continue; }
      const merge = v.items.find(p => p.key?.source === "<<" || p.key?.value === "<<");
      if (!merge) { E(`E3 ${where}: inline map without <<: *View`); continue; }
      const vn = resolve(merge.value, "views", where); if (!vn) continue;
      viewUpdated.add(vn);
      const vbody = reg.views.get(vn);
      const norm = t => String(t).replace(/^[A-Za-z0-9_]+/, b => PRIM[b] ?? b);
      for (const p of v.items) {
        if (p === merge) continue;
        const key = String(p.key.value), val = String(p.value?.value);
        if (!vbody.has(key)) E(`E6 ${where}: ${vn} has no property ${key}`);
        else if (val !== "x" && (!isScalar(vbody.get(key, true)) || norm(vbody.get(key, true).value) !== norm(val)))
          E(`E6 ${where}: ${key}: ${val} differs from ${vn}'s type`);
      }
    }
    for (const x of s.get("wfes", true)?.items ?? []) wfeTriggered.add(resolve(x, "wfes", `${w}.wfes`));
  }

  // Specs (after every event, command and view is known) — §13
  const sliceJs = Object.fromEntries((js.slices ?? []).map(o => Object.entries(o)[0]));
  const views = new Map([...reg.views].map(([n, b]) => [n, propKeys(b)]));
  for (const [sname, s] of Object.entries(sliceJs)) for (const [i, sp] of (s?.specs ?? []).entries()) {
    const k = kinds.get(sname); if (!k) continue;
    const w = `slices.${sname}.specs[${i}] "${sp.name}"`;
    const check = (inst, allowed, part) => {
      const [n, data] = Object.entries(inst)[0];
      if (n === "error") return part === "then" && k.kind === "change" ? undefined : E(`E7 ${w}: error is only allowed in a change slice's then`);
      const hit = allowed.find(a => a.map.has(n));
      if (!hit) return E(`E7 ${w}.${part}: ${n} is not a known ${allowed.map(a => a.label).join(" or ")}`);
      const keys = hit.map.get(n);
      if (data && typeof data === "object" && !Array.isArray(data))
        for (const p of Object.keys(data)) if (keys && !keys.includes(p)) E(`E7 ${w}.${part}: ${n} has no prop ${p}`);
    };
    const EV = { label: "event", map: events }, CMD = { label: "command", map: commands }, VIEW = { label: "view", map: views };
    for (const g of sp.given ?? []) check(g, [EV], "given");
    if (k.kind === "change") {
      if (!sp.when) E(`E7 ${w}: a change slice triggered by a screen needs a when`);
      else check(sp.when, [CMD], "when");
      for (const t of sp.then ?? []) check(t, [EV], "then");
    } else if (k.kind === "wfe") {
      if (sp.when) E(`E7 ${w}: a WFE-triggered slice has no when; then lists the commands the WFE issues`);
      for (const t of sp.then ?? []) check(t, [CMD], "then");
    } else {
      if (sp.when) E(`E7 ${w}: a view slice has no when`);
      const t = sp.then ?? [];
      if (t.length !== 1 || Object.keys(t[0])[0] !== k.view) E(`E7 ${w}: then must be exactly one instance of ${k.view}`);
      else check(t[0], [VIEW], "then");
    }
  }

  // Warnings
  for (const vn of reg.views.keys()) {
    if (!viewUpdated.has(vn)) warn(`W2 view ${vn} is not updated by any slice`);
    else if (!viewRead.has(vn) && reg.slices.size && [...kinds.values()].some(x => x.kind === "view")) warn(`W4 view ${vn} is never read by a view slice`);
  }
  for (const k of ["actors", "screens", "aggs", "wfes"])
    for (const n of reg[k].keys()) if (!used.has(`${k}:${n}`)) warn(`W3 ${k} ${n} is never referenced`);
  for (const x of kinds.values())
    if (x.kind === "wfe" && !wfeTriggered.has(x.issuer) && !wfeReads.has(x.issuer)) warn(`W5 WFE ${x.issuer} issues ${x.command} but nothing triggers it and it reads no view`);

  console.log(`${file.split("/").pop()} (${compliant ? "compliant" : "sketch"}): ${out.filter(l => l.includes("ERROR")).length} errors, ${out.filter(l => l.includes("warn")).length} warnings`);
  out.forEach(l => console.log(l));
}
