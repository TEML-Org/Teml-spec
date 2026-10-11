# Contributing to TEML

Thank you for helping with TEML. This repository holds the language: the spec in [`spec/`](spec/), the JSON Schema in [`schema/`](schema/) and the examples in [`Examples/`](Examples/). This guide explains how a change to them is proposed, reviewed and accepted.

## Keep the spec small

TEML is in alpha, and the spec only gets features that a real model needs now. Every feature closes off future options and adds work for every tool that reads TEML. A feature left out can be added later without breaking any document, but a feature taken out breaks the documents that use it.

So a proposal starts from a concrete need: a model you are writing that TEML can't express, or can only express badly. "It might be useful" is not enough on its own. Some ideas have already been considered and set aside; they are listed in the spec's [Appendix B. Open questions](spec/teml-alpha-003.md#appendix-b-open-questions), some marked "not planned".

These principles guide every decision:

- **One way to write each thing.** Removing a second way of writing something is preferred over adding a new one.
- **Event Modeling, not Event Sourcing.** A model records business facts, not the event types in an application's code. Follow [eventmodeling.org](https://eventmodeling.org) where it has an answer.
- **Information flows left to right.** Anything that uses an element is drawn to its right on the board (Appendix C).
- **External systems call our API.** They never add events to our model; they trigger commands (§11).

## Small fixes

Typos, unclear wording, broken links and mistakes in examples don't need a proposal. Open a pull request directly.

## Changing the language

1. **Open an issue** that describes the need: the model you are writing, what you tried, and why it doesn't work. Include a short TEML snippet. If the idea is in Appendix B, say so.
2. **Agree on a proposal** in the issue before writing spec text. A proposal shows:
    - the new or changed syntax, with an example;
    - whether existing documents still work, and if not, how to migrate them;
    - any new validation rule (an error `E…` or a warning `W…` in §14);
    - what it leaves out on purpose, for Appendix B;
    - the simpler alternatives you considered, including changing only the tools.

    A maintainer approves the proposal, asks for changes or declines it. A declined idea may be added to Appendix B with the reason.
3. **Open a pull request** with every part of the change:
    - the spec text in its section, written with the RFC 2119 keywords (**MUST**, **SHOULD**, **MAY**; see §1.2);
    - an entry in the spec's "Changes from …" list, saying what was added, changed or removed, with the date;
    - the migration step, if documents need to change;
    - the schema in [`schema/`](schema/), when the structure changes;
    - an example in [`Examples/features/`](Examples/features/) that uses the feature, listed in Appendix A;
    - Appendix B updated, if the change answers an open question or sets new ones aside;
    - the README's History, for a notable change.
4. **Pass CI.** Every pull request checks the compliant examples against the schema and checks that the split hotel example merges into the same model as `hotel.teml.yaml`. A second job runs the semantic checks (§14) and the tools' tests against your branch. It needs a secret, so it is skipped on pull requests from forks; a maintainer runs it for you.
5. **Review and merge.** A maintainer reviews the pull request, may ask for screenshots of the board for a change that affects how a model is drawn, and merges it when it's ready. After the merge, the maintainers update the tools and teml.org.

## Versions

While TEML is in alpha, accepted changes amend the current version (`v-alpha-003`) in place, including breaking ones, and each is recorded in the "Changes from" list. A large rewrite starts a new alpha version in a new file, and earlier versions are kept in `spec/` for reference. See §15 for how versions are numbered.

## Writing style

Write short, plain sentences in present tense. Give each rule an example. Name the section a rule belongs to, and refer to other sections by number (§12.3).

## Licence

TEML is licensed under the [Apache License 2.0](LICENSE). By contributing, you agree that your contributions are licensed under it too.
