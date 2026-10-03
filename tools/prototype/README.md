# TEML prototype tools

Prototype tools written while testing the TEML spec against the hotel example. They support `teml.org/v-alpha-001` and `v-alpha-002`. They are a starting point for the reusable viewer in [issue #2](https://github.com/TEML-Org/Teml-spec/issues/2), not a finished product.

| File | What it does |
|---|---|
| `validate.mjs` | Checks documents against a JSON Schema, such as [`schema/teml-alpha-002.schema.json`](../../schema/teml-alpha-002.schema.json). This covers structure only. |
| `check.mjs` | Checks the semantic rules in spec §14: references and anchors, types, change and view slices, view overrides, external-system triggers, and specs. Reports errors for compliant documents and warnings for sketches. |
| `board-data.mjs` | Reads a TEML document into the data an Event Modeling board needs. |
| `board/` | The board renderer (`board.js`, which exposes `mountBoard(element, data)`), its styles, and its toolbar. Shared by both pages below. |
| `build-board.mjs` + `board-template.html` | Writes a self-contained HTML page with one model's board. |
| `build-demos.mjs` + `demo-template.html` | Writes a demo page with a tab per feature example (`Examples/features/`) and the hotel model. |
| `page.mjs` | Fills a page template with the shared board files and the model data. |

`check.mjs` and `board-data.mjs` work on the YAML syntax tree rather than the plain parsed data. That is how they resolve aliases by anchor and read view overrides before `<<` merges them, as spec §5.2 requires.

## Usage

Requires Node 18 or later.

```sh
cd tools/prototype
npm install
npm run validate   # schema check of the compliant examples
npm run check      # semantic checks of every file in Examples/
npm run board      # writes out/hotel-board.html; open it in a browser
npm run demos      # writes out/demos.html, one tab per feature
```

To draw another model, run `node build-board.mjs path/to/model.teml.yaml out/model.html [SliceToSelect]`.

## Board layout

- **Columns:** one per slice, in timeline order. View slices are tagged "View".
- **Lanes, top to bottom:**
  - one lane per actor, holding that actor's screens
  - one lane per external system that calls our API
  - automations (WFEs)
  - commands and read models
  - one event lane per aggregate
- **Arrows:**
  - In a change slice: trigger (screen, external system or automation) → command → event(s) → read model(s).
  - In a view slice: read model → the screens and automations that read it. Readers sit to the right of the read model, because information flows left to right: the read model must exist before a screen can show it.
  - Dashed arrows run from an event to the automation it triggers.
- **Interaction:** click a sticky or a slice heading to see its props and its Given/When/Then specs.

## Known limitations

- **Compliant documents only, mostly.** The board is designed for compliant documents. Sketches may render incompletely.
- **Approximate checks.** The past-tense check (W1) is a simple heuristic. Spec instance values are checked only for names and top-level props, not types.
- **Loads fonts from the web.** The page uses Google Fonts, with system fonts as a fallback.
