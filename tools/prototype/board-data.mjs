// Reads a compliant TEML document and emits the data an Event Modeling board needs.
// Aliases are resolved by anchor and view overrides read from the AST (spec §5.2).
import YAML, { isMap, isSeq, isScalar, isAlias } from "yaml";
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
  const listJs = kind => (js[kind] ?? []).map(o => { const [name, body] = Object.entries(o)[0]; return { name, body }; });
  for (const k of ["types", "aggs", "views", "wfes"]) named(k);
  const refName = n => (isAlias(n) ? byAnchor.get(n.source) : isScalar(n) ? String(n.value) : null);

  const slicesAst = named("slices");
  const slicesJs = listJs("slices");
  const slices = slicesAst.map(([name, s], i) => {
    const b = slicesJs[i].body;
    const trig = s.get("trigger", true);
    let trigger = null;
    if (isMap(trig)) {
      if (trig.has("screen")) trigger = { kind: "screen", name: String(trig.get("screen")) };
      if (trig.has("wfe")) trigger = { kind: "wfe", name: refName(trig.get("wfe", true)) };
    }
    const c = b.command;
    const command = {
      name: typeof c === "string" ? c : c?.name ?? name,
      props: typeof c === "object" ? c.props ?? null : null,
      inferred: c === undefined,
    };
    const events = (b.events ?? (b.event ? [b.event] : [])).map(e => (typeof e === "string" ? { name: e, props: null } : e));
    const views = (s.get("views", true)?.items ?? []).map(v => {
      if (!isMap(v)) return { name: refName(v), touched: [] };
      const merge = v.items.find(p => p.key?.source === "<<");
      return { name: refName(merge.value), touched: v.items.filter(p => p !== merge).map(p => [String(p.key.value), String(p.value.value)]) };
    });
    const wfes = (s.get("wfes", true)?.items ?? []).map(refName);
    return { name, agg: s.has("agg") ? refName(s.get("agg", true)) : null, trigger, command, events, views, wfes,
      status: b.status ?? null, story: b.story ?? null, description: b.description ?? null, specs: b.specs ?? [] };
  });
  return {
    file: file.split("/").slice(-2).join("/"),
    apiVersion: js.apiVersion, metadata: js.metadata,
    types: listJs("types"), aggs: listJs("aggs"), views: listJs("views"), wfes: listJs("wfes"), slices,
    source: src,
  };
}
