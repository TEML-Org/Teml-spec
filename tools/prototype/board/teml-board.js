// <teml-board>: draws a TEML document as an Event Modeling board. Bundled with the
// YAML parser into one teml-board.js (see bundle.mjs), so a page needs one <script>.
//
//   <teml-board src="hotel.teml.yaml"></teml-board>
//   <teml-board><script type="text/teml"> …TEML… </script></teml-board>
//   el.source = text;   el.model = model;   // model as returned by teml-core's parse()
//
// Attributes: src, select (slice to show first), theme ("light" | "dark"; default follows the OS).
// Read-only: problems ([{ level, code, where, message, line, col }]).
// Event: "teml-load", detail { model, problems }, after every load. When the YAML doesn't
// parse, the last good board stays and only the problem list changes.
import { parse } from "../teml-core.mjs";
import { mountBoard } from "./board.js";
import tokens from "./tokens.css";
import css from "./board.css";
import ui from "./toolbar.html";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// Inline TEML sits indented inside HTML; remove the indent its lines share.
const dedent = t => {
  const lines = t.replace(/^\s*\n/, "").replace(/\s+$/, "").split("\n");
  const pad = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  return lines.map(l => l.slice(pad)).join("\n") + "\n";
};

class TemlBoard extends HTMLElement {
  static observedAttributes = ["src", "select"];
  #shadow; #ctl = null; #model = null; #problems = []; #source = null; #started = false; #req = 0; #stale = false;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: "open" });
    this.#shadow.innerHTML = `<style>${tokens}${css}</style>${ui}`;
  }

  connectedCallback() {
    if (this.#started) return;
    this.#started = true;
    // Inline TEML is parsed after the element's children are, which may be later than now.
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => this.#loadInitial(), { once: true });
    else queueMicrotask(() => this.#loadInitial());
  }

  #loadInitial() {
    if (this.#model || this.#source !== null) return;
    if (this.hasAttribute("src")) return this.#fetch(this.getAttribute("src"));
    const inline = this.querySelector('script[type="text/teml"]')?.textContent ?? this.textContent;
    if (inline.trim()) this.source = dedent(inline);
  }

  attributeChangedCallback(name, old, value) {
    if (old === value) return;
    if (name === "src" && this.#started && value) this.#fetch(value);
    if (name === "select") this.#ctl?.select(value);
  }

  async #fetch(url) {
    const req = ++this.#req;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
      const text = await res.text();
      if (req === this.#req) this.source = text;
    } catch (e) {
      if (req !== this.#req) return;
      this.#problems = [{ level: "error", code: "LOAD", where: "", message: `Couldn't load ${url}: ${e.message}`, line: null, col: null }];
      this.#showProblems();
      this.#emit();
    }
  }

  get source() { return this.#source; }
  set source(text) {
    this.#source = String(text ?? "");
    const { model, problems } = parse(this.#source);
    this.#problems = problems;
    this.#stale = !model && !!this.#model;
    if (model) this.#draw(model);
    this.#showProblems();
    this.#emit();
  }

  get model() { return this.#model; }
  set model(m) {
    this.#source = null;
    this.#problems = [];
    this.#stale = false;
    this.#draw(m);
    this.#showProblems();
    this.#emit();
  }

  get problems() { return this.#problems; }

  #draw(m) {
    const keep = this.#ctl;
    keep?.destroy();
    this.#model = m;
    const root = this.#shadow;
    root.querySelector(".scroller").setAttribute("aria-label", `${m.metadata?.name ?? "Event model"} board`);
    this.#ctl = mountBoard(root, m, { select: keep?.selected() ?? this.getAttribute("select"), zoom: keep?.zoom(), reveal: !keep });
  }

  #showProblems() {
    const box = this.#shadow.querySelector(".problems"), ps = this.#problems;
    box.hidden = !ps.length;
    if (!ps.length) return;
    const n = l => ps.filter(p => p.level === l).length, errors = n("error"), warnings = n("warning");
    const count = (c, w) => c ? `${c} ${w}${c > 1 ? "s" : ""}` : "";
    box.querySelector("summary").textContent = [count(errors, "error"), count(warnings, "warning")].filter(Boolean).join(", ")
      + (this.#stale ? " · showing the last board that parsed" : "");
    box.classList.toggle("warnings-only", !errors);
    box.open = errors > 0;
    box.querySelector("ul").innerHTML = ps.map(p => `<li class="${p.level}"><span class="ln">${p.line ? `line ${p.line}` : ""}</span><span class="code">${esc(p.code)}</span>`
      + `<span class="msg">${esc(p.message)}${p.where ? ` <span class="where">${esc(p.where)}</span>` : ""}</span></li>`).join("");
  }

  #emit() { this.dispatchEvent(new CustomEvent("teml-load", { detail: { model: this.#model, problems: this.#problems } })); }
}

if (!customElements.get("teml-board")) customElements.define("teml-board", TemlBoard);
