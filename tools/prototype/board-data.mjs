// Reads a TEML file for a page: its source, its name, and the facts line for its header.
import fs from "fs";
import { parse } from "./teml-core.mjs";
import { facts } from "./board/board.js";

export function boardData(file) {
  const source = fs.readFileSync(file, "utf8"), model = parse(source).model;
  return { source, file: file.split("/").slice(-2).join("/"), model, facts: facts(model) };
}
