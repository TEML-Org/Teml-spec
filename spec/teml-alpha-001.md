# TEML — The Event Modeling Language

**Version:** `teml.org/v-alpha-001` (draft)
**Status:** Working draft. Anything here may change before the first stable version.
**Machine-readable schema:** [`schema/teml-alpha-001.schema.json`](../schema/teml-alpha-001.schema.json)
**Website:** <https://teml.org>

---

## 1. Introduction

TEML is a textual language for documenting an [Event Model](https://eventmodeling.org). It is based on YAML, so it is fast to write and simple to read.

Graphical Event Modeling tools work well for sharing a model visually. However, they take time to build and maintain, and they can be hard to use for people with disabilities. TEML provides a plain-text alternative that offers:

- better accessibility for people with hand limitations and for screen-reader users;
- faster input, because everything is typed text;
- plain-text files that work with version control such as Git;
- a standard format that tools can read to produce documents and code, and that tools can write when documenting existing code.

### 1.1 Two ways to write TEML

TEML is designed for two styles of use (§2):

1. **Sketch.** A pseudo-code style for quickly getting ideas out of your head and into a text editor. You include only as much detail as your team needs.
2. **Compliant.** A refined, fully specified version that can be fed into processors for code generation, validation and rendering.

The same constructs are used in both styles. A compliant document is a sketch with every detail filled in.

### 1.2 Conventions

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

A **processor** is any tool that reads TEML: a validator, renderer, code generator, and so on.

Sections marked **(extension)** were proposed in this spec repository and do not yet appear on teml.org. They are optional; a document that does not use them loses nothing.

---

## 2. Sketch and compliant documents

A document that contains an `apiVersion` (§4.1) is a **compliant** document. A document without one is a **sketch**.

| | Sketch | Compliant |
|---|---|---|
| Header (`apiVersion`, `metadata`) | optional | required |
| Property types | optional; properties can be listed by name only | required |
| Slice `event` | optional | required |
| References | should resolve | **MUST** resolve |
| Processor problems | reported as **warnings** | reported as **errors** |

Processors **SHOULD** accept sketches and do what they can with them, such as rendering whatever is present.

A sketch, which is still valid YAML:

```yaml
aggs:
  - UserAgg: &User [id, firstName, lastName, age]

views:
  - UserView: &UserView [id, firstName, lastName, age]

slices:
  - AddUser:
      event:
        name: AddedUser
        props: [id, firstName, lastName, age]
      views: [*UserView]

  - RenameUser:
      event:
        name: RenamedUser
        props: [id, firstName, lastName]
      views: [*UserView]
```

> **Note.** A sketch MUST still be valid YAML. Writing `UserAgg: &User id` and continuing on the next lines with `firstName`, `lastName` produces a single string (`"id firstName lastName"`), not a list. Use a flow list such as `[id, firstName, lastName]`, or a block list with `- id` on each line.

---

## 3. Files

- A TEML document **MUST** be a single YAML document. Processors **MUST** support YAML anchors, aliases and the merge key `<<`, because TEML relies on them (§5).
- The file extension **SHOULD** be `.teml.yaml`, which keeps YAML editor support working. Processors **SHOULD** also accept `.teml` and `.yaml`.
- The encoding **MUST** be UTF-8.

Compliant documents **MAY** start with this comment, which lets YAML-aware editors provide autocomplete and validation:

```yaml
# yaml-language-server: $schema=https://teml.org/schema/teml-alpha-001.schema.json
```

### 3.1 Extensions

Any mapping **MAY** contain keys that start with `x-`, for example `x-color: orange`. Processors **MUST** ignore extension keys they do not understand.

In compliant documents, every other key that this spec does not define is an **error**. The exceptions are property maps (§6), whose keys are property names.

---

## 4. Document structure

```yaml
apiVersion: teml.org/v-alpha-001
metadata:
  name: sample

types:   []    # (extension) reusable property shapes and enums  §6.4
aggs:    []    # aggregates                                        §7
views:   []    # read models                                       §8
wfes:    []    # (extension) workflow-engine processes             §9
slices:  []    # the timeline, in order                            §10
```

Each section is optional, but a model without `slices` describes nothing. Authors **SHOULD** put `aggs`, `views` and `wfes` before `slices`, because a YAML alias (`*User`) can only refer to an anchor (`&User`) that appears earlier in the file.

### 4.1 `apiVersion`

The version of the TEML specification the document follows. It is a string of the form `teml.org/<version>`. For this version it **MUST** be:

```yaml
apiVersion: teml.org/v-alpha-001
```

### 4.2 `metadata`

| Key | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Name of the model. |
| `description` | string | no | |
| `version` | string | no | Version of *the model* (not of TEML). |

### 4.3 Named lists

`types`, `aggs`, `views`, `wfes` and `slices` are all **named lists**: lists whose items are single-key mappings from a **name** to a **body**.

```yaml
views:
  - UserView: &UserView    # name: UserView, anchor: &UserView
      id: g
      firstName: s
```

- Names **MUST** match `^[A-Za-z][A-Za-z0-9_]*$` and **MUST** be unique within their list.
- List order is meaningful for `slices`, which run left to right on the timeline (§10). For the other lists, order only affects presentation.
- The body **MAY** carry a YAML anchor so that it can be referenced later (§5).

---

## 5. References

A slice refers to aggregates, views and WFEs in one of two ways:

1. **By alias (recommended).** Put an anchor on the definition's body and use an alias wherever it is needed:
   ```yaml
   aggs:
     - UserAgg: &User
         id: g
   slices:
     - AddUser:
         agg: *User
   ```
2. **By name.** Use a plain string holding the element's name:
   ```yaml
   agg: UserAgg
   ```

The anchor name (`User`) and the element name (`UserAgg`) **MAY** differ. A name reference always uses the element name.

### 5.1 Merged references (views only)

Within a slice's `views` list, an item **MAY** merge a view and mark the properties the slice touches with the value `x`:

```yaml
views:
  - <<: *UserView
    id: x
    firstName: x
```

This means "this slice updates `UserView`, specifically `id` and `firstName`". See §10.4.

### 5.2 Processor rules

- Processors **MUST** resolve an alias to the definition whose body carries the matching anchor. They **MUST** do this by node identity or by the anchor name, never by comparing values: two aggregates with identical properties are still different aggregates.
- For a merged view reference, processors **MUST** identify the view from the alias given to `<<`.
- Processors **MUST NOT** treat a property whose value is `x` as a type.

> **Implementation note.** Most YAML libraries can preserve aliases. For example, `yaml` (JavaScript) via `parseDocument`, `ruamel.yaml` (Python), and `gopkg.in/yaml.v3` via `yaml.Node`. With libraries that expand aliases into shared objects, the alias and the definition are the same object, which also satisfies the node-identity rule.

---

## 6. Properties and types

Aggregates, views, commands and events describe their data with **props**.

### 6.1 Property maps

In a compliant document, props are a mapping from property name to a **property spec**:

```yaml
id: g                  # type
middleName: s?         # optional
roles: s[]             # list
tags: [s]              # list (same as s[])
address: Address       # named type (extension, §6.4)
name:                  # nested object
  first: s
  last: s
phones:                # list of nested objects
  - kind: s
    number: s
```

A **property spec** is one of:

| YAML form | Meaning |
|---|---|
| **string** | A type expression (§6.2). |
| **sequence with exactly one item** | A list whose items are described by that item, which is itself a property spec. |
| **mapping** | A nested object; the mapping is itself a property map. |

Property names **MUST** match `^[A-Za-z_][A-Za-z0-9_]*$` and **SHOULD** be camelCase.

### 6.2 Type expressions

```
type-expr       ::= base-type list-suffix* optional-suffix?
base-type       ::= primitive | TypeName
list-suffix     ::= "[]"
optional-suffix ::= "?"
```

- `T[]` is a list of `T`.
- `T?` marks the property as optional. The `?` comes last, so `s[]?` is an optional list of strings.

### 6.3 Primitive types

TEML favours the short names used on teml.org. The longer aliases are equivalent, and processors **MUST** treat them identically.

| Type | Aliases | Meaning |
|---|---|---|
| `g` | `guid`, `uuid` | Globally unique identifier |
| `s` | `str`, `string` | Text |
| `int` | `i`, `integer` | Whole number |
| `dec` | `decimal` | Exact decimal (money, quantities) |
| `float` | `f` | Floating-point number |
| `bool` | `b`, `boolean` | `true` / `false` |
| `date` | | Calendar date (ISO 8601) |
| `time` | | Time of day (ISO 8601) |
| `dt` | `datetime`, `timestamp` | Date and time with time zone (ISO 8601) |
| `dur` | `duration` | ISO 8601 duration |
| `uri` | `url` | URI |
| `any` | | Unspecified |

`x` is reserved as the "touched" marker (§5.1) and is **not** a type. None of the names in this table, nor `x`, may be used as a `types` name.

### 6.4 Named types (`types`) — (extension)

`types` is a named list of reusable shapes. A body is either a property map (an object type) or a mapping with an `enum` list:

```yaml
types:
  - Address:
      street: s
      city: s
  - UserStatus:
      enum: [Active, Suspended]
```

A body that has an `enum` key **MUST NOT** have any other keys.

### 6.5 Props in sketches

In a sketch, props **MAY** be a **list of property names** without types:

```yaml
props: [id, firstName, lastName]
```

A compliant document **MUST** use a property map.

---

## 7. Aggregates (`aggs`)

Aggregates are the parts of the system that handle commands and enforce business rules. Their events form the streams at the bottom of the board.

`aggs` is a named list (§4.3). Each body is the aggregate's props (§6):

```yaml
aggs:
  - UserAgg: &User
      id: g
      firstName: s
      lastName: s
      age: int
```

---

## 8. Views (`views`)

Views are read models: projections of event data used for querying or presentation.

`views` is a named list (§4.3). Each body is the view's props:

```yaml
views:
  - UserView: &UserView
      id: g
      firstName: s
      lastName: s
      age: int
```

Slices declare which views their events update (§10.4).

---

## 9. Workflow engines (`wfes`)

A **WFE** (WorkFlow Engine) is a process that runs in response to events without a person involved, such as a policy, saga, scheduled job or integration. Event Modeling draws it as a ⚙ processor.

Slices list the WFEs their events trigger (§10). **(Extension)** WFEs **MAY** also be defined up front so they can be referenced by alias, and a slice **MAY** state that its command is issued by a WFE (§10.5).

```yaml
wfes:
  - WelcomeEmailer: &WelcomeEmailer
      description: Sends a welcome email to each newly added user.
```

| Key | Type | Description |
|---|---|---|
| `description` | string | |
| `schedule` | string | When it runs, if time-based. Free text or a cron expression. |

---

## 10. Slices (`slices`)

A **slice** is a unit of work in the application. Something triggers a **command**, the command results in an **event**, and that event updates **views** and may trigger **WFEs**.

`slices` is a named list (§4.3). **List order is timeline order** (left to right on the board).

```yaml
slices:
  - AddUser:
      agg: *User
      command:
        name: AddUser
      event:
        name: AddedUser
        props:
          id: g
          firstName: s
          lastName: s
      views:
        - *UserView
```

### 10.1 Slice keys

| Key | Type | Description |
|---|---|---|
| `agg` | Aggregate reference | The aggregate affected by the slice. |
| `command` | Command | §10.2. Optional; inferred from the slice name when omitted. |
| `event` | Event | §10.3. **Required** in compliant documents (unless `events` is used). |
| `events` | list of Event | **(extension)** Use instead of `event` when a command produces more than one event. |
| `views` | list of view references | §10.4. Views updated by the slice's events. |
| `wfes` | list of WFE references or names | WFEs triggered by the slice's events. |
| `trigger` | Trigger | **(extension)** §10.5. What issues the command. |
| `story` | string | URL or identifier of the related story or ticket. |
| `status` | string | §10.6. |
| `description` | string | |
| `specs` | list of Spec | **(extension)** §11. |

`event` and `events` **MUST NOT** both appear.

### 10.2 Command

A command is the request to do something. Its name **SHOULD** be imperative, for example `AddUser` or `DoSomething`.

| Form | Meaning |
|---|---|
| omitted | The command is inferred. Its name is the slice name, and its props are unspecified. |
| string | The command's name; props unspecified. |
| mapping | `name` (optional; defaults to the slice name) and `props` (optional). |

```yaml
command:
  name: AddUser          # optional, defaults to the slice name
  props:
    id: g
    firstName: s
```

### 10.3 Event

An event is the fact that results from the command. It is the critical piece of information that a model captures. Its name **MUST** be in the past tense and **SHOULD** be declarative, for example `AddedUser` or `ItWasDone`.

| Form | Meaning |
|---|---|
| string | The event's name; props unspecified (sketch). |
| mapping | `name` (**required**) and `props`. |

In a compliant document, an event **MUST** be a mapping with `props`.

An event is defined by the slice that produces it, and an event name **MUST** be unique across all slices.

### 10.4 Views in a slice

Each item of a slice's `views` list is one of:

| Form | Example | Meaning |
|---|---|---|
| alias | `- *UserView` | This slice updates `UserView`; which properties is not specified. |
| name | `- UserView` | Same as above, by name. |
| merged alias with markers | `- <<: *UserView`<br>`  firstName: x` | This slice updates `UserView`, touching the properties marked `x`. |

In the merged form:

- each marked key **MUST** be a property of the view;
- the marker value **MUST** be `x`. Overriding a property with a type is an error in compliant documents.

"Touched" covers both properties the event sets and properties used to find the view record, such as `id`.

### 10.5 Trigger — (extension)

`trigger` records what issues the command. It is a single-key mapping:

| Form | Meaning |
|---|---|
| `trigger: { screen: AddUserForm }` | A person issues the command from the named screen or UI. |
| `trigger: { wfe: *WelcomeEmailer }` | The referenced WFE issues the command (an automation). |

When `trigger` is omitted, the trigger is unspecified.

### 10.6 Status

A free-form string describing the slice's state. Recommended values are `InDev` and `Completed`. Teams **MAY** use their own values.

---

## 11. Specifications (Given / When / Then) — (extension)

A slice **MAY** include `specs`, a list of scenarios written in Event Modeling's Given/When/Then form.

| Key | Type | Description |
|---|---|---|
| `name` | string | **Required.** What the scenario shows. |
| `given` | list of Instance | Events that have already happened. |
| `when` | Instance | The command under test. |
| `then` | list of Instance | **Required.** The expected events, an `error`, or (for a WFE-triggered slice with no `when`) the commands the WFE issues. |

An **Instance** is a single-key mapping from an event or command name to example values. The values **MAY** be partial; only the properties that matter for the scenario need to appear.

```yaml
specs:
  - name: adds a new user
    when:
      AddUser: { id: u-1, firstName: Ada, lastName: Lovelace }
    then:
      - AddedUser: { id: u-1, firstName: Ada, lastName: Lovelace }
  - name: rejects a duplicate id
    given:
      - AddedUser: { id: u-1 }
    when:
      AddUser: { id: u-1 }
    then:
      - error: UserAlreadyExists
```

---

## 12. Validation

These rules apply to compliant documents. For sketches, processors **SHOULD** report the same problems as warnings.

**Errors**

- E1 `apiVersion` is missing or not supported, or `metadata.name` is missing.
- E2 A name is duplicated within a named list, or two slices define the same event name.
- E3 A reference (alias or name) does not resolve to an element of the expected kind.
- E4 A property is untyped, or a type expression names an unknown type.
- E5 A slice has no `event` (or `events`), or has both.
- E6 A merged view reference marks a property the view does not have, or uses a value other than `x`.
- E7 A spec instance names an unknown command or event, or a property it does not define.

**Warnings**

- W1 An event name does not appear to be in the past tense, or a command name does not appear to be imperative.
- W2 A view is not updated by any slice.
- W3 An aggregate, view or WFE is defined but never referenced.

---

## 13. Versioning

- `apiVersion` identifies the spec version as `teml.org/<version>`.
- Alpha versions are numbered `v-alpha-001`, `v-alpha-002`, and so on. Any alpha version may make breaking changes.
- Stable versions will be numbered `v001`, `v002`, and so on. Once stable versions exist, a newer version **SHOULD** only add optional features.
- Processors **MUST** reject an `apiVersion` they do not recognise.

---

## Appendix A. Examples

- [`Examples/user-sketch.teml.yaml`](../Examples/user-sketch.teml.yaml): a sketch.
- [`Examples/user-compliant.teml.yaml`](../Examples/user-compliant.teml.yaml): the same model as a compliant document, including the extensions.

## Appendix B. Open questions

- **Screens and actors.** Should UI wireframes and actors (the top swimlanes of an Event Model) get their own top-level list, beyond `trigger: { screen: … }`?
- **State-view slices.** Event Modeling has slices that only show a view on a screen. Here, views are attached to the slices whose events update them. Is a separate view-only slice needed?
- **External events / translations.** How should events that originate in other systems be represented?
- **Multiple files.** An include mechanism for large models. Note that YAML aliases cannot cross files, so name references (§5) would be required there.
- **Chapters.** Grouping slices into named chapters on the timeline.
