// Event Modeling board renderer for TEML board data (see board-data.mjs).
// mountBoard(root, M) draws into `root`, which must contain .scroller > .board,
// .detail, and optionally .zoom controls. Several boards can share one page.
const TEML_BOARD = (() => {
  const NOTE_W = 140, NOTE_H = 54, GAP = 12, PAD = 16, LABEL_W = 136, SUB_GAP = 40, HEAD_H = 64;
  const COL_W = NOTE_W * 2 + SUB_GAP + 44;
  const TYPE_NAMES = { g: "unique identifier", guid: "unique identifier", uuid: "unique identifier", s: "text", str: "text", string: "text",
    int: "whole number", i: "whole number", integer: "whole number", dec: "decimal", decimal: "decimal", float: "floating-point number",
    bool: "true / false", b: "true / false", boolean: "true / false", date: "calendar date", time: "time of day", dt: "date and time",
    datetime: "date and time", timestamp: "date and time", dur: "duration", duration: "duration", uri: "URI", url: "URI", any: "unspecified" };
  const GEAR = '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M9.4 1l.4 1.9c.4.1.8.3 1.1.5l1.7-1 1.4 1.4-1 1.7c.2.3.4.7.5 1.1l1.9.4v2l-1.9.4c-.1.4-.3.8-.5 1.1l1 1.7-1.4 1.4-1.7-1c-.3.2-.7.4-1.1.5L9.4 15h-2l-.4-1.9c-.4-.1-.8-.3-1.1-.5l-1.7 1-1.4-1.4 1-1.7c-.2-.3-.4-.7-.5-1.1L1.6 9V7l1.9-.4c.1-.4.3-.8.5-1.1l-1-1.7 1.4-1.4 1.7 1c.3-.2.7-.4 1.1-.5L7.6 1h1.8zM8.5 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/></svg>';
  const PLUG = '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5 1h1.5v3.5h3V1H11v3.5h1.5V8a4.5 4.5 0 01-3.75 4.44V15h-1.5v-2.56A4.5 4.5 0 013.5 8V4.5H5V1z"/></svg>';
  const KIND = { screen: "Screen", wfe: "Automation", system: "API call", cmd: "Command", view: "Read model", evt: "Event" };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const spaced = n => String(n).replace(/([a-z])([A-Z])/g, "$1 $2");
  let uid = 0;

  function facts(M) {
    const changes = M.slices.filter(s => s.kind === "change");
    const n = [
      [changes.length, "change slices"], [M.slices.length - changes.length, "view slices"],
      [changes.reduce((a, s) => a + s.events.length, 0), "events"], [M.actors.length, "actors"], [M.systems.length, "external systems"],
      [M.aggs.length, "aggregates"], [M.views.length, "read models"], [M.wfes.length, "automations"],
      [M.slices.reduce((a, s) => a + s.specs.length, 0), "specs"]];
    return n.filter(([c]) => c > 0).map(([c, l]) => `<span><b>${c}</b> ${l}</span>`).join("");
  }

  function mountBoard(root, M, opts = {}) {
    const id = ++uid;
    const changes = M.slices.filter(s => s.kind === "change"), viewSlices = M.slices.filter(s => s.kind === "view");
    const screenActor = new Map(M.screens.map(s => [s.name, s.actor]));
    const actorLane = name => (screenActor.get(name) ? "actor:" + screenActor.get(name) : "screens");
    const triggerLane = t => (t.kind === "wfe" ? "wfe" : t.kind === "system" ? "sys:" + t.name : actorLane(t.name));

    // ---- placement: every note gets a lane and a sub-column, then stacks ----
    const notes = [], edges = [];
    const cols = M.slices.map(() => new Map());
    const put = (n, lane, sub) => {
      const key = lane + "|" + sub, c = cols[n.slice];
      n.lane = lane; n.sub = sub; n.row = c.get(key) ?? 0; c.set(key, n.row + 1);
      notes.push(n); return n;
    };
    M.slices.forEach((s, i) => {
      if (s.kind === "view") {
        const v = put({ id: `view:${s.name}:${s.view}`, kind: "view", name: s.view, slice: i, ref: { name: s.view, touched: [] } }, "mid", 0);
        // Readers sit to the right of the read model: on the timeline the read model
        // must exist before a screen can show it, so information flows left to right.
        s.readBy.forEach((r, k) => edges.push({ a: v, b: put({ id: `read:${s.name}:${k}`, kind: r.kind, name: r.name, slice: i }, triggerLane(r), 1), t: "read" }));
        return;
      }
      const trig = s.trigger ? put({ id: `trig:${s.name}`, kind: s.trigger.kind, name: s.trigger.name, slice: i }, triggerLane(s.trigger), 0) : null;
      const cmd = put({ id: `cmd:${s.name}`, kind: "cmd", name: s.command.name, slice: i, inferred: s.command.inferred }, "mid", 0);
      if (trig) edges.push({ a: trig, b: cmd, t: "down" });
      const evs = s.events.map(e => put({ id: `evt:${e.name}`, kind: "evt", name: e.name, slice: i, ev: e }, "agg:" + s.agg, 0));
      evs.forEach(e => edges.push({ a: cmd, b: e, t: "down" }));
      const vs = s.views.map(v => put({ id: `view:${s.name}:${v.name}`, kind: "view", name: v.name, slice: i, ref: v }, "mid", 1));
      evs.forEach(e => vs.forEach(v => edges.push({ a: e, b: v, t: "up" })));
    });
    // Event -> the WFE it triggers: the first sticky for that WFE later on the timeline
    M.slices.forEach((s, i) => s.kind === "change" && s.wfes.forEach(w => {
      const target = notes.find(n => n.kind === "wfe" && n.name === w && n.slice > i) ?? notes.find(n => n.kind === "wfe" && n.name === w);
      if (target) notes.filter(n => n.kind === "evt" && n.slice === i).forEach(e => edges.push({ a: e, b: target, t: "trig" }));
    }));

    // ---- lanes ----
    const laneIds = new Set(notes.map(n => n.lane)); laneIds.add("mid");
    const lanes = [];
    const rowsOf = lid => Math.max(1, ...cols.flatMap(c => [...c].filter(([k]) => k.startsWith(lid + "|")).map(([, v]) => v)));
    const addLane = (lid, label, sub) => laneIds.has(lid) && lanes.push({ id: lid, label, sub, rows: rowsOf(lid) });
    M.actors.forEach(a => addLane("actor:" + a.name, spaced(a.name), "Actor"));
    M.systems.forEach(s => addLane("sys:" + s.name, spaced(s.name), "External system"));
    addLane("screens", "Screens", M.actors.length ? "No actor" : "User interface");
    addLane("wfe", "Automations", "Workflow engines");
    addLane("mid", "Commands & read models", "");
    M.aggs.forEach(a => addLane("agg:" + a.name, a.name, "Events"));
    addLane("agg:null", "No aggregate", "Events");
    let y = HEAD_H;
    for (const l of lanes) { l.y = y; l.h = l.rows * (NOTE_H + GAP) - GAP + PAD * 2; y += l.h; }
    const W = LABEL_W + M.slices.length * COL_W + 16, H = y;
    const laneY = new Map(lanes.map(l => [l.id, l.y]));
    notes.forEach(n => {
      const x0 = LABEL_W + n.slice * COL_W + 22;
      n.x = n.sub ? x0 + NOTE_W + SUB_GAP : x0;
      n.y = laneY.get(n.lane) + PAD + n.row * (NOTE_H + GAP);
    });

    function path(e) {
      const a = e.a, b = e.b;
      if (e.t === "down") {
        const x1 = a.x + NOTE_W / 2, y1 = a.y + NOTE_H, x2 = b.x + NOTE_W / 2, y2 = b.y - 3, d = Math.max(16, (y2 - y1) / 2);
        return `M${x1},${y1} C${x1},${y1 + d} ${x2},${y2 - d} ${x2},${y2}`;
      }
      // event -> read model, and read model -> reader: rightwards, then up into the target
      if (e.t === "up" || e.t === "read") {
        const x1 = a.x + NOTE_W, y1 = a.y + NOTE_H / 2, x2 = b.x + NOTE_W / 2, y2 = b.y + NOTE_H + 3;
        return `M${x1},${y1} C${x2},${y1} ${x2},${y1 + (y2 - y1) * 0.35} ${x2},${y2}`;
      }
      const x1 = a.x + NOTE_W, y1 = a.y + NOTE_H / 3, x2 = b.x - 3, y2 = b.y + NOTE_H / 2;
      return `M${x1},${y1} C${x1 + 120},${y1} ${x2 - 120},${y2} ${x2},${y2}`;
    }

    // ---- render ----
    const board = root.querySelector(".board");
    board.style.width = W + "px"; board.style.height = H + "px";
    let html = "";
    lanes.forEach(l => {
      html += `<div class="lane" style="top:${l.y}px;height:${l.h}px;width:${W}px"><div class="lane-label" style="width:${LABEL_W}px"><b>${esc(l.label)}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ""}</div></div>`;
    });
    M.slices.forEach((s, i) => {
      const x = LABEL_W + i * COL_W;
      if (i > 0) html += `<div class="divider" style="left:${x}px;height:${H}px"></div>`;
      const st = s.status ? `<span class="chip ${["Completed", "InDev"].includes(s.status) ? s.status : "other"}">${esc(s.status === "InDev" ? "In dev" : s.status)}</span>` : "";
      const sp = s.specs.length ? `<span>${s.specs.length} spec${s.specs.length > 1 ? "s" : ""}</span>` : "";
      const kind = s.kind === "view" ? `<span class="viewtag">View</span>` : "";
      html += `<button type="button" class="col-head" data-id="slice:${esc(s.name)}" style="left:${x + 18}px;width:${COL_W - 36}px;height:${HEAD_H}px"><span class="sn">${esc(spaced(s.name))}</span><span class="meta">${kind}${st}${sp}${s.story ? `<span>${esc(s.story)}</span>` : ""}</span></button>`;
    });
    notes.forEach(n => {
      const k = n.kind === "wfe" ? `${GEAR}${KIND.wfe}` : n.kind === "system" ? `${PLUG}${KIND.system}` : n.inferred ? "Command · inferred" : KIND[n.kind];
      html += `<button type="button" class="note ${n.kind}${n.inferred ? " inferred" : ""}" data-id="${esc(n.id)}" data-slice="${n.slice}" style="left:${n.x}px;top:${n.y}px;width:${NOTE_W}px;height:${NOTE_H}px"><span class="k">${k}</span><span class="nm">${esc(spaced(n.name))}</span></button>`;
    });
    html += `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs>
      <marker id="arrow-${id}" class="m-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>
      <marker id="arrowHot-${id}" class="m-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>
      ${edges.map((e, i) => `<path class="edge ${e.t === "trig" ? "trig" : ""}" data-e="${i}" d="${path(e)}" marker-end="url(#arrow-${id})"/>`).join("")}</svg>`;
    board.innerHTML = html;

    // ---- zoom ----
    let zoom = 0.8;
    const zv = root.querySelector(".zoom output");
    const setZoom = z => { zoom = Math.min(1.5, Math.max(0.3, Math.round(z * 100) / 100)); board.style.zoom = zoom; if (zv) zv.textContent = Math.round(zoom * 100) + "%"; };
    root.querySelector(".zoom-in")?.addEventListener("click", () => setZoom(zoom + 0.1));
    root.querySelector(".zoom-out")?.addEventListener("click", () => setZoom(zoom - 0.1));
    root.querySelector(".zoom-fit")?.addEventListener("click", () => setZoom((root.querySelector(".scroller").clientWidth - 2) / W));
    setZoom(opts.zoom ?? (window.innerWidth < 700 ? 0.6 : 0.8));

    // ---- details ----
    const viewDef = n => M.views.find(v => v.name === n)?.body;
    const wfeDef = n => M.wfes.find(v => v.name === n)?.body;
    const screenDef = n => M.screens.find(s => s.name === n);
    const systemDef = n => M.systems.find(s => s.name === n);
    function propsHtml(p, touched) {
      if (!p) return `<p class="muted" style="margin:0">Not specified.</p>`;
      if (Array.isArray(p)) return `<ul class="props">${p.map(n => `<li>${esc(n)}</li>`).join("")}</ul>`;
      const t = new Map(touched ?? []);
      const line = (k, v) => {
        const mark = t.has(k) ? ` class="touched" title="Touched by this slice${t.get(k) !== "x" ? " (" + t.get(k) + ")" : ""}"` : "";
        if (typeof v === "string") return `<li><span${mark}>${esc(k)}</span>: <span class="ty" title="${esc(TYPE_NAMES[v.replace(/(\[\])*\??$/, "")] ?? "named type")}">${esc(v)}</span></li>`;
        if (Array.isArray(v)) return typeof v[0] === "string"
          ? `<li><span${mark}>${esc(k)}</span>: <span class="ty">list of ${esc(v[0])}</span></li>`
          : `<li><span${mark}>${esc(k)}</span>: <span class="ty">list of</span>${propsHtml(v[0])}</li>`;
        return `<li><span${mark}>${esc(k)}</span>:${propsHtml(v)}</li>`;
      };
      return `<ul class="props">${Object.entries(p).map(([k, v]) => line(k, v)).join("")}</ul>`;
    }
    const allEvents = new Set(changes.flatMap(s => s.events.map(e => e.name)));
    const allCmds = new Set(changes.map(s => s.command.name)), allViews = new Set(M.views.map(v => v.name));
    const val = v => Array.isArray(v) ? `[${v.map(val).join(", ")}]`
      : v && typeof v === "object" ? `{ ${Object.entries(v).map(([k, x]) => `${k}: ${val(x)}`).join(", ")} }` : String(v);
    function inst(o) {
      const [n, data] = Object.entries(o)[0];
      if (n === "error") return `<span class="inst err">error: <b>${esc(data)}</b></span>`;
      const cls = allEvents.has(n) ? "evt" : allCmds.has(n) ? "cmd" : allViews.has(n) ? "view" : "";
      return `<span class="inst ${cls}"><b>${esc(spaced(n))}</b>${data && typeof data === "object" ? " " + esc(val(data)) : ""}</span>`;
    }
    function specsHtml(s) {
      if (!s.specs.length) return `<p class="muted" style="margin:0">No specs for this slice.</p>`;
      return s.specs.map(sp => `<div class="spec"><b>${esc(sp.name)}</b><div class="gwt">
        <span>Given</span><div class="insts">${sp.given?.length ? sp.given.map(inst).join("") : `<span class="inst none">nothing yet</span>`}</div>
        ${sp.when ? `<span>When</span><div class="insts">${inst(sp.when)}</div>` : ""}
        <span>Then</span><div class="insts">${sp.then.length ? sp.then.map(inst).join("") : `<span class="inst none">nothing happens</span>`}</div></div></div>`).join("");
    }
    const sel = (nid, label) => `<button type="button" class="link" data-go="${esc(nid)}">${esc(label)}</button>`;
    const who = name => (screenActor.get(name) ? ` <span class="muted">(${esc(spaced(screenActor.get(name)))})</span>` : "");
    const triggerText = (t, nid) => t.kind === "wfe" ? `Automation ${sel(nid, spaced(t.name))}`
      : t.kind === "system" ? `External system ${sel(nid, spaced(t.name))} <span class="muted">(calls our API)</span>`
      : `Screen ${sel(nid, spaced(t.name))}${who(t.name)}`;
    function sliceSummary(s) {
      const head = `<h2><span class="kind slice">${s.kind === "view" ? "View slice" : "Slice"}</span>${esc(spaced(s.name))}</h2>`;
      const meta = `<dt>Status</dt><dd>${esc(s.status ?? "—")}</dd>${s.story ? `<dt>Story</dt><dd>${esc(s.story)}</dd>` : ""}`;
      if (s.kind === "view") return `<div class="panel">${head}<dl class="kv">${meta}<dt>Read model</dt><dd>${sel(`view:${s.name}:${s.view}`, spaced(s.view))}</dd>
          <dt>Read by</dt><dd>${s.readBy.map((r, k) => triggerText(r, `read:${s.name}:${k}`)).join("<br>") || "—"}</dd></dl><div><h3>Specs</h3>${specsHtml(s)}</div></div>`;
      return `<div class="panel">${head}<dl class="kv">${meta}
        <dt>Aggregate</dt><dd>${esc(s.agg ?? "—")}</dd><dt>Trigger</dt><dd>${s.trigger ? triggerText(s.trigger, "trig:" + s.name) : '<span class="muted">Unspecified</span>'}</dd>
        <dt>Command</dt><dd>${sel("cmd:" + s.name, spaced(s.command.name))}${s.command.inferred ? ' <span class="muted">(inferred from the slice name)</span>' : ""}</dd>
        <dt>Event${s.events.length > 1 ? "s" : ""}</dt><dd>${s.events.map(e => sel("evt:" + e.name, spaced(e.name))).join(", ")}</dd>
        <dt>Updates</dt><dd>${s.views.map(v => sel(`view:${s.name}:${v.name}`, spaced(v.name))).join(", ") || "—"}</dd>
        ${s.wfes.length ? `<dt>Triggers</dt><dd>${s.wfes.map(w => esc(spaced(w))).join(", ")}</dd>` : ""}</dl>
        <div><h3>Specs</h3>${specsHtml(s)}</div></div>`;
    }
    function elementPanel(nid) {
      const n = notes.find(x => x.id === nid), s = M.slices[n.slice];
      if (n.kind === "cmd") return `<div class="panel"><h2><span class="kind cmd">Command</span>${esc(spaced(n.name))}</h2>
        <dl class="kv"><dt>Aggregate</dt><dd>${esc(s.agg ?? "—")}</dd></dl><div><h3>Props</h3>${propsHtml(s.command.props)}</div></div>`;
      if (n.kind === "evt") return `<div class="panel"><h2><span class="kind evt">Event</span>${esc(spaced(n.name))}</h2>
        <dl class="kv"><dt>Aggregate</dt><dd>${esc(s.agg ?? "—")}</dd><dt>Updates</dt><dd>${s.views.map(v => esc(spaced(v.name))).join(", ") || "—"}</dd>
        ${s.wfes.length ? `<dt>Triggers</dt><dd>${s.wfes.map(w => esc(spaced(w))).join(", ")}</dd>` : ""}</dl>
        <div><h3>Props</h3>${propsHtml(n.ev.props)}</div></div>`;
      if (n.kind === "view") {
        const by = changes.filter(o => o.views.some(v => v.name === n.name)).map(o => o.name);
        const readIn = viewSlices.filter(o => o.view === n.name).map(o => o.name);
        const hl = n.ref.touched.length ? ` <span style="text-transform:none;letter-spacing:0;font-weight:400">· highlighted: touched in ${esc(spaced(s.name))}</span>` : "";
        return `<div class="panel"><h2><span class="kind view">Read model</span>${esc(spaced(n.name))}</h2>
        <dl class="kv"><dt>Updated by</dt><dd>${by.map(b => sel("slice:" + b, spaced(b))).join(", ") || "—"}</dd>
        <dt>Read in</dt><dd>${readIn.map(b => sel("slice:" + b, spaced(b))).join(", ") || "—"}</dd></dl>
        <div><h3>Props${hl}</h3>${propsHtml(viewDef(n.name), n.ref.touched)}</div></div>`;
      }
      if (n.kind === "wfe") {
        const d = wfeDef(n.name) ?? {};
        const from = changes.filter(o => o.wfes.includes(n.name)).flatMap(o => o.events.map(e => e.name));
        const reads = viewSlices.filter(o => o.readBy.some(r => r.kind === "wfe" && r.name === n.name)).map(o => o.view);
        const issues = changes.filter(o => o.trigger?.kind === "wfe" && o.trigger.name === n.name).map(o => o.command.name);
        return `<div class="panel"><h2><span class="kind wfe">Automation</span>${esc(spaced(n.name))}</h2>
        ${d.description ? `<p style="margin:0">${esc(d.description)}</p>` : ""}
        <dl class="kv">${d.schedule ? `<dt>Schedule</dt><dd>${esc(d.schedule)}</dd>` : ""}
        ${from.length ? `<dt>Triggered by</dt><dd>${from.map(e => esc(spaced(e))).join(", ")}</dd>` : ""}
        ${reads.length ? `<dt>Reads</dt><dd>${reads.map(v => esc(spaced(v))).join(", ")}</dd>` : ""}
        <dt>Issues</dt><dd>${issues.map(c => esc(spaced(c))).join(", ") || "—"}</dd></dl></div>`;
      }
      if (n.kind === "system") {
        const d = systemDef(n.name) ?? {};
        const issues = changes.filter(o => o.trigger?.kind === "system" && o.trigger.name === n.name).map(o => o.command.name);
        return `<div class="panel"><h2><span class="kind system">External system</span>${esc(spaced(n.name))}</h2>
        ${d.description ? `<p style="margin:0">${esc(d.description)}</p>` : ""}
        <dl class="kv"><dt>Calls our API to issue</dt><dd>${issues.map(c => esc(spaced(c))).join(", ") || "—"}</dd></dl>
        <p class="muted" style="margin:0">The system can't add events to our model. Its call issues our command, and the events that follow are ours.</p></div>`;
      }
      const d = screenDef(n.name) ?? {};
      const triggers = changes.filter(o => o.trigger?.kind === "screen" && o.trigger.name === n.name).map(o => o.name);
      const shows = viewSlices.filter(o => o.readBy.some(r => r.kind === "screen" && r.name === n.name)).map(o => o.view);
      return `<div class="panel"><h2><span class="kind screen">Screen</span>${esc(spaced(n.name))}</h2>
        ${d.description ? `<p style="margin:0">${esc(d.description)}</p>` : ""}
        <dl class="kv"><dt>Actor</dt><dd>${esc(d.actor ? spaced(d.actor) : "—")}</dd>
        <dt>Issues</dt><dd>${triggers.map(u => sel("slice:" + u, spaced(u))).join(", ") || "—"}</dd>
        <dt>Shows</dt><dd>${shows.map(v => esc(spaced(v))).join(", ") || "—"}</dd>
        ${d.wireframe ? `<dt>Wireframe</dt><dd>${esc(d.wireframe)}</dd>` : ""}</dl></div>`;
    }

    const detail = root.querySelector(".detail");
    function select(nid, scroll) {
      const isSlice = nid.startsWith("slice:");
      const s = isSlice ? M.slices.find(x => x.name === nid.slice(6)) : M.slices[notes.find(n => n.id === nid).slice];
      detail.innerHTML = isSlice ? sliceSummary(s) : elementPanel(nid) + sliceSummary(s);
      detail.classList.toggle("single", isSlice);
      board.classList.add("focusing");
      const linked = new Set();
      board.querySelectorAll(".note").forEach(el => el.classList.remove("sel", "linked"));
      board.querySelectorAll(".col-head").forEach(el => el.classList.toggle("sel", el.dataset.id === "slice:" + s.name));
      board.querySelectorAll(".edge").forEach(el => {
        const e = edges[+el.dataset.e];
        const hot = isSlice ? M.slices[e.a.slice] === s && M.slices[e.b.slice] === s : e.a.id === nid || e.b.id === nid;
        el.classList.toggle("hot", hot);
        el.setAttribute("marker-end", `url(#${hot ? "arrowHot" : "arrow"}-${id})`);
        if (hot) { linked.add(e.a.id); linked.add(e.b.id); }
      });
      board.querySelectorAll(".note").forEach(el => {
        if (el.dataset.id === nid) el.classList.add("sel");
        if (linked.has(el.dataset.id) || (isSlice && M.slices[+el.dataset.slice] === s)) el.classList.add("linked");
      });
      if (scroll) board.querySelector(`[data-id="${CSS.escape(nid)}"]`)?.scrollIntoView({ block: "nearest", inline: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    board.addEventListener("click", e => { const b = e.target.closest("[data-id]"); if (b) select(b.dataset.id, false); });
    detail.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) select(b.dataset.go, true); });
    const first = opts.select && M.slices.some(s => s.name === opts.select) ? opts.select : M.slices[0].name;
    select("slice:" + first, false);
    return { select, width: W };
  }
  return { mountBoard, facts };
})();
