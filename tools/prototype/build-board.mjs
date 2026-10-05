// Usage: node build-board.mjs <file.teml.yaml> <out.html> [slice to select first]
import { boardData } from "./board-data.mjs";
import { page } from "./page.mjs";
import fs from "fs";
const [inFile, outFile, select = ""] = process.argv.slice(2);
const { source, file, model, facts } = boardData(inFile);
fs.writeFileSync(outFile, page("board-template.html", {
  TITLE: `${model.metadata.name} Event Model`, DATA: { source, file, facts, select, apiVersion: model.apiVersion, metadata: model.metadata },
}));
console.log("wrote", outFile, fs.statSync(outFile).size, "bytes");
