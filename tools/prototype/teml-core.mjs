// TEML core for v-alpha-003: parses a document, checks it against the rules in
// spec §14, and returns the normalized model that boards and other tools draw from.
// No file or DOM access, so the same code runs in Node and in the browser.
//
//   parse(text) -> { data, model, problems, lineAt }
//
// data:     the parsed YAML, or null when the YAML itself doesn't parse.
// model:    the normalized model (see README), or null when there is no usable document.
// problems: [{ level: "error" | "warning", code, where, message, line, col }].
//           A sketch (no apiVersion) gets warnings where a compliant document gets errors.
// lineAt:   (path) -> { line, col } for a path into data, such as ["slices", 2, "BookRoom", "agg"].
import { parseDocument, LineCounter } from "yaml";

export const VERSIONS = ["teml.org/v-alpha-003"];
const PRIM = new Set(["g", "s", "int", "dec", "bool", "date", "dt", "any"]);
const LISTS = ["types", "actors", "screens", "systems", "automations", "aggs", "views", "slices"];
const CHANGE_KEYS = ["agg", "trigger", "command", "events", "views"];
const isMap = v => v !== null && typeof v === "object" && !Array.isArray(v);
// A named list item is a single-key mapping, or (in a sketch) a bare name.
const entry = o => (typeof o === "string" ? [o, null] : isMap(o) && Object.keys(o).length === 1 ? Object.entries(o)[0] : null);
const propKeys = n => (isMap(n) ? Object.keys(n) : null);

// A path segment is a key, a list index, or a named list item { i, name, bare }.
// Named items show as their name ("slices.BookRoom.agg") and locate as index + key;
// a path that ends at a named item locates the item itself, so the line is the name's.
const show = path => path.map((s, k) => (typeof s === "number" ? `[${s}]` : (k ? "." : "") + (isMap(s) ? s.name : s))).join("");
const yamlPath = path => path.flatMap((s, k) => (isMap(s) ? (s.bare || k === path.length - 1 ? [s.i] : [s.i, s.name]) : [s]));

export function parse(text) {
  const lc = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lc });
  const lineAt = path => {
    const p = yamlPath(path);
    for (let n = p.length; n > 0; n--) {
      const node = doc.getIn(p.slice(0, n), true);
      if (node?.range) return lc.linePos(node.range[0]);
    }
    return doc.contents?.range ? lc.linePos(doc.contents.range[0]) : { line: 1, col: 1 };
  };
  const problems = [];
  if (doc.errors.length) {
    for (const e of doc.errors)
      problems.push({ level: "error", code: "YAML", where: "", message: e.message.split("\n")[0].replace(/ at line \d+, column \d+:$/, ""), ...(e.linePos?.[0] ?? { line: 1, col: 1 }) });
    return { data: null, model: null, problems, lineAt };
  }
  const data = doc.toJS() ?? {};
  if (!isMap(data)) {
    problems.push({ level: "error", code: "E1", where: "", message: "a TEML document is a mapping of sections", ...lineAt([]) });
    return { data, model: null, problems, lineAt };
  }
  check(data, (level, code, path, message) => problems.push({ level, code, where: show(path), message, ...lineAt(path) }));
  return { data, model: toModel(data), problems, lineAt };
}

// ---- semantic checks (spec §14) ----
function check(js, report) {
  const compliant = js.apiVersion !== undefined;
  const err = (code, path, msg) => void report("error", code, path, msg);
  const warn = (code, path, msg) => void report("warning", code, path, msg);
  const E = compliant ? err : warn;
  const listAt = (v, path) => (v === undefined || Array.isArray(v) ? v ?? [] : (E("E5", path, "must be a list"), []));
  if (compliant && !VERSIONS.includes(js.apiVersion)) err("E1", ["apiVersion"], `unsupported apiVersion ${js.apiVersion}`);
  if (compliant && !js.metadata?.name) err("E1", ["metadata", "name"], "missing");

  // Named lists -> registries keyed by name (E2)
  const reg = Object.fromEntries(LISTS.map(k => [k, new Map()]));
  for (const kind of LISTS) listAt(js[kind], [kind]).forEach((item, i) => {
    const e = entry(item);
    if (!e) return E("E5", [kind, i], "expected a single-key mapping from a name to its body");
    const seg = { i, name: e[0], bare: typeof item === "string" };
    if (reg[kind].has(e[0])) E("E2", [kind, seg], `duplicate ${kind} name`);
    reg[kind].set(e[0], { body: e[1], seg });
  });
  const body = (kind, name) => reg[kind].get(name)?.body;
  const used = new Set();
  const resolve = (name, kind, path) => {
    if (typeof name !== "string") return E("E3", path, "a reference must be a name");
    if (!reg[kind].has(name)) return E("E3", path, `no ${kind} entry named ${name}`);
    used.add(`${kind}:${name}`); return name;
  };

  // E4: types
  const typeOk = (expr, path) => {
    const base = String(expr).replace(/(\[\])*\??$/, "");
    if (!PRIM.has(base) && !reg.types.has(base)) E("E4", path, `unknown type ${expr}`);
  };
  const checkProps = (node, path) => {
    if (node == null) return E("E4", path, "no props");
    if (Array.isArray(node)) return E("E4", path, "untyped props (sketch style)");
    if (!isMap(node)) return E("E4", path, "props must be a map");
    for (const [p, v] of Object.entries(node)) {
      const k = [...path, p];
      if (typeof v === "string") typeOk(v, k);
      else if (v == null) E("E4", k, "no type");
      else if (Array.isArray(v)) E("E4", k, "write a list type as T[]");
      else checkProps(v, k);
    }
  };
  for (const [n, { body: b, seg }] of reg.types) {
    if (PRIM.has(n)) E("E4", ["types", seg], "shadows a primitive");
    if (isMap(b) && "enum" in b) { if (Object.keys(b).length > 1) E("E4", ["types", seg], "an enum type has no other keys"); }
    else checkProps(b, ["types", seg]);
  }
  for (const k of ["aggs", "views"]) for (const { body: b, seg } of reg[k].values()) checkProps(b, [k, seg]);
  for (const { body: b, seg } of reg.screens.values()) if (b?.actor !== undefined) resolve(b.actor, "actors", ["screens", seg, "actor"]);

  // Slices
  const events = new Map(), commands = new Map(), kinds = new Map();
  const automationReads = new Set(), viewUpdated = new Set(), viewRead = new Set();
  for (const [sname, { body: s, seg }] of reg.slices) {
    const w = ["slices", seg];
    if (!isMap(s)) { E("E5", w, "a slice needs a body"); continue; }
    const isChange = "events" in s, isView = "view" in s;
    if (isChange === isView) { E("E5", w, `must have either events (change slice) or a view (view slice)${isChange ? ", not both" : ""}`); continue; }

    if (isView) {
      for (const k of CHANGE_KEYS) if (k in s) E("E5", [...w, k], "view slices cannot have this key");
      const vn = resolve(s.view, "views", [...w, "view"]);
      if (vn) viewRead.add(vn);
      kinds.set(sname, { kind: "view", view: vn });
      listAt(s.readBy, [...w, "readBy"]).forEach((r, i) => {
        const where = [...w, "readBy", i];
        if (!isMap(r) || Object.keys(r).length !== 1) return E("E5", where, "expected one of screen: or automation:");
        if ("screen" in r) resolve(r.screen, "screens", [...where, "screen"]);
        else if ("automation" in r) automationReads.add(resolve(r.automation, "automations", [...where, "automation"]));
        else E("E5", where, "expected one of screen: or automation:");
      });
      continue;
    }

    if ("agg" in s) resolve(s.agg, "aggs", [...w, "agg"]);
    let byAutomation = null;
    if (s.trigger !== undefined) {
      const t = s.trigger, where = [...w, "trigger"];
      if (!isMap(t) || Object.keys(t).length !== 1) E("E5", where, "expected one of screen:, automation: or system:");
      else if ("screen" in t) resolve(t.screen, "screens", [...where, "screen"]);
      else if ("automation" in t) byAutomation = resolve(t.automation, "automations", [...where, "automation"]) ?? t.automation;
      else if ("system" in t) resolve(t.system, "systems", [...where, "system"]);
      else E("E5", where, "expected one of screen:, automation: or system:");
    }
    const ce = s.command === undefined ? [sname, null] : entry(s.command);
    if (!ce) E("E5", [...w, "command"], "expected a command name or CommandName: props");
    const [cname, cprops] = ce ?? [sname, null];
    commands.set(cname, propKeys(cprops));
    kinds.set(sname, { kind: byAutomation ? "automation" : "change", issuer: byAutomation, command: cname });
    if (cprops !== null) checkProps(cprops, [...w, "command", cname]);

    const evs = listAt(s.events, [...w, "events"]);
    evs.forEach((ev, i) => {
      const e = entry(ev);
      if (!e) return E("E5", [...w, "events", i], "expected an event name or EventName: props");
      const [en, props] = e, where = [...w, "events", { i, name: en, bare: typeof ev === "string" }];
      if (events.has(en)) E("E2", where, `event ${en} is defined more than once`);
      events.set(en, propKeys(props));
      checkProps(props, where);
    });
    if (!evs.length) E("E5", [...w, "events"], "must be a non-empty list");

    listAt(s.views, [...w, "views"]).forEach((v, i) => {
      const e = entry(v);
      if (!e) return E("E5", [...w, "views", i], "expected a view name or ViewName: [props]");
      const where = [...w, "views", { i, name: e[0], bare: typeof v === "string" }];
      const vn = resolve(e[0], "views", where); if (!vn) return;
      viewUpdated.add(vn);
      if (e[1] == null) return;
      if (!Array.isArray(e[1])) return E("E6", where, "list the touched properties as [prop, …]");
      const keys = propKeys(body("views", vn)) ?? body("views", vn) ?? [];
      e[1].forEach((p, j) => { if (!keys.includes(p)) E("E6", [...where, j], `${vn} has no property ${p}`); });
    });
  }

  // Specs (after every event, command and view is known) — §13
  const views = new Map([...reg.views].map(([n, v]) => [n, propKeys(v.body)]));
  for (const [sname, { body: s, seg }] of reg.slices) {
    const k = kinds.get(sname); if (!k) continue;
    listAt(s.specs, ["slices", seg, "specs"]).forEach((sp, i) => {
      const w = ["slices", seg, "specs", i];
      if (!isMap(sp)) return E("E7", w, "a spec is a mapping with a name, given, when and then");
      const said = `spec "${sp.name}": `;
      const check = (inst, allowed, path) => {
        const e = entry(inst);
        if (!e) return E("E7", path, said + "expected an instance such as Name: { props }");
        const [n, data] = e;
        if (n === "error") return path.includes("then") && k.kind === "change" ? undefined : E("E7", path, said + "error is only allowed in a change slice's then");
        const hit = allowed.find(a => a.map.has(n));
        if (!hit) return E("E7", path, said + `${n} is not a known ${allowed.map(a => a.label).join(" or ")}`);
        const keys = hit.map.get(n);
        if (isMap(data)) for (const p of Object.keys(data)) if (keys && !keys.includes(p)) E("E7", [...path, n, p], said + `${n} has no prop ${p}`);
      };
      const EV = { label: "event", map: events }, CMD = { label: "command", map: commands }, VIEW = { label: "view", map: views };
      const given = listAt(sp.given, [...w, "given"]), then = listAt(sp.then, [...w, "then"]);
      given.forEach((g, j) => check(g, [EV], [...w, "given", j]));
      if (k.kind === "change") {
        if (!sp.when) E("E7", w, said + "a change slice triggered by a screen or system needs a when");
        else check(sp.when, [CMD], [...w, "when"]);
        then.forEach((t, j) => check(t, [EV], [...w, "then", j]));
      } else if (k.kind === "automation") {
        if (sp.when) E("E7", [...w, "when"], said + "an automation-triggered slice has no when; then lists the commands the automation issues");
        then.forEach((t, j) => check(t, [CMD], [...w, "then", j]));
      } else {
        if (sp.when) E("E7", [...w, "when"], said + "a view slice has no when");
        if (then.length !== 1 || entry(then[0])?.[0] !== k.view) E("E7", [...w, "then"], said + `then must be exactly one instance of ${k.view}`);
        else check(then[0], [VIEW], [...w, "then", 0]);
      }
    });
  }

  // Warnings
  for (const [vn, { seg }] of reg.views) {
    if (!viewUpdated.has(vn)) warn("W1", ["views", seg], "not updated by any slice");
    else if (!viewRead.has(vn)) warn("W3", ["views", seg], "never read by a view slice");
  }
  for (const k of ["actors", "screens", "systems", "automations", "aggs"])
    for (const [n, { seg }] of reg[k]) if (!used.has(`${k}:${n}`)) warn("W2", [k, seg], "never referenced");
  for (const x of kinds.values())
    if (x.kind === "automation" && !automationReads.has(x.issuer))
      warn("W4", ["automations", reg.automations.get(x.issuer)?.seg ?? x.issuer], `issues ${x.command} but reads no view`);
}

// ---- normalized model ----
// Built from whatever parses, so a document with errors still draws as far as it can.
function toModel(js) {
  const named = v => (Array.isArray(v) ? v.map(entry).filter(Boolean) : []);
  const list = kind => named(js[kind]).map(([name, body]) => ({ name, body: body ?? {} }));
  const str = v => (typeof v === "string" ? v : null);
  const ref = o => { const e = isMap(o) && Object.entries(o); return e?.length === 1 ? { kind: e[0][0], name: String(e[0][1]) } : null; };
  const inst = o => { const e = entry(o); return e && { name: e[0], data: e[1] }; };
  const insts = v => (Array.isArray(v) ? v.map(inst).filter(Boolean) : []);

  const screens = list("screens").map(({ name, body: b }) => ({
    name, actor: str(b.actor), description: str(b.description), wireframe: str(b.wireframe),
  }));
  const systems = list("systems").map(({ name, body: b }) => ({ name, description: str(b.description) }));

  const slices = list("slices").map(({ name, body }) => {
    const b = isMap(body) ? body : {};
    const specs = (Array.isArray(b.specs) ? b.specs : []).filter(isMap).map(sp => ({
      name: String(sp.name ?? ""), given: insts(sp.given), when: sp.when ? inst(sp.when) : null, then: insts(sp.then),
    }));
    const common = { name, status: str(b.status), story: str(b.story), description: str(b.description), specs };
    if ("view" in b) return { kind: "view", view: String(b.view), readBy: (Array.isArray(b.readBy) ? b.readBy : []).map(ref).filter(Boolean), ...common };
    const [cname, cprops] = (b.command !== undefined && entry(b.command)) || [name, null];
    const command = { name: cname, props: cprops, inferred: b.command === undefined };
    const events = named(b.events).map(([n, props]) => ({ name: n, props }));
    const views = named(b.views).map(([n, touched]) => ({ name: n, touched: Array.isArray(touched) ? touched : [] }));
    return { kind: "change", agg: str(b.agg), trigger: ref(b.trigger), command, events, views, ...common };
  });

  return {
    apiVersion: str(js.apiVersion), compliant: js.apiVersion !== undefined, metadata: isMap(js.metadata) ? js.metadata : {},
    types: list("types"), actors: list("actors"), screens, systems, automations: list("automations"),
    aggs: list("aggs"), views: list("views"), slices,
  };
}
