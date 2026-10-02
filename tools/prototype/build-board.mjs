// Usage: node build-board.mjs <file.teml.yaml> <out.html>
import { boardData } from "./board-data.mjs";
import fs from "fs";
const [inFile, outFile] = process.argv.slice(2);
const json = JSON.stringify(boardData(inFile)).replace(/</g, "\\u003c");
fs.writeFileSync(outFile, fs.readFileSync(new URL("./board-template.html", import.meta.url), "utf8").replace("__DATA__", () => json));
console.log("wrote", outFile, fs.statSync(outFile).size, "bytes");
