<div align="center">

# Alpha Graph Code

**A compiler for AI workflows — not an execution platform.**

You describe or draw the workflow. The system converts it to the Alpha Graph IR, validates it,
simulates it step by step, and compiles it to executable artefacts for third-party runtimes.
What runs it in production is **your** runtime.

[![CI](https://github.com/TheAlphaEngineerCode/alpha-graph-code/actions/workflows/ci.yml/badge.svg)](https://github.com/TheAlphaEngineerCode/alpha-graph-code/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![DCO](https://img.shields.io/badge/contributions-DCO-lightgrey.svg)](./CONTRIBUTING.md)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](./tsconfig.base.json)
[![Phase](https://img.shields.io/badge/phase-1%20%C2%B7%20AGX--Expr-orange.svg)](./docs/IMPLEMENTATION_PLAN.md)

</div>

---

## Current state — read this before cloning

**This repository is at phase 1 of 9.** The complete normative specification exists, along with
the tooling and CI — and **one implemented package**: [`packages/expr`](./packages/expr), the
AGX-Expr condition language, with 278 tests.

The other 11 packages are empty modules. **The `agx` CLI arrives in phase 4**, and that is when
the product becomes demonstrable. If you want something that runs today, come back at that
phase; the [implementation plan](./docs/IMPLEMENTATION_PLAN.md) says what exists in each one.

The order is deliberate. The decision that matters most here is the **semantics of the IR**, and
right now it is reviewable by reading, while changing it costs nothing. After four thousand
lines of core, it is not.

---

## The problem

There is no shortage of visual tools for AI workflows: Langflow, Flowise, Dify, n8n, Rivet,
LangGraph Studio. They all solve "drag nodes and run" well.

They all store the graph in an **internal format whose only consumer is themselves**. You draw,
you run, and the artefact left behind is only worth anything inside that tool. Switching
frameworks means redrawing.

The inversion here is this: **the graph is the deliverable, and the tool is the compiler.**

## What that changes in practice

|                        | Visual tools                        | Alpha Graph Code                                      |
| ---------------------- | ----------------------------------- | ----------------------------------------------------- |
| What the graph is      | Configuration for their runtime     | A portable, versionable artefact                      |
| Where production runs  | In the tool's cloud                 | On the runtime **you** chose                          |
| Execution semantics    | Live in the runtime's code          | Written in a normative spec, before the code          |
| Target incompatibility | A silent default                    | `native` / `lowered` / `unsupported`, always declared |
| Branch conditions      | JS-style strings run through `eval` | AGX-Expr: total, sandboxed, type-checked              |

## The four decisions that hold this up

These are not features. They are the four things that, left undecided, turn portability into
marketing — because the real semantics move into the runtime's code.

**1. State is a channel with a declared reducer.** Two nodes writing the same key in parallel:
who wins? The answer cannot be "whichever network call finished first", because that is an
intermittent, irreproducible bug. Each channel declares `replace`, `append`, `merge`, `max`,
`min`, `sum` or `custom`. A channel written by concurrent branches **must** declare a commutative
and associative reducer — `replace` under fan-in is a validation error, not a surprise in
production.

**2. Routing is first-match, and fan-out is explicit.** Edges are ordered; the first true branch
wins; `otherwise` is mandatory. Following several paths at once requires a `parallel` node.
Without that rule, two edges with overlapping conditions mean different things on different
runtimes — and the same file produces different results.

**3. A condition is not JavaScript.** A graph file is designed to travel through pull requests.
Evaluating `state.confidence < 0.8` with `eval` turns the format into an arbitrary-execution
vector. AGX-Expr is a language of its own: total, no host access, no I/O, fuel-limited,
interpreted by our own code. The side benefit shows up daily —
`state.confidenc < 0.8` **fails when you save**, with the correct name suggested, instead of
becoming `undefined < 0.8 === false` and a silently wrong branch.

**4. Failure is the common path, not the exception.** In a graph where most nodes call a network
or a model, errors happen. Every node has an implicit error port, edges declare `on_error`, and
the precedence is normative: node retry → `on_error` edge → subgraph guard → global policy.

The full specification lives in **[`specs/ir-v1.md`](./specs/ir-v1.md)**, and it is
**normative**: if the code diverges from the spec, the code is wrong.

## What this project is not

Non-goals are decisions, not gaps waiting to be filled:

- **Not a hosted runtime.** Simulation exists to inspect, not to serve traffic.
- **Not an integrations marketplace.** Tools come in through the user's own tool-calling
  interface.
- **Not general-purpose automation.** No webhooks, cron, spreadsheets or email in the core.
- **Not a SaaS.** Accounts, billing and collaboration stay off the critical path. `git clone`
  and an optional API key are enough.
- **No promise of perfect portability.** Targets have different capabilities. The product makes
  the differences **explicit** instead of hiding them.

## Who this is for

The first user is not someone assembling a chatbot by dragging boxes — that audience is already
well served. It is **the engineer who already writes agentic workflows in code** and struggles
with review, versioning and migration between frameworks. That user accepts a CLI, reads a spec
and contributes an exporter — and is exactly who validates the thesis behind the IR.

The canvas widens the audience later. It is not what wins the first user.

## Getting started

```bash
git clone https://github.com/TheAlphaEngineerCode/alpha-graph-code.git
cd alpha-graph-code

npm i -g pnpm     # if needed; requires Node >= 22.13
pnpm install
pnpm check        # lint + format + typecheck + test + build
```

`pnpm check` is exactly what CI runs.

From **phase 4** onwards:

```bash
pnpm agx validate templates/planner-executor-verifier.yaml
pnpm agx simulate templates/planner-executor-verifier.yaml --cassette happy
pnpm agx compile  templates/planner-executor-verifier.yaml --target langgraph
```

Diagnostics are available in **English, Brazilian Portuguese and Spanish** — the locale is a
choice made by the caller, and it never changes the diagnostic code or the trace
([ADR-0006](./docs/decisions/ADR-0006-diagnostics-i18n.md)).

## How the repository is organised

```text
packages/expr        AGX-Expr: lexer, parser, typechecker, interpreter
packages/graph-core  IR, schema, parser, validator, normalisation, migrations
packages/runtime     executor, reducers, checkpoints, cassettes, trace
packages/compiler    pipeline, capability model, diagnostics
packages/exporters/  json · yaml · prompt · langgraph
packages/cli         agx
apps/web             Studio (from v0.2)

specs/               ir-v1 · agx-expr · trace-v1 · lowerings   ← NORMATIVE
docs/decisions/      ADRs
evals/               prompt-to-graph harness
cassettes/           record/replay recordings
```

| Document                                                       | What it is for                                |
| -------------------------------------------------------------- | --------------------------------------------- |
| [`specs/ir-v1.md`](./specs/ir-v1.md)                           | The IR. The project's source of truth         |
| [`specs/agx-expr.md`](./specs/agx-expr.md)                     | The condition language                        |
| [`specs/trace-v1.md`](./specs/trace-v1.md)                     | Trace, cassettes and record/replay            |
| [`specs/lowerings.md`](./specs/lowerings.md)                   | Capability model and transformation catalogue |
| [`AGENTS.md`](./AGENTS.md)                                     | The 12 invariants. Violating one is a bug     |
| [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) | Phases, exit criteria, risks                  |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md)                         | Quality gate and DCO                          |
| [`SECURITY.md`](./SECURITY.md)                                 | Threat model and how to report                |

## Determinism, and why it is testable

> Same input + same cassette ⇒ **the same trace, byte for byte.**

That is not an aspiration: it is the assertion used in the integration tests. The execution
frontier follows declaration order — never the order in which I/O completed. The RNG is seeded
by `run_id`. The clock is injected, and `now()` in AGX-Expr reads the run's clock, never the
host's.

The expensive bug in an AI workflow is almost never "it didn't run". It is "it ran differently".

## Contributing

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md). The short version: sign off your commits
(`git commit -s`), keep `pnpm check` green, and any change to IR semantics goes through an ADR
**before** the code.

## License

[Apache-2.0](./LICENSE), with contributions under the DCO. The decision and the alternatives
that were rejected are recorded in
[ADR-0001](./docs/decisions/ADR-0001-licenca-apache-2.0-e-dco.md).
