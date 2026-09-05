# MCP evaluation suite

`mcp-evaluation.xml` measures the one thing that decides whether this MCP
server is any good: whether a model with **no other context** — no repository,
no screens, no conversation — can answer real questions using only the tools
the server advertises. A server can implement every endpoint correctly and
still fail here, because what is being tested is the tool descriptions, the
input and output shapes, and what a call actually returns.

## The answers only hold against a fixed dataset

Every date in the development seed is derived from the day the seed runs, on
purpose: a dev database anchored to hardcoded years looks abandoned three
months later. That same property would rot this suite, so the fixture is
pinned to one day.

Rebuild it before running the evaluation:

```bash
npm run db:seed -- --reset --db ./evaluations/fixture.db --today 2026-09-02
```

`--today` makes `buildSeedData` deterministic, so this command produces byte
-identical data on any machine, on any date. Point the app at that database,
issue a token in **Ajustes → MCP**, grant every slice under **Permisos**, and
connect a client through the shim.

The fixture file itself is not committed — it is a build output, and
regenerating it is one command.

## How the answers were produced

Each answer was derived by querying the fixture, not written from memory, and
each was checked to have exactly **one** match. Where a question says "exactly
one subject", that uniqueness was confirmed against the data rather than
assumed — several early drafts were discarded because two subjects tied.

## What the questions deliberately cover

- **Multi-hop reads.** Most answers need a list call, then a detail call per
  candidate, then a comparison. None can be reached with a single tool call.
- **No keyword shortcuts.** Questions name concepts, not the strings in the
  data, so a model cannot pattern-match its way to the answer.
- **Data the catalog only exposes indirectly.** Mid-terms, finals, attendance
  and prerequisites have no list tool of their own; they arrive inside
  `materias_detail`. A question about attendance therefore fails unless the
  model works out that it must go through the `materias` slice — which is also
  a fair description of the server's own permission model, since attendance
  data is readable with a `materias` read grant even though the `clases` slice
  advertises no read capability at all.
- **Several shapes of answer.** Subject names, an institution name, a grade, a
  day count, a subject count — so a model cannot settle into one output habit.

## Running it

The `mcp-builder` skill ships a runner at `scripts/evaluation.py`, which takes
this XML plus a connection description and reports how many answers a model
reaches. See that skill's `reference/evaluation.md` for its arguments.
