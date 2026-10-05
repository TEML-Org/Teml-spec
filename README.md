# Teml-spec
The Event Modeling Language (TEML) spec defines a versioned language for representing Event Models using text only. See https://teml.org for updates.

TEML is based on YAML, so it is fast to write, simple to read, and works with any editor and with version control.

```yaml
apiVersion: teml.org/v-alpha-003
metadata:
  name: sample

aggs:
  - UserAgg:
      id: g
      firstName: s
      lastName: s

views:
  - UserView:
      id: g
      firstName: s
      lastName: s

slices:
  - AddUser:
      agg: UserAgg
      events:
        - AddedUser:
            id: g
            firstName: s
            lastName: s
      views: [UserView]
```

You can write TEML as a quick **sketch** (no header, untyped props) or as a **compliant** document that tools can process.

## Contents

| Path | What it is |
|---|---|
| [`spec/teml-alpha-003.md`](spec/teml-alpha-003.md) | The language specification (`teml.org/v-alpha-003`, draft). [`v-alpha-002`](spec/teml-alpha-002.md) and [`v-alpha-001`](spec/teml-alpha-001.md) are kept for reference. |
| [`schema/teml-alpha-003.schema.json`](schema/teml-alpha-003.schema.json) | JSON Schema for compliant documents (editor autocomplete and validation) |
| [`Examples/user-sketch.teml.yaml`](Examples/user-sketch.teml.yaml) | The user example as a sketch |
| [`Examples/user-compliant.teml.yaml`](Examples/user-compliant.teml.yaml) | The user example as a compliant document |
| [`Examples/hotel.teml.yaml`](Examples/hotel.teml.yaml) | The classic Event Modeling hotel example: actors, screens, view slices, a payment provider that calls our API, and specs |
| [`Examples/features/`](Examples/features/) | Small examples of actors and screens, view slices, and an external system |

The tools (the checker, the `<teml-board>` web component and the coming viewer) moved to their own repository, TEML-Org/teml-tools, on 2026-10-05. It is private for now; the boards they draw are at [teml.org/demos](https://teml.org/demos/).

### Editor support

Add this line to the top of a compliant `.teml.yaml` file to get autocomplete and validation in VS Code (Red Hat YAML extension) and other editors that use yaml-language-server:

```yaml
# yaml-language-server: $schema=https://teml.org/schema/teml-alpha-003.schema.json
```

## History

2026/10/04: Draft `v-alpha-003`: a smaller language. References are plain names (no YAML anchors or aliases), one name per type, one `events` list per slice, and `automations` that always work from a to-do view.

2026/10/02: Draft `v-alpha-002`: actors and screens, view slices, and external systems.

2026/10/01: First draft of the `v-alpha-001` spec, aligned with teml.org, plus a JSON Schema and examples.

2025/01/07: We are just at the very beginning stages of defining this spec. If you would like to help, your contributions will be appreciated.

2024/12/29: started this repo and project
