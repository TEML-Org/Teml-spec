// Reads a compliant TEML document and emits the data an Event Modeling board needs.
// References are plain names (spec §5), so the parsed YAML is all we need.
import YAML from "yaml";
import fs from "fs";

// A named list item is a single-key mapping, or (in a sketch) a bare name.
const entry = o => (typeof o === "string" ? [o, null] : Object.entries(o)[0]);
const one = o => { const [kind, name] = Object.entries(o)[0]; return { kind, name }; };

export function boardData(file) {
  const src = fs.readFileSync(file, "utf8");
  const js = YAML.parse(src);
  const list = kind => (js[kind] ?? []).map(o => { const [name, body] = entry(o); return { name, body: body ?? {} }; });

  const screens = list("screens").map(({ name, body }) => ({
    name, actor: body.actor ?? null, description: body.description ?? null, wireframe: body.wireframe ?? null,
  }));
  const systems = list("systems").map(({ name, body }) => ({ name, description: body.description ?? null }));

  const slices = list("slices").map(({ name, body: b }) => {
    const common = { name, status: b.status ?? null, story: b.story ?? null, description: b.description ?? null, specs: b.specs ?? [] };
    if (b.view) return { kind: "view", view: b.view, readBy: (b.readBy ?? []).map(one), ...common };
    const c = b.command;
    const command = { name: typeof c === "string" ? c : c?.name ?? name, props: typeof c === "object" ? c.props ?? null : null, inferred: c === undefined };
    const events = (b.events ?? []).map(e => { const [n, props] = entry(e); return { name: n, props }; });
    const views = (b.views ?? []).map(v => { const [n, touched] = entry(v); return { name: n, touched: touched ?? [] }; });
    return { kind: "change", agg: b.agg ?? null, trigger: b.trigger ? one(b.trigger) : null, command, events, views, ...common };
  });

  return {
    file: file.split("/").slice(-2).join("/"),
    apiVersion: js.apiVersion, metadata: js.metadata,
    types: list("types"), actors: list("actors"), screens, aggs: list("aggs"), views: list("views"),
    automations: list("automations"), systems, slices,
    source: src,
  };
}
