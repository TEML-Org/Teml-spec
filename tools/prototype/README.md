# TEML prototype tools

Throwaway prototype tools written while testing the `teml.org/v-alpha-001` spec against the hotel example. They are a starting point for the reusable viewer in [issue #2](https://github.com/TEML-Org/Teml-spec/issues/2), not a finished product.

| File | What it does |
|---|---|
| `validate.mjs` | Checks documents against [`schema/teml-alpha-001.schema.json`](../../schema/teml-alpha-001.schema.json). This covers structure only. |
| `check.mjs` | Checks the semantic rules in spec §12: references resolve, types exist, view overrides match the view, and spec instances use real events, commands and props. Reports errors for compliant documents and warnings for sketches. |
| `board-data.mjs` | Reads a TEML document into the data an Event Modeling board needs. |
| `build-board.mjs` + `board-template.html` | Writes a single self-contained HTML page that draws the board. |

`check.mjs` and `board-data.mjs` work on the YAML syntax tree rather than the plain parsed data. That is how they resolve aliases by anchor and read view overrides before `<<` merges them, as spec §5.2 requires.

## Usage

Requires Node 18 or later.

```sh
cd tools/prototype
npm install
npm run validate   # schema check of the compliant examples
npm run check      # semantic checks of every file in Examples/
npm run board      # writes out/hotel-board.html; open it in a browser
```

To draw another model, run `node build-board.mjs path/to/model.teml.yaml out/model.html`.

## Board layout

- **Columns:** one per slice, in timeline order.
- **Lanes, top to bottom:** screens, automations (WFEs), commands and read models, then one event lane per aggregate.
- **Arrows:** trigger → command → event(s) → read model(s). A dashed arrow runs from an event to the automation it triggers.
- **Interaction:** click a sticky or a slice heading to see its props and its Given/When/Then specs.

## Known limitations

- **Compliant documents only, mostly.** The board is designed for compliant documents. Sketches may render incompletely.
- **No actors.** Screens share one lane because the spec has no actors yet. External events and view-only slices are missing for the same reason (see spec Appendix B).
- **Approximate checks.** The past-tense check (W1) is a simple heuristic. W6 is not implemented, and §11 specs are checked only for names and props.
- **Loads fonts from the web.** The page uses Google Fonts, with system fonts as a fallback.
