// Usage: node build-board.mjs <file.teml.yaml> <out.html> [slice to select first]
import { boardData } from "./board-data.mjs";
import { page } from "./page.mjs";
import fs from "fs";
const [inFile, outFile, select = ""] = process.argv.slice(2);
const M = boardData(inFile);
fs.writeFileSync(outFile, page("board-template.html", { TITLE: `${M.metadata.name} Event Model`, DATA: M, SELECT: select }));
console.log("wrote", outFile, fs.statSync(outFile).size, "bytes");
