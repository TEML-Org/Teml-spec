// Fills a page template with the shared board CSS, JS and toolbar, plus page values.
import fs from "fs";
const here = f => fs.readFileSync(new URL(f, import.meta.url), "utf8");
const json = v => JSON.stringify(v).replace(/</g, "\\u003c");
export function page(template, values) {
  const parts = { CSS: here("./board/board.css"), JS: here("./board/board.js"), TOOLBAR: here("./board/toolbar.html") };
  let out = here("./" + template);
  // DATA goes last so text inside a model can never be mistaken for a placeholder.
  const entries = Object.entries({ ...parts, ...values }).sort(([a], [b]) => (a === "DATA") - (b === "DATA"));
  for (const [k, v] of entries)
    out = out.split(`__${k}__`).join(k === "DATA" ? json(v) : typeof v === "string" ? v : json(v));
  return out;
}
