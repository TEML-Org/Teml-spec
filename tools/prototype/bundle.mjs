// Bundles <teml-board> (board/teml-board.js) and the YAML parser into one script.
import { buildSync } from "esbuild";

export function bundle() {
  const { outputFiles: [js] } = buildSync({
    entryPoints: [new URL("./board/teml-board.js", import.meta.url).pathname],
    bundle: true, format: "iife", minify: true, target: "es2022", write: false,
    loader: { ".css": "text", ".html": "text" }, legalComments: "none",
  });
  // Safe to inline in a <script> element.
  return js.text.replace(/<\/(script)/gi, "<\\/$1");
}
