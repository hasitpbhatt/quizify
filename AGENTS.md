# AGENTS.md — Cheat sheet for AI agents working on Quizify

Read this first, then [`docs/roadmap.md`](docs/roadmap.md) for product direction and
[`docs/architecture.md`](docs/architecture.md) for system diagrams and fetch flow.

## What this app is

**Codename:** Quizify (public rebrand pending — see roadmap naming sprint).

Quizify is becoming a **source-grounded adaptive study coach** for university
students and self-learners. Today the shipped MVP is a **guided study notebook**:
paste a URL or topic → fetch/generate source → outline concepts → expand with
explanations + quizzes → linear notebook with optional TTS and progression gating.
Sessions persist in IndexedDB.

Do **not** describe the product as a React Flow / node-graph canvas. That model
was removed; docs that claimed otherwise have been deleted. Strategy lives only
in `docs/roadmap.md`.

## Stack

- **Runtime**: Vite 5 + React 18 + TypeScript 5.6, `"type": "module"`.
- **State**: Zustand.
  - `src/shared/stores/settingsStore.ts` — persona / theme (`quizify:*` localStorage).
  - `src/shared/stores/sessionStore.ts` — sessions + `currentId` (IndexedDB).
  - `src/shared/stores/notebookStore.ts` — notebook mode / TTS / typing progress.
- **Persistence**: IndexedDB via `idb`. DB `quizify` v2: `source_cache`, `sessions`.
- **UI**: Linear notebook in `src/features/canvas/` (+ `MobileFocusView` on small screens).
- **LLM**: Server-proxied Mistral via `/api/chat`. Config in `src/lib/llm/providers.ts`.
  `chat.ts` handles retries/backoff/timeout/`responseFormat: 'json'`/`AbortSignal`.
  Task-specific models exist in provider config; routing must stay server-owned as
  the roadmap hardens the gateway.
- **Tests**: Vitest + jsdom + Testing Library under `tests/` (plus a few co-located tests).
  Playwright e2e under `tests/e2e/` (seeded `dist/`, no live LLM).

## Scripts

```bash
npm run dev        # Vite → http://localhost:5173
npm run build      # tsc -b && vite build
npm run preview
npm run typecheck
npm run lint
npm run format
npm test           # vitest run
npm run test:e2e   # playwright
```

**Pre-PR checklist:** `npm run build && npm run lint && npm test`

## Path aliases

`@/*` → `./src/*`

## App flow

`src/app/App.tsx` switches `page`: `welcome` | `progress` | `canvas`.

```
fetchSourceContent → outline chat/parse → createSession + select
→ setPage('canvas') → runPipeline → select again
```

Catch: non-abort errors → welcome + `error` message.

## Key types (`src/shared/types.ts`)

`Session`, `CanvasNode`, `NodeData` (`concept` | `quiz` | `note` | `summary`),
quiz formats, `Persona`, `SourceProvenance`. `sourceReference` exists but is not
yet populated end-to-end — citations are a roadmap Phase 1 requirement.

## Source fetching (`src/lib/fetchSourceContent.ts`)

1. IDB cache (24h)
2. Server proxy (`/api/fetch` / Vite `/__proxy`)
3. LLM subject fallback via `extractSubjectFromUrl` / `fetchSubjectFromLlm`

No external CORS proxies. Truncate with `truncateByParagraphs`.

## Quiz grading

Objective formats grade locally where possible (`quizGrading.ts`). Open answers use
LLM grading (`gradeParser.ts`, `prompts/grade.ts`). Attempts append to quiz data;
`bestScore` / `state` drive UI. Review/mastery scheduling in `learningProgress.ts`
is incomplete relative to the roadmap (completed concepts must re-enter review).

## Gotchas — keep these fixed

1. **State-store race.** Always `await createSession` + `await select` before/after
   `runPipeline`. Use updater-form `set` and IDB-fresh `updateCurrent`. Mutex in
   `pipeline.ts` for concurrent persists.
2. **Summary failure is non-fatal.**
3. **Empty canvas** ⇒ store/pipeline issue more often than render bug.
4. **MobileFocusView** replaces desktop canvas on small screens — including recovery
   UI gaps that the roadmap calls out.
5. **`__APP_VERSION__`** comes from Vite `define` / package version.
6. **Gateway abuse risk.** `/api/chat` and `/api/fetch` need auth/quotas/SSRF limits
   before any public scale (roadmap Phase 0).
7. **TTS.** Client may call `/api/tts` but the function may be missing — fall back
   to Web Speech and do not claim server TTS until it exists.

## Where things live

```
src/
  app/          App, ProgressScreen, theme, toast
  features/
    canvas/     CanvasPage, MobileFocusView, nodes, typing animation
    quiz/       QuizInteraction, formats, grading hooks
    toolbar/    Toolbar
    welcome/    WelcomeModal, PersonaCard
  lib/
    analytics/  local event ring buffer (expand per roadmap)
    components/ Error boundaries / dialogs
    db/         IndexedDB
    llm/        chat, parsers, providers, tts
    prompts/    outline, content, summary, grade
    pipeline.ts generation orchestration
    fetchSourceContent.ts
  shared/       stores, types, learningProgress, media hooks
docs/
  roadmap.md       ← canonical product strategy
  architecture.md  ← current system wiring
```

## Change history (selected)

- **2026-07-27** — Canonical roadmap added at `docs/roadmap.md`. Removed conflicting
  product/implementation/design specs, audits, and obsolete plans. Architecture and
  this file rewritten for the notebook product (not React Flow).
- **2026-07-20** — External CORS proxies removed; server-side fetch only. URL-summary
  LLM fallback replaced with subject extraction + educational generation.
- **2026-07-07** — Parallel concept generation + persist mutex; notebook view + TTS
  gating; error boundaries.
- **2026-07-05** — Session store race fixed (`await create`/`select`, updater form,
  IDB-fresh `updateCurrent`).
