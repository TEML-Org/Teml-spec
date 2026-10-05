// Writes the bundled <teml-board> script. Usage: node build.mjs [out/teml-board.js]
import fs from "fs";
import { bundle } from "./bundle.mjs";
const out = process.argv[2] ?? "out/teml-board.js";
fs.writeFileSync(out, bundle());
console.log("wrote", out, fs.statSync(out).size, "bytes");
