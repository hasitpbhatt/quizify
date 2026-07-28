# Quizify Architecture

> Current-system reference for AI agents and contributors.
> Product strategy lives in [`docs/roadmap.md`](./roadmap.md).

## What the product is today

Quizify is a **guided study notebook**, not a graph canvas. A learner pastes a URL or topic; the app fetches or generates source material, builds a short concept outline, expands each concept with explanations and quizzes, and presents a linear, progressive notebook experience with optional narration.

Public positioning and Year-1 sequencing are defined in the roadmap. The public brand name is expected to change; treat **Quizify** as the internal codename until the naming sprint completes.

## Stack

- **Runtime:** Vite 5 + React 18 + TypeScript (`"type": "module"`)
- **State:** Zustand (`settingsStore`, `sessionStore`, `notebookStore`, toast/latency helpers)
- **Persistence:** IndexedDB via `idb` — DB `quizify` v2, stores `source_cache` and `sessions`
- **UI:** Linear notebook / card journey in `src/features/canvas/` (desktop + `MobileFocusView`)
- **LLM:** Server-proxied Mistral via Cloudflare Pages Function `/api/chat` (`src/lib/llm/providers.ts`, `chat.ts`)
- **Fetch:** Server-side URL proxy `/api/fetch` (dev: Vite `/__proxy` + `/api/fetch`)
- **Tests:** Vitest + jsdom + Testing Library; Playwright e2e under `tests/e2e/`

## App flow

`src/app/App.tsx` orchestrates three pages:

1. **welcome** → `WelcomeModal`
2. **progress** → `Toolbar` + `ProgressScreen` (optional generated-content preview)
3. **canvas** → `Toolbar` + `CanvasPage` (notebook / mobile focus)

`handleGenerate(url)`:

```
fetchSourceContent(url)
  → outline via chat() + parseOutline()
  → createSession + select
  → setPage('canvas')
  → runPipeline(...)   // concept shells → parallel content → chain → summary
  → select(session.id) // re-pin after concurrent store updates
```

Non-abort errors return the user to welcome with a surfaced message.

## Pipeline (`src/lib/pipeline.ts`)

1. Phase 0 — push concept shells, persist once
2. Phase 1 — bounded concurrency (default 3) for content + quizzes; mutex around `persist()`
3. Phase 2 — inter-concept progression edges / ordering
4. Phase 3 — summary + final quiz (non-fatal)

Failed concepts can be skipped or retried; abort propagates.

## Fetch strategy

1. **IndexedDB cache** — `source_cache`, 24h TTL
2. **Server proxy** — `/api/fetch` (prod) / Vite proxy (dev), CORS-safe server fetch
3. **LLM subject fallback** — `extractSubjectFromUrl()` + `fetchSubjectFromLlm()` when proxy fails or input is a topic

Generated fallback content must be labeled and confirmed before continuing.

## Data model (high level)

- `Session` — id, name, url, hostname, persona, timestamps, nodes, edges, scores
- `CanvasNode` / `NodeData` — concept | quiz | note | summary
- Quiz formats — multipleChoice, trueFalse, shortAnswer, freeText, fillBlank, ordering
- Attempts live on quiz data; progression/review helpers in `progression.ts` and `learningProgress.ts`

## Store gotchas (do not regress)

1. Always `await createSession` and `await select` before and after `runPipeline`.
2. `sessionStore` uses updater-form `set((state) => ...)` and IDB-fresh reads in `updateCurrent`.
3. Pipeline concurrent writes must stay mutex-serialized.
4. Summary failure is intentionally non-fatal.
5. Empty canvas usually means a store race or missing `updateCurrent`, not a render bug.
6. Mobile uses `MobileFocusView` — debug that path on small viewports.

## Backend surfaces

| Endpoint | Role | Known gap |
|----------|------|-----------|
| `functions/api/chat.ts` | Proxies chat to Mistral with server key | Needs auth, quotas, model allowlist, body limits |
| `functions/api/fetch.ts` | Server-side URL fetch | Needs SSRF hardening, size/timeout limits |
| `/api/tts` (client call) | Intended TTS | Function missing — browser speech fallback path |

## Analytics

`src/lib/analytics/events.ts` currently stores a small local ring buffer. Roadmap Phase 0 requires full funnel, cost, quality, and retention telemetry.

## Docs map

| Doc | Purpose |
|-----|---------|
| [`docs/roadmap.md`](./roadmap.md) | Canonical strategy, metrics, sprints, gates |
| [`docs/architecture.md`](./architecture.md) | Current system wiring (this file) |
| [`AGENTS.md`](../AGENTS.md) | Short agent cheat sheet |
