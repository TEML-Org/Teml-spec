// Reads a TEML file into board data: teml-core's model plus the file's name and source.
import fs from "fs";
import { parse } from "./teml-core.mjs";

export function boardData(file) {
  const source = fs.readFileSync(file, "utf8");
  return { ...parse(source).model, file: file.split("/").slice(-2).join("/"), source };
}
