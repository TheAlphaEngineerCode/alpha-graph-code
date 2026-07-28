# ADR-0006 — Diagnostics carry an identifier, not prose

|                |                                                          |
| -------------- | -------------------------------------------------------- |
| **Status**     | Accepted                                                 |
| **Date**       | 2026-07-27                                               |
| **Phase**      | 1                                                        |
| **Supersedes** | The inline message strings introduced earlier in Phase 1 |

## Context

User-facing output must be available in **three locales — `en`, `pt-BR`, `es` — with the locale
selectable at runtime**. Diagnostics are the whole of that surface today: the ~70 messages the
CLI prints when a graph fails to validate.

The obvious implementation is to keep building the string at the point of failure and pass a
locale down to every site that constructs one. That threads a locale parameter through the lexer,
the parser, the typechecker and the interpreter, and it makes the rendered text part of the
diagnostic's identity.

There is a reason specific to this project why that is the wrong shape, and it is not about
translation at all.

**A locale-dependent message breaks replay determinism.** `specs/trace-v1.md` requires that the
same input and the same cassette produce **the same trace, byte for byte** — that assertion is
the project's central test. Errors are written to the reserved `errors` channel as structured
objects (`specs/ir-v1.md` §6.2) and appear in the trace. If the message text is baked in at
construction time in whatever locale happened to be active, then two runs of the same graph on
two machines produce different traces, and the difference is invisible in the graph.

Localised prose inside a byte-comparable artefact is a contradiction. One of the two has to give,
and it is not going to be determinism.

## Decision

### 1. A diagnostic is data. Text is a projection of it

```ts
interface Diagnostic {
  readonly code: DiagnosticCode; //  AGX-E310
  readonly messageId: MessageId; //  'unknown-channel'
  readonly params: MessageParams[MessageId]; //  { name: 'confidenc' }
  readonly span: Span;
  readonly suggestionId?: MessageId;
  readonly suggestionParams?: …;
}
```

No rendered string is stored. `render(diagnostic, locale)` produces the text, and the caller
decides when and in which locale — the CLI at print time, the Studio at display time, a trace
never.

This costs one indirection at every message site and buys three things at once:

- **The trace stays locale-independent**, because it stores `code` + `params`, not prose.
- **Machine consumers match on `messageId`**, not on a sentence. A CI check or an editor
  integration that greps `"Unknown channel"` breaks the day someone improves the wording; one
  that matches `unknown-channel` does not.
- **Tests stop being coupled to phrasing.** Asserting `messageId` says what the compiler
  concluded; asserting a sentence fragment says what it happened to say about it.

The third point is worth stating plainly: before this ADR, twenty tests failed when the messages
were translated. Not one of them was testing behaviour that had changed.

### 2. Catalogue completeness is a type error, not a runtime check

```ts
export interface MessageParams {
  'unknown-channel': { name: string };
  'declared-channels': { names: string };
  …
}
export type MessageId = keyof MessageParams;
export type Catalog = { readonly [K in MessageId]: (p: MessageParams[K]) => string };
```

`en`, `ptBR` and `es` are each declared `Catalog`. A missing key or a wrong parameter type is a
**compile error**, so a locale cannot ship half-translated. That is a stronger guarantee than any
test could give, because it cannot be skipped or forgotten.

A runtime test still exists, for the thing types cannot see: that no entry throws, that none
returns empty, and that the three catalogues are not byte-identical to each other — which is what
a copy-paste of `en` into `es` would look like to the type checker.

### 3. `en` is the default, and the fallback is `en`

The default locale is `en`, matching the language of the repository's public surface. An unknown
locale falls back to `en` rather than failing: refusing to print a diagnostic because the locale
tag was wrong would hide the error the user was actually trying to read.

### 4. Locale is chosen by the caller, not by the environment

The library never reads `process.env.LANG` or the host locale. The CLI will accept `--locale` and
may consult the environment itself, but `packages/expr` takes the locale as an argument.

Reading ambient state inside the core would make the same expression render differently depending
on where it ran, which is the class of behaviour this project spends its determinism budget
avoiding.

## Consequences

- `Diagnostic` no longer has a `message` field. Every consumer renders explicitly. This is a
  breaking change to a package with no external consumers yet — the cheapest possible moment.
- `packages/expr` gains `src/messages/` with the ID contract and the three catalogues.
- The ~70 message sites pass an ID and typed params instead of interpolating a template.
- Diagnostic documentation pages in `docs/diagnostics/` stay in English and single-language, per
  the project's language rule: they document the code, not the copy.
- `specs/agx-expr.md` §7 gains the message-identifier column, because the ID is now part of the
  normative contract — a consumer may depend on it.
- **Deferred:** message catalogues for node types, the Studio UI and the CLI's own chrome
  (headings, flags, help text) do not exist yet. When they do, they follow this ADR rather than
  inventing a second mechanism.
