# Latency Action Plan — Final (Provider-Adaptive, Call-Count-First)

## Governing constraint
Free Mistral = **5 RPM (1 call / 12s)**, 2.25M TPM. RPM is the binding
limit; **call count dominates wall-clock**. TPM is never a concern. Strategy:
minimize calls on low-RPM providers, pace ourselves to avoid 429 storms, and
only stream/split on high-RPM providers.

## Keystone: provider RPM profiles
Add to `src/lib/llm/providers.ts` a per-provider profile:
`{ rpm, allowStreamingSplit }` (static defaults).
- Mistral (free) → `rpm: 5, allowStreamingSplit: false`
- NVIDIA → higher rpm, `allowStreamingSplit: true`
- Default (`/api/chat`) → moderate rpm, streaming if proxy supports (else
  fallback)

Everything below reads this profile.

## Phase 0 — Instrumentation
- New `src/lib/perf.ts`: `performance.mark`/`measure` spans around fetch,
  outline, each `processOneConcept`, summary, total `handleGenerate`.
- **LLM call counter** per generate. Dev-flagged console output. Capture
  baseline before any other change.

## Phase 1 — Remove Jina entirely
- `fetchSourceContent.ts`: delete `fetchViaJina`/`JINA_BASE`/serial block
  (`:172-179`)/`'jina'` union (`:8`). New chain: cache → parallel proxy race
  (first 3, escalate) → LLM fallback, hard 8s fetch deadline.
- Full `jinaToken` cleanup: `settingsStore.ts`, `WelcomeModal.tsx`,
  `App.tsx`, `public/_headers:2`, and Jina tests.

## Phase 2 — Minimize call count
- Keep the single combined content call (explanation + quizzes, one
  call/concept). `allowStreamingSplit=false` on Mistral keeps it collapsed.
- Drop outline quizzes (`outline.ts:31-37`, `outlineParser.ts` relax).
- Skip summary by default on low-RPM providers. Non-blocking on others.
- Queue grading so it never runs concurrently with pipeline.
- **Target on free Mistral: outline(1) + content×N = N+1 calls.**
  N=5 → 6 calls ≈ **~60s**.

## Phase 3 — RPM governor + smart backoff
- Client-side token-bucket governor set from the provider profile.
- `chat.ts`: honor `Retry-After`; `BASE_DELAY 5000→1500` + jitter; **90s
  total deadline**; configurable `maxRetries` (pipeline passes 2).
- Per-task `max_tokens`/`temp` caps — parse-retry costs a full 12s slot,
  so **avoiding parse failures is now a latency feature**.

## Phase 4 — Pipeline hygiene + honesty
- Coalesce per-concept `persist()` writes into batched `updateCurrent`.
- Thread abort `signal` into `fetchSourceContent`.
- Speculative outline during Confirm modal.
- Fix Default provider no-op `fallbackModel`.
- Subtle one-line notice when low-RPM provider is active.

## Phase 5 — Streaming (provider-adaptive; NOT on free Mistral)
- Build `stream`/`onToken` in `ChatOptions` + `tryEndpoint`: SSE reader,
  guard `delta.content` for null, stop on `[DONE]`.
- Enable streaming-split only when `allowStreamingSplit=true`. On free
  Mistral stays single combined call. Win B (incremental JSON) deferred.

## Implementation order
0 (instrument) → 1 (remove Jina) → 3 (RPM governor + backoff — biggest
reliability win) → 2 (minimize calls, per-task caps) → 4 (hygiene + notice)
→ 5 (streaming, high-RPM only).

## Verification
`npm run typecheck` + `npm run lint` per change; `npm test` after Phases
1/2/3/5. Manual: time URL→first-node + URL→done on free Mistral (~60s,
zero 429s), then NVIDIA (streaming, faster).
