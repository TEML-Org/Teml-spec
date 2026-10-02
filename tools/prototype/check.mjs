// Prototype semantic checker for TEML v-alpha-001 (spec §12). Works on the YAML AST
// so aliases resolve by anchor and view overrides are read before merging (§5.2).
import YAML, { isMap, isSeq, isScalar, isAlias } from "yaml";
import fs from "fs";

const PRIM = { g:"g", guid:"g", uuid:"g", s:"s", str:"s", string:"s", int:"int", i:"int", integer:"int",
  dec:"dec", decimal:"dec", float:"float", f:"float", bool:"bool", b:"bool", boolean:"bool", date:"date",
  time:"time", dt:"dt", datetime:"dt", timestamp:"dt", dur:"dur", duration:"dur", uri:"uri", url:"uri", any:"any" };

for (const file of process.argv.slice(2)) {
  const doc = YAML.parseDocument(fs.readFileSync(file, "utf8"), { merge: true });
  const out = []; const err = m => out.push("  ERROR " + m); const warn = m => out.push("  warn  " + m);
  const root = doc.contents, js = doc.toJS({ maxAliasCount: -1 });
  const compliant = js.apiVersion !== undefined;
  const E = compliant ? err : warn;
  if (compliant && js.apiVersion !== "teml.org/v-alpha-001") err(`E1 unsupported apiVersion ${js.apiVersion}`);
  if (compliant && !js.metadata?.name) err("E1 metadata.name missing");

  // Named lists -> registries keyed by name, plus anchor -> (kind, name)
  const reg = { types: new Map(), aggs: new Map(), views: new Map(), wfes: new Map(), slices: new Map() };
  const byAnchor = new Map();
  for (const kind of Object.keys(reg)) {
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
  const resolve = (node, kind, where) => {
    if (isAlias(node)) {
      const t = byAnchor.get(node.source);
      if (!t) return E(`E3 ${where}: alias *${node.source} is not the anchor of any definition`);
      if (t.kind !== kind) return E(`E3 ${where}: *${node.source} is a ${t.kind} entry, expected ${kind}`);
      return t.name;
    }
    if (isScalar(node)) {
      if (!reg[kind].has(String(node.value))) return E(`E3 ${where}: no ${kind} named ${node.value}`);
      return String(node.value);
    }
    E(`E3 ${where}: expected a reference to ${kind}`);
  };

  // Types
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
  for (const [n, body] of reg.types) {
    if (n in PRIM || n === "x") E(`E4 type ${n} shadows a primitive`);
    if (!(isMap(body) && body.has("enum"))) checkProps(body, `types.${n}`);
  }
  for (const k of ["aggs", "views"]) for (const [n, body] of reg[k]) checkProps(body, `${k}.${n}`);

  // Slices
  const events = new Map(), commands = new Map(), viewUsed = new Set(), used = new Set();
  const propKeys = n => (isMap(n) ? n.items.map(p => String(p.key.value)) : null);
  const sliceJs = Object.fromEntries((js.slices ?? []).map(o => Object.entries(o)[0]));
  for (const [sname, s] of reg.slices) {
    const w = `slices.${sname}`;
    if (!isMap(s)) continue;
    if (s.has("agg")) used.add("aggs:" + resolve(s.get("agg", true), "aggs", `${w}.agg`));
    // command
    const c = s.get("command", true);
    const cname = isScalar(c) ? String(c.value) : isMap(c) && c.get("name") ? String(c.get("name")) : sname;
    if (commands.has(cname)) warn(`W4 command ${cname} issued by more than one slice`);
    commands.set(cname, isMap(c) ? propKeys(c.get("props", true)) : null);
    if (isMap(c) && c.get("props", true)) checkProps(c.get("props", true), `${w}.command.props`);
    // events
    const evs = s.get("events", true)?.items ?? (s.get("event", true) ? [s.get("event", true)] : []);
    if (!evs.length) E(`E5 ${w}: no event`);
    if (s.has("event") && s.has("events")) E(`E5 ${w}: both event and events`);
    for (const e of evs) {
      const en = isScalar(e) ? String(e.value) : String(e.get("name"));
      if (events.has(en)) E(`E2 event ${en} defined by more than one slice`);
      events.set(en, isMap(e) ? propKeys(e.get("props", true)) : null);
      if (isMap(e)) checkProps(e.get("props", true), `${w}.event ${en}`);
      if (!/(ed|Paid|Sent|Built|Made|Done|Left|Held|Kept|Sold|Taken|Given|Won|Lost)([A-Z]|$)/.test(en)) warn(`W1 event ${en} may not be past tense`);
    }
    // views (+ overrides read from the AST, not the merged result)
    for (const [i, v] of (s.get("views", true)?.items ?? []).entries()) {
      const where = `${w}.views[${i}]`;
      if (isMap(v)) {
        const merge = v.items.find(p => p.key?.source === "<<" || p.key?.value === "<<");
        if (!merge) { E(`E3 ${where}: inline map without <<: *View`); continue; }
        const vn = resolve(merge.value, "views", where); if (!vn) continue;
        viewUsed.add(vn); used.add("views:" + vn);
        const vbody = reg.views.get(vn);
        for (const p of v.items) {
          if (p === merge) continue;
          const key = String(p.key.value), val = String(p.value?.value);
          if (!vbody.has(key)) E(`E6 ${where}: ${vn} has no property ${key}`);
          else if (val !== "x") {
            const vt = vbody.get(key, true);
            const norm = t => String(t).replace(/^[A-Za-z0-9_]+/, b => PRIM[b] ?? b);
            if (!isScalar(vt) || norm(vt.value) !== norm(val)) E(`E6 ${where}: ${key}: ${val} differs from ${vn}'s type`);
          }
        }
      } else { const vn = resolve(v, "views", where); if (vn) { viewUsed.add(vn); used.add("views:" + vn); } }
    }
    for (const x of s.get("wfes", true)?.items ?? []) used.add("wfes:" + resolve(x, "wfes", `${w}.wfes`));
    const trig = s.get("trigger", true);
    if (isMap(trig) && trig.has("wfe")) used.add("wfes:" + resolve(trig.get("wfe", true), "wfes", `${w}.trigger.wfe`));
  }
  // Specs (after all events/commands are known)
  for (const [sname, s] of Object.entries(sliceJs)) for (const [i, sp] of (s.specs ?? []).entries()) {
    const w = `slices.${sname}.specs[${i}] "${sp.name}"`;
    const check = (inst, allowed, part) => {
      const [n, data] = Object.entries(inst)[0];
      if (n === "error") return part === "then" ? undefined : E(`E7 ${w}: error only allowed in then`);
      const kind = allowed.find(k => k.map.has(n));
      if (!kind) return E(`E7 ${w}.${part}: ${n} is not a known ${allowed.map(k => k.label).join(" or ")}`);
      const keys = kind.map.get(n);
      for (const k of Object.keys(data ?? {})) if (keys && !keys.includes(k)) E(`E7 ${w}.${part}: ${n} has no prop ${k}`);
    };
    const EV = { label: "event", map: events }, CMD = { label: "command", map: commands };
    for (const g of sp.given ?? []) check(g, [EV], "given");
    if (sp.when) check(sp.when, [CMD], "when");
    for (const t of sp.then ?? []) check(t, sp.when ? [EV] : [EV, CMD], "then");
  }
  for (const vn of reg.views.keys()) if (!viewUsed.has(vn)) warn(`W2 view ${vn} is not updated by any slice`);
  for (const k of ["aggs", "wfes"]) for (const n of reg[k].keys()) if (!used.has(`${k}:${n}`)) warn(`W3 ${k} ${n} is never referenced`);

  console.log(`${file.split("/").pop()} (${compliant ? "compliant" : "sketch"}): ${out.filter(l => l.includes("ERROR")).length} errors, ${out.filter(l => l.includes("warn")).length} warnings`);
  out.forEach(l => console.log(l));
}
