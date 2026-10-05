// Fills a page template with the page CSS, the bundled <teml-board> script, and page values.
import fs from "fs";
import { bundle } from "./bundle.mjs";
const here = f => fs.readFileSync(new URL(f, import.meta.url), "utf8");
const json = v => JSON.stringify(v).replace(/</g, "\\u003c");
export function page(template, values) {
  const parts = { CSS: here("./board/tokens.css") + here("./page.css"), JS: bundle() };
  let out = here("./" + template);
  // DATA goes last so text inside a model can never be mistaken for a placeholder.
  const entries = Object.entries({ ...parts, ...values }).sort(([a], [b]) => (a === "DATA") - (b === "DATA"));
  for (const [k, v] of entries)
    out = out.split(`__${k}__`).join(k === "DATA" ? json(v) : typeof v === "string" ? v : json(v));
  return out;
}
