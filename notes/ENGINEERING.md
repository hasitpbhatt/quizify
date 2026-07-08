# Engineering Log

## 2026-07-07 — Parallel Concept Content Generation

**Context**: Per-concept LLM calls were sequential with a 2s sleep between each.
For 5 concepts at ~15s/call, wall-clock was ~75s plus sleep overhead.

**Decision**: Replace the sequential `for` loop with a bounded-concurrency pool
(default `Infinity` = `Promise.all`). Concept shells are pushed upfront so the
user sees placeholder nodes immediately, then all LLM calls fire in parallel.

**Tradeoffs**:
- **+** ~4–5× wall-clock improvement (~15s instead of ~75s for 5 concepts)
- **−** Concepts populate out of index order (mitigated: positional layout
  assigns each node to its correct X column at creation time, so the visual
  order is always correct regardless of completion order)
- **−** Concurrent IDB writes through `updateCurrent` create a race condition
  (solved: `createMutex()` serializes the IDB read→write cycle so parallel
  workers don't clobber each other's updates)
- **−** Rate-limit risk on free-tier APIs (solved: `CONCURRENCY` const at top
  of `pipeline.ts`; lower to 2 or 3 if RPM limits bite)
- **−** No incremental per-concept persist — well, actually the mutex allows
  incremental persist, but each persist writes the entire node/edge set each
  time, so it's slightly wasteful vs. incremental diffs

**Cost model** (for future perf tuning):
- Source fetch / outline: unchanged (sequential by nature)
- Per-concept content: ~450 tokens input, ~600 tokens output per concept
- Summary: ~3.5K input, ~500 output
- `CONCURRENCY = Infinity` means all concepts fire simultaneously. If the
  provider enforces per-minute token limits, lower this.

**Design alternatives considered**:
1. *Batch persist* — run all LLMs in parallel, build nodes/edges, persist once.
   Rejected because it loses incremental visual feedback (user would stare at
   shells until the slowest concept finishes).
2. *Incremental merge in updateCurrent* — make the store merge nodes/edges
   individually instead of replacing. Rejected as over-engineering for now;
   the mutex is simpler and correct.
3. *Per-quiz API calls* — generates quizzes independently from content.
   Deferred to a future phase (would enable independent quiz regeneration).

**Future work**:
- If free-tier RPM limits cause 429s, reduce `CONCURRENCY` to 2–3
- Decouple quiz generation from content so users can regenerate quizzes
  without re-fetching concept content
- Add per-concept progress tracking in the UI (which concepts are done/loading)
