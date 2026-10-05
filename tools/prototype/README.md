# TEML prototype tools

Prototype tools written while testing the TEML spec against the hotel example. They support `teml.org/v-alpha-003`. They are a starting point for the reusable viewer in [issue #2](https://github.com/TEML-Org/Teml-spec/issues/2), not a finished product.

| File | What it does |
|---|---|
| `teml-core.mjs` | Parses a TEML document, checks the semantic rules in spec §14 (references, types, change and view slices, view updates, triggers, and specs), and returns the normalized model below. Every problem has a line number. No file or DOM access, so it also runs in a browser. |
| `check.mjs` | Command-line wrapper around `teml-core.mjs`. Reports errors for compliant documents and warnings for sketches. |
| `validate.mjs` | Checks documents against a JSON Schema, such as [`schema/teml-alpha-003.schema.json`](../../schema/teml-alpha-003.schema.json), with line numbers. This covers structure only. |
| `board-data.mjs` | Reads a TEML file into board data: the model plus the file's name and source. |
| `test/` | Tests for `teml-core.mjs`. Each broken file in `test/fixtures/` lists the errors it must produce in `# expect:` comments. |
| `board/` | The board renderer (`board.js`, which exposes `mountBoard(element, data)`), its styles, and its toolbar. Shared by both pages below. |
| `build-board.mjs` + `board-template.html` | Writes a self-contained HTML page with one model's board. |
| `build-demos.mjs` + `demo-template.html` | Writes a demo page with a tab per feature example (`Examples/features/`) and the hotel model. |
| `page.mjs` | Fills a page template with the shared board files and the model data. |

## Usage

Requires Node 18 or later.

```sh
cd tools/prototype
npm install
npm run validate   # schema check of the compliant examples
npm run check      # semantic checks of every .teml.yaml file in Examples/
npm test           # teml-core tests, including the broken fixtures
npm run board      # writes out/hotel-board.html; open it in a browser
npm run demos      # writes out/demos.html, one tab per feature
```

`validate` and `check` exit non-zero when a file has errors (sketch warnings don't count). CI runs them and the tests on every PR (`.github/workflows/check.yml`).

To draw another model, run `node build-board.mjs path/to/model.teml.yaml out/model.html [SliceToSelect]`.

## teml-core

```js
import { parse } from "./teml-core.mjs";
const { data, model, problems, lineAt } = parse(text);
```

- `problems`: `{ level, code, where, message, line, col }`. `level` is `"error"` or `"warning"`; `code` is a rule from spec §14 (`E1`–`E7`, `W1`–`W4`) or `YAML` for a syntax error; `where` is a path such as `slices.BookRoom.agg`.
- `model`: `null` only when the YAML doesn't parse. A document with errors still gets a model, built from whatever is usable, so a board can draw as far as it can.
- `data`: the parsed YAML. `lineAt(path)` gives the line and column of a path into it, such as `["slices", 2, "BookRoom", "agg"]`.

### The model

The contract between parsing and drawing. Names are as written in the document; references are not checked here (that is what `problems` is for).

```
{
  apiVersion: string | null,  compliant: boolean,  metadata: { name?, description?, … },
  types, actors, aggs, views, automations:  [{ name, body }]   // body as written: props, or a list in a sketch
  screens:  [{ name, actor, description, wireframe }]
  systems:  [{ name, description }]
  slices: [
    // change slice
    { kind: "change", name, status, story, description, specs,
      agg, trigger: { kind: "screen" | "automation" | "system", name } | null,
      command: { name, props, inferred },            // inferred: named after the slice
      events: [{ name, props }],
      views:  [{ name, touched: [prop] }] },
    // view slice
    { kind: "view", name, status, story, description, specs,
      view, readBy: [{ kind: "screen" | "automation", name }] }
  ]
}
spec:      { name, given: [instance], when: instance | null, then: [instance] }
instance:  { name, data }    // an event, command or view instance, or { name: "error", data: message }
```

Unset strings are `null`; unset lists are `[]`.

## Board layout

- **Columns:** one per slice, in timeline order. View slices are tagged "View".
- **Lanes, top to bottom:**
  - one lane per actor, holding that actor's screens
  - one lane per external system that calls our API
  - automations
  - commands and read models
  - one event lane per aggregate
- **Arrows:**
  - In a change slice: trigger (screen, external system or automation) → command → event(s) → read model(s).
  - In a view slice: read model → the screens and automations that read it. Readers sit to the right of the read model, because information flows left to right: the read model must exist before a screen can show it.
- **Interaction:** click a sticky or a slice heading to see its props and its Given/When/Then specs.

## Known limitations

- **Compliant documents only, mostly.** The board is designed for compliant documents. Sketches may render incompletely, and a reference to something that doesn't exist (such as `agg: Nope`) is reported by `check` but not yet drawn sensibly.
- **Approximate checks.** Spec instance values are checked only for names and top-level props, not types.
- **Loads fonts from the web.** The page uses Google Fonts, with system fonts as a fallback.
