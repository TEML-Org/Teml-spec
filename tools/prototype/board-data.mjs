// Reads a compliant TEML document and emits the data an Event Modeling board needs.
// Aliases are resolved by anchor and view overrides read from the AST (spec §5.2).
import YAML, { isMap, isScalar, isAlias } from "yaml";
import fs from "fs";

export function boardData(file) {
  const src = fs.readFileSync(file, "utf8");
  const doc = YAML.parseDocument(src, { merge: true });
  const js = doc.toJS({ maxAliasCount: -1 });
  const root = doc.contents;
  const byAnchor = new Map();
  const named = kind => (root.get(kind, true)?.items ?? []).map(it => {
    const p = it.items[0];
    if (p.value?.anchor) byAnchor.set(p.value.anchor, String(p.key.value));
    return [String(p.key.value), p.value];
  });
  const listJs = kind => (js[kind] ?? []).map(o => { const [name, body] = Object.entries(o)[0]; return { name, body: body ?? {} }; });
  for (const k of ["types", "actors", "screens", "aggs", "views", "wfes", "systems"]) named(k);
  const refName = n => (isAlias(n) ? byAnchor.get(n.source) : isScalar(n) ? String(n.value) : null);

  // Screens -> actor name (references may be aliases or names)
  const screens = named("screens").map(([name, body]) => ({
    name,
    actor: isMap(body) && body.has("actor") ? refName(body.get("actor", true)) : null,
    description: isMap(body) ? body.get("description") ?? null : null,
    wireframe: isMap(body) ? body.get("wireframe") ?? null : null,
  }));

  // External systems that call our API (they trigger change slices)
  const systems = named("systems").map(([name, body]) => ({ name, description: isMap(body) ? body.get("description") ?? null : null }));

  const slicesJs = listJs("slices");
  const slices = named("slices").map(([name, s], i) => {
    const b = slicesJs[i].body;
    const common = { name, status: b.status ?? null, story: b.story ?? null, description: b.description ?? null, specs: b.specs ?? [] };
    if (s.has("view")) {
      const readBy = (s.get("readBy", true)?.items ?? []).map(r =>
        r.has("screen") ? { kind: "screen", name: refName(r.get("screen", true)) } : { kind: "wfe", name: refName(r.get("wfe", true)) });
      return { kind: "view", view: refName(s.get("view", true)), readBy, ...common };
    }
    const trig = s.get("trigger", true);
    let trigger = null;
    if (isMap(trig)) {
      if (trig.has("screen")) trigger = { kind: "screen", name: refName(trig.get("screen", true)) };
      if (trig.has("wfe")) trigger = { kind: "wfe", name: refName(trig.get("wfe", true)) };
      if (trig.has("system")) trigger = { kind: "system", name: refName(trig.get("system", true)) };
    }
    const c = b.command;
    const command = { name: typeof c === "string" ? c : c?.name ?? name, props: typeof c === "object" ? c.props ?? null : null, inferred: c === undefined };
    const events = (b.events ?? (b.event ? [b.event] : [])).map(e => (typeof e === "string" ? { name: e, props: null } : e));
    const views = (s.get("views", true)?.items ?? []).map(v => {
      if (!isMap(v)) return { name: refName(v), touched: [] };
      const merge = v.items.find(p => p.key?.source === "<<");
      return { name: refName(merge.value), touched: v.items.filter(p => p !== merge).map(p => [String(p.key.value), String(p.value.value)]) };
    });
    const wfes = (s.get("wfes", true)?.items ?? []).map(refName);
    return { kind: "change", agg: s.has("agg") ? refName(s.get("agg", true)) : null, trigger, command, events, views, wfes, ...common };
  });

  return {
    file: file.split("/").slice(-2).join("/"),
    apiVersion: js.apiVersion, metadata: js.metadata,
    types: listJs("types"), actors: listJs("actors"), screens, aggs: listJs("aggs"), views: listJs("views"),
    wfes: listJs("wfes"), systems, slices,
    source: src,
  };
}
