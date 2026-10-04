// Prototype semantic checker for TEML v-alpha-003 (spec §14).
// References are plain names (§5), so it works on the parsed YAML.
// Usage: node check.mjs <file.teml.yaml>...
import YAML from "yaml";
import fs from "fs";

const VERSIONS = ["teml.org/v-alpha-003"];
const PRIM = new Set(["g", "s", "int", "dec", "bool", "date", "dt", "any"]);
const LISTS = ["types", "actors", "screens", "systems", "automations", "aggs", "views", "slices"];
const CHANGE_KEYS = ["agg", "trigger", "command", "events", "views"];
const isMap = v => v !== null && typeof v === "object" && !Array.isArray(v);
// A named list item is a single-key mapping, or (in a sketch) a bare name.
const entry = o => (typeof o === "string" ? [o, null] : isMap(o) && Object.keys(o).length === 1 ? Object.entries(o)[0] : null);

for (const file of process.argv.slice(2)) {
  const out = []; const err = m => out.push("  ERROR " + m); const warn = m => out.push("  warn  " + m);
  let js;
  try { js = YAML.parse(fs.readFileSync(file, "utf8")) ?? {}; }
  catch (e) { console.log(`${file.split("/").pop()}: 1 errors, 0 warnings\n  ERROR YAML ${e.message.split("\n")[0]}`); continue; }
  const compliant = js.apiVersion !== undefined;
  const E = compliant ? err : warn;
  if (compliant && !VERSIONS.includes(js.apiVersion)) err(`E1 unsupported apiVersion ${js.apiVersion}`);
  if (compliant && !js.metadata?.name) err("E1 metadata.name missing");

  // Named lists -> registries keyed by name (E2)
  const reg = Object.fromEntries(LISTS.map(k => [k, new Map()]));
  for (const kind of LISTS) for (const [i, item] of (js[kind] ?? []).entries()) {
    const e = entry(item);
    if (!e) { E(`E5 ${kind}[${i}]: expected a single-key mapping from a name to its body`); continue; }
    if (reg[kind].has(e[0])) E(`E2 duplicate ${kind} name ${e[0]}`);
    reg[kind].set(e[0], e[1]);
  }
  const used = new Set();
  const resolve = (name, kind, where) => {
    if (typeof name !== "string") return E(`E3 ${where}: a reference must be a name`);
    if (!reg[kind].has(name)) return E(`E3 ${where}: no ${kind} entry named ${name}`);
    used.add(`${kind}:${name}`); return name;
  };

  // E4: types
  const typeOk = (expr, where) => {
    const base = String(expr).replace(/(\[\])*\??$/, "");
    if (!PRIM.has(base) && !reg.types.has(base)) E(`E4 ${where}: unknown type ${expr}`);
  };
  const checkProps = (node, where) => {
    if (node == null) return E(`E4 ${where}: no props`);
    if (Array.isArray(node)) return E(`E4 ${where}: untyped props (sketch style)`);
    if (!isMap(node)) return E(`E4 ${where}: props must be a map`);
    for (const [p, v] of Object.entries(node)) {
      const k = `${where}.${p}`;
      if (typeof v === "string") typeOk(v, k);
      else if (v == null) E(`E4 ${k}: no type`);
      else if (Array.isArray(v)) E(`E4 ${k}: write a list type as T[]`);
      else checkProps(v, k);
    }
  };
  const propKeys = n => (isMap(n) ? Object.keys(n) : null);
  for (const [n, body] of reg.types) {
    if (PRIM.has(n)) E(`E4 type ${n} shadows a primitive`);
    if (isMap(body) && "enum" in body) { if (Object.keys(body).length > 1) E(`E4 type ${n}: an enum type has no other keys`); }
    else checkProps(body, `types.${n}`);
  }
  for (const k of ["aggs", "views"]) for (const [n, body] of reg[k]) checkProps(body, `${k}.${n}`);
  for (const [n, body] of reg.screens) if (body?.actor !== undefined) resolve(body.actor, "actors", `screens.${n}.actor`);

  // Slices
  const events = new Map(), commands = new Map(), kinds = new Map();
  const automationReads = new Set(), viewUpdated = new Set(), viewRead = new Set();
  for (const [sname, s] of reg.slices) {
    const w = `slices.${sname}`;
    if (!isMap(s)) { E(`E5 ${w}: a slice needs a body`); continue; }
    const isChange = "events" in s, isView = "view" in s;
    if (isChange === isView) { E(`E5 ${w}: must have either events (change slice) or a view (view slice)${isChange ? ", not both" : ""}`); continue; }

    if (isView) {
      for (const k of CHANGE_KEYS) if (k in s) E(`E5 ${w}: view slices cannot have '${k}'`);
      const vn = resolve(s.view, "views", `${w}.view`);
      if (vn) viewRead.add(vn);
      kinds.set(sname, { kind: "view", view: vn });
      for (const [i, r] of (s.readBy ?? []).entries()) {
        const where = `${w}.readBy[${i}]`;
        if (!isMap(r) || Object.keys(r).length !== 1) { E(`E5 ${where}: expected one of screen: or automation:`); continue; }
        if ("screen" in r) resolve(r.screen, "screens", `${where}.screen`);
        else if ("automation" in r) automationReads.add(resolve(r.automation, "automations", `${where}.automation`));
        else E(`E5 ${where}: expected one of screen: or automation:`);
      }
      continue;
    }

    if ("agg" in s) resolve(s.agg, "aggs", `${w}.agg`);
    let byAutomation = null;
    if (s.trigger !== undefined) {
      const t = s.trigger, where = `${w}.trigger`;
      if (!isMap(t) || Object.keys(t).length !== 1) E(`E5 ${where}: expected one of screen:, automation: or system:`);
      else if ("screen" in t) resolve(t.screen, "screens", `${where}.screen`);
      else if ("automation" in t) byAutomation = resolve(t.automation, "automations", `${where}.automation`) ?? t.automation;
      else if ("system" in t) resolve(t.system, "systems", `${where}.system`);
      else E(`E5 ${where}: expected one of screen:, automation: or system:`);
    }
    const c = s.command;
    const ce = c === undefined ? [sname, null] : entry(c);
    if (!ce) E(`E5 ${w}.command: expected a command name or CommandName: props`);
    const [cname, cprops] = ce ?? [sname, null];
    commands.set(cname, propKeys(cprops));
    kinds.set(sname, { kind: byAutomation ? "automation" : "change", issuer: byAutomation, command: cname });
    if (cprops !== null) checkProps(cprops, `${w}.command.${cname}`);

    for (const [i, ev] of (Array.isArray(s.events) ? s.events : []).entries()) {
      const e = entry(ev);
      if (!e) { E(`E5 ${w}.events[${i}]: expected an event name or EventName: props`); continue; }
      const [en, props] = e;
      if (events.has(en)) E(`E2 event ${en} is defined more than once`);
      events.set(en, propKeys(props));
      checkProps(props, `${w}.events.${en}`);
    }
    if (!Array.isArray(s.events) || !s.events.length) E(`E5 ${w}: events must be a non-empty list`);

    for (const [i, v] of (s.views ?? []).entries()) {
      const where = `${w}.views[${i}]`, e = entry(v);
      if (!e) { E(`E5 ${where}: expected a view name or ViewName: [props]`); continue; }
      const vn = resolve(e[0], "views", where); if (!vn) continue;
      viewUpdated.add(vn);
      if (e[1] == null) continue;
      if (!Array.isArray(e[1])) { E(`E6 ${where}: list the touched properties as [prop, …]`); continue; }
      const keys = propKeys(reg.views.get(vn)) ?? reg.views.get(vn) ?? [];
      for (const p of e[1]) if (!keys.includes(p)) E(`E6 ${where}: ${vn} has no property ${p}`);
    }
  }

  // Specs (after every event, command and view is known) — §13
  const views = new Map([...reg.views].map(([n, b]) => [n, propKeys(b)]));
  for (const [sname, s] of reg.slices) for (const [i, sp] of (s?.specs ?? []).entries()) {
    const k = kinds.get(sname); if (!k) continue;
    const w = `slices.${sname}.specs[${i}] "${sp.name}"`;
    const check = (inst, allowed, part) => {
      const [n, data] = Object.entries(inst)[0];
      if (n === "error") return part === "then" && k.kind === "change" ? undefined : E(`E7 ${w}: error is only allowed in a change slice's then`);
      const hit = allowed.find(a => a.map.has(n));
      if (!hit) return E(`E7 ${w}.${part}: ${n} is not a known ${allowed.map(a => a.label).join(" or ")}`);
      const keys = hit.map.get(n);
      if (isMap(data)) for (const p of Object.keys(data)) if (keys && !keys.includes(p)) E(`E7 ${w}.${part}: ${n} has no prop ${p}`);
    };
    const EV = { label: "event", map: events }, CMD = { label: "command", map: commands }, VIEW = { label: "view", map: views };
    for (const g of sp.given ?? []) check(g, [EV], "given");
    if (k.kind === "change") {
      if (!sp.when) E(`E7 ${w}: a change slice triggered by a screen or system needs a when`);
      else check(sp.when, [CMD], "when");
      for (const t of sp.then ?? []) check(t, [EV], "then");
    } else if (k.kind === "automation") {
      if (sp.when) E(`E7 ${w}: an automation-triggered slice has no when; then lists the commands the automation issues`);
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
    if (!viewUpdated.has(vn)) warn(`W1 view ${vn} is not updated by any slice`);
    else if (!viewRead.has(vn)) warn(`W3 view ${vn} is never read by a view slice`);
  }
  for (const k of ["actors", "screens", "systems", "automations", "aggs"])
    for (const n of reg[k].keys()) if (!used.has(`${k}:${n}`)) warn(`W2 ${k} ${n} is never referenced`);
  for (const x of kinds.values())
    if (x.kind === "automation" && !automationReads.has(x.issuer)) warn(`W4 automation ${x.issuer} issues ${x.command} but reads no view`);

  console.log(`${file.split("/").pop()} (${compliant ? "compliant" : "sketch"}): ${out.filter(l => l.includes("ERROR")).length} errors, ${out.filter(l => l.includes("warn")).length} warnings`);
  out.forEach(l => console.log(l));
}
