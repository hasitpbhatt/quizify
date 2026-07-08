# Engineering Log

## 2026-07-07 — Parallel Concept Content Generation (then reverted to sequential)

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

## 2026-07-07 — Sequential pipeline (CONCURRENCY = 1)

**Context**: Parallel concept generation (CONCURRENCY = Infinity) caused reliability
issues — free-tier RPM limits hit 429s, and concurrent IDB writes added complexity.

**Decision**: Drop CONCURRENCY to 1 (sequential). Keep the shell-first flow (Phase 0
pushes placeholder nodes before any LLM call) and the mutex (redundant at concurrency
1 but preserved for correctness if future changes re-enable parallelism).

**Tradeoffs**:
- **+** No rate-limit problems — one concept LLM call at a time
- **+** IDB races are impossible without parallelism (mutex is safety net)
- **−** Wall-clock regressed from ~15s to ~75s for 5 concepts
- **−** Mutex is dead code at concurrency 1 (maintenance cost)

## 2026-07-07 — Shimmer + entrance animations + live progress counter

**Context**: Users saw static placeholder nodes during generation with no indication
of progress or that content was arriving.

**Decision**: Three additions:
1. **Shimmer** — CSS `linear-gradient` sweep on nodes whose `content === 'Loading...'`
2. **Entrance** — `fadeIn + translateY` (350ms) triggered when content transitions
   from `'Loading...'` to real data (`.entered` class in `ConceptNode.tsx`)
3. **Live progress** — `completedCount` in `pipeline.ts`, incremented after each
   successful `persist()`, displayed via `progressBadge` on the canvas page

**Tradeoffs**:
- **+** Clear visual feedback: loading → shimmer → content appears with animation
- **+** User knows exactly how many concepts are done (e.g. "3/5 done…")
- **−** Shimmer adds CSS complexity (pseudo-element with animation keyframes)
- **−** Entrance animation creates a brief layout shift if the content height
  differs from the placeholder height

## 2026-07-07 — Grid overflow fix (PersonaCard)

**Context**: The persona cards in the Welcome modal overflowed the modal boundary,
pushing the "Expert" button past the edge.

**Decision**: Widen modal from `min(600px, 100%)` to `min(640px, 100%)` and remove
`min-width: 132px` from `.card`.

**Tradeoffs**: Minimal — just a layout tuning. All four cards now fit in one row
at common viewport widths.

## 2026-07-07 — PNG export swapped html-to-image → html2canvas

**Context**: `html-to-image` renders via SVG `<foreignObject>` which doesn't support
`backdrop-filter` (glass blur on nodes). Exports came out wrong (missing blur).

**Decision**: Replace `html-to-image` with `html2canvas`, which renders via canvas
directly and handles CSS filters properly.

**Tradeoffs**:
- **+** Correctly captures `backdrop-filter`, `-webkit-backdrop-filter`, and other
  modern CSS that SVG foreignObject doesn't support
- **+** Simpler API (`html2canvas(el)` → canvas → blob)
- **−** `html2canvas` is a heavier library (5 packages vs 1)
- **−** Output quality can vary — CSS transforms and certain blend modes may not
  render identically to the live view
- **−** Lost the React Flow `fitView → export → restore viewport` pattern from
  the old export; restored it in the rewrite

## 2026-07-07 — 2x node widths (then 1.5× of pre-doubling)

**Context**: Nodes were too narrow (concept 260px, quiz 240px, summary 300px).
Content was cramped, especially quiz options and longer explanations.

**Decision**: Double all node CSS widths (concept 260→520, quiz 240→480,
summary 300→600, note 240→480) and pipeline constants (COL_WIDTH 300→600,
chars-per-line doubled). Update notebook.css `max-width` from 520px to
1040px to keep both modes in sync (formalized as gotcha #0 in AGENTS.md).

**Later the same day**: 2× felt too wide. Scaled back to 1.5× of pre-doubling
(equal to 75% of the doubled values): concept 390px, quiz 360px,
summary 450px, note 360px; COL_WIDTH 450; chars-per-line: quiz 36,
concept 40; notebook max-width 780px.

**Tradeoffs** (of the final 1.5× value):
- **+** Content has room to breathe — no clipping on quiz options or explanations
- **+** Not as oversized as 2× — less horizontal scrolling on smaller viewports
- **+** Dual-width gotcha documented so future width changes don't break notebook mode
- **−** Canvas still requires more horizontal space than original 1× sizes

## 2026-07-07 — Snake game on progress screen

**Context**: Pipeline takes ~75s at CONCURRENCY=1. Users stare at a progress
bar with nothing to do while waiting.

**Decision**: Embed a playable Snake game on the progress screen using a
canvas element.

**Tradeoffs**:
- **+** Gives users something fun to do during the wait
- **−** Only visible while pipeline is running (ephemeral entertainment)
- **−** Canvas game code in a React app adds a different programming paradigm

## 2026-07-07 — Export session as JSON/Markdown

**Context**: Users wanted to save or share their concept canvases outside
the app. PNG alone wasn't enough for text-heavy content.

**Decision**: Add a dropdown button in the canvas toolbar with three export
options: PNG (image), JSON (full session data), Markdown (formatted text).

**Tradeoffs**:
- **+** Covers three common use cases: visual snapshot, machine-readable data,
  and human-readable text
- **−** Three export paths to maintain instead of one
- **−** Markdown export needs to mirror node structure semantically

## 2026-07-06 — Parallel CORS proxies

**Context**: Source fetching depended on Jina API, which is rate-limited
and requires a token. When Jina fails, fallback to individual CORS proxies
was slow (tried one at a time).

**Decision**: Fire all 6 CORS proxies (allorigins, corsproxy, corseu,
codetabs, cors.lol, corsfix) concurrently via `Promise.allSettled`. Add
a Cloudflare Pages Functions fetch proxy at `/api/fetch` as an additional
fallback before resorting to LLM knowledge.

**Tradeoffs**:
- **+** Much faster fallback chain — all proxies tried in parallel
- **+** CF proxy works in production (server-side fetch, no CORS)
- **−** 6 concurrent requests per source fetch (bandwidth waste if Jina succeeds)
- **−** CF proxy adds a deployment dependency (Pages Functions)

## 2026-07-06 — OpenCode AI fallback for default provider

**Context**: The default (Quizify-managed) provider proxied exclusively
through the Cloudflare Pages Function to Mistral, which had higher latency
and occasional downtime.

**Decision**: Default provider now tries OpenCode API (`deepseek-v4-flash-free`)
first with 5s→10s→20s exponential backoff, then falls back to `/api/chat`
(Mistral proxy) with the same retry chain. Both the Cloudflare function and
Vite dev proxy mirror this fallback logic.

**Tradeoffs**:
- **+** Faster responses when OpenCode is available (faster model)
- **+** Two independent fallback chains (OpenCode → Mistral, plus Mistral → OpenCode
  on the proxy side)
- **−** Two API dependencies instead of one for the default provider
- **−** Exponential backoff adds up to 35s before final failure

## 2026-07-06 — Retry content parsing on ParseError

**Context**: LLM occasionally returns malformed JSON during concept content
generation. The first parse failure causes the entire concept to fail.

**Decision**: On `ParseError`, retry the LLM call once with a stronger
prompt that includes the previous failing response and explicit JSON
formatting instructions.

**Tradeoffs**:
- **+** Self-healing — most parse errors recover on retry
- **+** No user-facing error for transient LLM formatting issues
- **−** Doubles wall-clock for a concept if the first response fails
- **−** Retry prompt is a heuristic — may not fix all malformations

## 2026-07-06 — Mobile tab resume (sessionStorage persist)

**Context**: On mobile, browser tabs frequently get evicted from memory.
When the user returns, the canvas page is gone and they're back at welcome.

**Decision**: Persist `page` and `currentId` to `sessionStorage` so the
canvas survives tab reload. Add `visibilitychange` handler to re-hydrate
sessions when the tab becomes visible (handles stale IDB connections).
Add `try/catch` to `sessionStore.load()` so IDB failures don't silently
wipe the sessions array.

**Tradeoffs**:
- **+** Mobile tab resume works reliably — canvas comes back on reload
- **+** Defensive IDB error handling prevents data loss
- **−** sessionStorage is tab-scoped (expected, matches user intent)

## 2026-07-06 — Abort signal fix in chat.ts

**Context**: The abort signal from pipeline cancellation wasn't propagating through
`chat()` to `tryEndpoint()`. The caller passed `userSignal` but `tryEndpoint`
looked for `signal`, so the AbortSignal was always `undefined`.

**Decision**: Change `tryEndpoint`'s third parameter type from
`{ signal?: AbortSignal }` to `{ userSignal?: AbortSignal }` and destructure as
`userSignal`.

**Tradeoffs**:
- **+** Abort now works end-to-end: cancelling the pipeline cancels in-flight LLM calls
- **−** Tricky to test without a real AbortController integration test

## 2026-07-05 — State-store race fix (blank canvas bug)

**Context**: `App.handleGenerate` called `createSession` without `await`, then
called `runPipeline`. Both `createSession` and `runPipeline`'s `updateCurrent`
wrote to IndexedDB and then replaced the Zustand `sessions` array concurrently,
causing a race where the winner's writes were clobbered by the loser. Result:
session existed but `nodes` was empty → blank canvas → back to welcome.

**Decision**: Three fixes:
1. `await createSession(session)` and `await select(session.id)` before the pipeline
2. `sessionStore.ts` uses updater form `set((state) => ...)` and a shared
   `upsertSession` helper — never replaces `sessions` with a snapshot captured
   before an IDB write
3. `updateCurrent` reads the authoritative copy from IDB before merging, not the
   in-memory `sessions` array

**Tradeoffs**:
- **+** Race is eliminated — concurrent writes no longer clobber each other
- **+** Pattern is documented in AGENTS.md for future maintainers
- **−** IDB reads inside `updateCurrent` add latency per persist call
  (mitigated: at CONCURRENCY=1 this is a single sequential read)
- **−** The `upsertSession` helper must be used everywhere — re-introducing
  direct `sessions` replacement would regress

## 2026-07-05 — JSON parsing robustness (extractBalanced)

**Context**: Five LLM parsers used greedy regex to extract JSON from model
responses. When `]` or `}` appeared inside string values (e.g. in quiz
options or concept text), the regex matched the wrong bracket and parsing
failed — causing the entire concept to fail.

**Decision**: Replace all greedy regex extraction with bracket-depth
tracking (`extractBalanced` helper) in all 5 LLM parsers. Malformed quiz
items are now skipped (non-fatal) instead of thrown. Upgrade default model
from `mistral-medium-latest` to `mistral-large-latest` with automatic
fallback to medium on failure.

**Tradeoffs**:
- **+** Parsing now handles `]` and `}` inside string values correctly
- **+** One malformed quiz item no longer kills the entire concept
- **+** Self-healing: mistral-large → mistral-medium fallback
- **−** `extractBalanced` is more complex than regex (maintenance cost)
- **−** Skipping malformed items silently can hide prompt issues

## 2026-07-05 — Consolidated detail+quiz into single content parser

**Context**: Each concept required two separate LLM calls: one for concept
detail generation and one for quiz generation. This doubled wall-clock and
token usage per concept.

**Decision**: Merge `detailParser.ts` and `quizParser.ts` into a single
`contentParser.ts`, combining `detail.ts` and `quiz.ts` prompts into one
`content.ts` prompt. Pipeline now makes one LLM call per concept instead
of two.

**Tradeoffs**:
- **+** Halves per-concept LLM calls (1 instead of 2)
- **+** Simpler pipeline — one parser, one prompt per concept
- **−** Single prompt is longer and more complex (detail + quiz instructions)
- **−** Cannot regenerate quizzes independently without re-fetching concept content
  (noted as future work)

## 2026-07-05 — NVIDIA free API support (multi-provider architecture)

**Context**: The app was hardcoded to Mistral. Users who wanted a free
option couldn't use NVIDIA's free-tier API.

**Decision**: Introduce `LlmProvider` type in `providers.ts` with per-provider
config (base URL, models, labels, `requiresApiKey`, signup URL). Settings
store gains a `provider` field. `chat.ts` constructs endpoint/model/headers
dynamically from the selected provider. Welcome modal shows provider
selector buttons and dynamic API key copy/signup links. All callers pass
`provider` through to `chat()`.

**Tradeoffs**:
- **+** Users can choose between Mistral and NVIDIA (and later, Default)
- **+** Clean abstraction — adding a new provider is a config entry
- **−** Each provider has different rate limits, models, and failure modes
- **−** Settings store now has `provider` — one more thing to persist

## 2026-07-05 — Default (Quizify-managed) LLM provider

**Context**: Requiring users to bring their own API key is a friction point.
Many users want to try the app without signing up for Mistral or NVIDIA.

**Decision**: Add a third `'default'` provider with `requiresApiKey: false`.
A Cloudflare Pages Function at `functions/api/chat.ts` proxies requests to
Mistral using a server-side `MISTRAL_API_KEY`. Vite dev proxy mirrors this.
Hides the API key field in the Welcome modal for this provider. Updated all
guard clauses to check `requiresApiKey` before requiring a non-empty key.

**Tradeoffs**:
- **+** Zero-friction onboarding — no API key needed
- **+** Server-side key is not exposed to the client
- **−** Requires Cloudflare Pages deployment with env var
- **−** All default-provider traffic routes through the proxy (latency + cost)
- **−** Rate limits are shared across all users

## 2026-07-05 — Layout evolution (grid → horizontal → column-pair → fixed positions)

**Context**: The canvas layout went through four iterations as node overlap
and visual clarity issues were discovered.

**Decision chain**:
1. **autoGridLayout** — column-first grid; removed when Handle positions
   changed from Top/Bottom to Left/Right (commit 6059fd4)
2. **useJourneyLayout** — horizontal chain with reactive hook; removed when it
   raced with pipeline writes, causing all nodes at `{0,0}` (commit 7a1f38c)
3. **Fixed positions at creation** — pipeline assigns `position.x` from a
   running cursor using fixed widths matching CSS, no layout hook needed
   (commit 7a1f38c)
4. **Column-pair layout** — concept node left column, quiz nodes stacked right;
   edges fan from concept to each quiz instead of quiz-to-quiz chaining
   (commit 2dff0ef); later reverted to linear chain for simplicity

**Tradeoffs** (of the final approach):
- **+** No layout hook = no racing with pipeline writes
- **+** Positions are deterministic and immediate — no React re-render dance
- **+** Fixed `ESTIMATED_WIDTH` constants in pipeline match CSS widths exactly
- **−** Hardcoded widths mean any CSS width change requires updating pipeline constants
- **−** No responsive layout — nodes don't reflow on resize

## 2026-07-05 — Subject support (URL or plain text input)

**Context**: Welcome input was `type=url` and validated URLs only. Users
wanted to explore topics (e.g. "quantum computing") without a source URL.

**Decision**: Add `isLikelyUrl` helper to detect URL vs plain subject.
URL path: existing cache → Jina → proxies → LLM chain. Subject path: skip
fetching, go straight to LLM with an educational overview prompt. Input
changed to `type=text` with updated placeholder and hero copy.

**Tradeoffs**:
- **+** Opens the app to non-URL content — any topic is fair game
- **+** LLM generates the source material instead of fetching it
- **−** Subject quality depends entirely on the LLM's training data
- **−** No source URL means no citation for generated content

## 2026-07-05 — Quiz state regression fix (preserve grade data)

**Context**: Pipeline's `updateCurrent` overwrote the entire session, which
included quiz `attempts`, `bestScore`, and `state` fields. Any quiz grading
done before the next persist would be lost.

**Decision**: `updateCurrent` merges the patch into the existing session
(rather than replacing) and reads the authoritative copy from IDB before
merging. Quiz grade data is now preserved across pipeline persists.

**Tradeoffs**:
- **+** Grade data survives pipeline writes
- **+** Merge approach works with concurrent quiz grading during generation
- **−** Merge logic adds complexity to `updateCurrent`
