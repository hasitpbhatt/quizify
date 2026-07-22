# AGENTS.md — Cheat sheet for AI agents working on Quizify

Reading this file first should save you from re-exploring the codebase every
session. It captures what Quizify is, how it's wired, and the gotchas that bit
us before. See `docs/architecture.md` for the Mermaid diagram of the full user
journey and data flow.

## What this app is

Quizify turns a URL into an interactive "concept canvas": you paste a link,
it fetches the article, calls an LLM to build an outline, expands each concept,
writes quiz questions, and lays everything out as a draggable node graph
(@xyflow/react) with concept / quiz / summary / note nodes connected by
wiggly hand-drawn edges (roughjs). Sessions persist to IndexedDB so they
survive reloads.

## Stack

- **Runtime**: Vite 5 + React 18 + TypeScript 5.6, `"type": "module"`.
- **State**: Zustand. Two stores:
  - `src/shared/stores/settingsStore.ts` — `persona` / `theme`, mirrored to `localStorage` under `quizify:*` keys.
  - `src/shared/stores/sessionStore.ts` — sessions list + `currentId`, backed by IndexedDB.
- **Persistence**: IndexedDB via `idb`. DB name `quizify`, version 2, stores `source_cache` (keyPath `url`) and `sessions` (keyPath `id`). Entry point `src/lib/db/db.ts`.
- **Canvas**: `@xyflow/react` (React Flow v12). Nodes in `src/features/canvas/nodes/`, edges in `src/features/canvas/edges/`. No separate layout module — positions are assigned inline in `pipeline.ts` using fixed estimated widths.
- **LLM**: Three providers — Quizify Default (server-proxied, no key needed, experimental), Mistral, and NVIDIA. `src/lib/llm/providers.ts` defines per-provider config (base URL, models, labels, `requiresApiKey` flag). `src/lib/llm/chat.ts` is provider-agnostic: dynamic `baseUrl`/`model`, skips `Authorization` header when `requiresApiKey` is false, retry with fallback model, 3 retries on 429/5xx with exponential backoff, 60s timeout, supports `responseFormat: 'json'` and `AbortSignal`. The Welcome modal calls the key "API key" generically — it must match the selected provider (Mistral or NVIDIA); the Default provider hides the key field entirely.
- **Tests**: Vitest + jsdom + @testing-library. `tests/setup.ts` is the setup file. Tests live under `tests/` mirroring `src/` structure. Two co-located test files remain (`src/lib/truncate.test.ts`, `src/shared/useMediaQuery.test.ts`). 41 test files, 492 tests.

## Scripts

```bash
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # tsc -b && vite build  → dist/
npm run preview    # serve the built dist
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm run format     # prettier --write "src/**/*.{ts,tsx,css}"
npm test           # vitest run
```

**Pre-PR checklist (run all three after final amend before push):**
```bash
npm run build      # typecheck + vite build — catches TS errors including unused imports in test files
npm run lint       # no lint errors
npm test           # all tests pass
```

## Path aliases

`@/*` → `./src/*` (configured in `tsconfig.json` paths and `vite.config.ts` resolve.alias). Import via `@/shared/...`, `@/lib/...`, `@/features/...`, `@/app/...`.

## App flow (the important part)

`src/app/App.tsx` is the orchestrator. It switches between three pages via a `page` state:

1. **welcome** → `<WelcomeModal onGenerate={handleGenerate} />`
2. **progress** → `<Toolbar /> + <ProgressScreen />`
3. **canvas** → `<Toolbar /> + <ReactFlowProvider><CanvasPage /></ReactFlowProvider>`

`handleGenerate(url)` runs the pipeline:

```
fetchSourceContent(url)            → src/lib/fetchSourceContent.ts   (stage: 'fetch')
chat() with outline prompt         → src/lib/prompts/outline.ts      (stage: 'outline')
  parseOutline()                  → src/lib/llm/outlineParser.ts
createSession({...})               → sessionStore.create             (writes IDB + sets currentId)
await select(session.id)
setPage('canvas')                  → Transition to canvas early so we can stream nodes in real-time
runPipeline(title, concepts, ...)  → src/lib/pipeline.ts            (parallel via bounded concurrency pool)
  - Phase 0: Push all concept shells (placeholder nodes), persist once
  - Phase 1: Run all concepts through bounded pool (default Infinity = Promise.all):
      processConcept: chat() → parseContentResponse() → push quizzes/edges → persist()
      Each persist guarded by a mutex so concurrent IDB writes don't race
      Failed concepts are skipped (caught locally); abort propagates
  - Phase 2: Connect inter-concept chain edges (lastQuizOf_i → concept_{i+1})
  - Phase 3: Summary (sequential, runs once all concepts done)
await select(session.id)           # re-pin in case of concurrent store updates
```

The `catch` block sends ANY non-abort error back to `'welcome'` and stores the message in `error`. So "blank canvas → back to welcome" almost always means something threw during the pipeline or canvas mount. Check the browser console first.

## Key data types (`src/shared/types.ts`)

- `Session` — top-level persisted object: `{ id, name, url, hostname, persona, createdAt, updatedAt, nodes: CanvasNode[], edges: CanvasEdge[], scores }`.
- `CanvasNode` — `{ id, type, position, data: NodeData, draggable?, selected? }`.
- `NodeData` is a discriminated union on `kind`: `ConceptData | QuizData | NoteData | SummaryData`.
- `QuizData.format` ∈ `multipleChoice | trueFalse | shortAnswer | freeText | fillBlank | ordering`. Renderers live in `src/features/quiz/formats/`.
- `Persona` ∈ `curious | student | professional | expert`.

## Source fetching (`src/lib/fetchSourceContent.ts`)

Order: IDB cache → server-side proxy → LLM subject fallback. No external CORS proxies are used (they were removed after causing persistent CORS errors).

**Strategy (3 tiers):**
1. **IDB cache** — `source_cache` store, keyed by URL, expires after 24h.
2. **Server-side proxy** — Dev: Vite middleware at `/__proxy?url=` or `/api/fetch?url=`; Prod: Cloudflare Function at `/api/fetch?url=`. Both fetch server-to-server (no CORS) and return `Access-Control-Allow-Origin: *`.
3. **LLM subject generation** — When the proxy fails (no Cloudflare deployment, or Vite can't reach the target), `extractSubjectFromUrl()` extracts a clean subject from the URL path (e.g., `/wiki/Photosynthesis` → `"Photosynthesis"`), then `fetchSubjectFromLlm()` generates quality educational content from scratch. For non-URL topic inputs, the subject is used directly.

Content is truncated via `truncateByParagraphs` and cached to IDB asynchronously. See `docs/architecture.md` for the fetch flow diagram.

## Quiz grading

Quiz answers are graded by sending the user's answer + the quiz's `rationale`/`correctAnswer` to whichever provider is selected (Mistral or NVIDIA); parsing in `src/lib/llm/gradeParser.ts`, prompt in `src/lib/prompts/grade.ts`. Attempts are appended to `QuizData.attempts`; `bestScore` and `state` (`untested | inProgress | correct | partial | incorrect | mastered`) drive the UI.

## Gotchas — read these before touching store/pipeline code

1. **State-store race (FIXED, keep it fixed).** `sessionStore.create` and `runPipeline`'s `updateCurrent` both await IndexedDB writes and then `set({ sessions })`. If they run concurrently they used to clobber each other's `sessions` array, leaving `session.nodes` empty and the canvas blank. Rules that prevent regressions:
   - In `App.tsx`, always `await createSession(...)` and `await select(session.id)` before AND after `runPipeline`. Never call `createSession` without awaiting.
   - In `sessionStore.ts`, always use the updater form `set((state) => ...)` and the `upsertSession` helper — never replace `sessions` with a snapshot captured before an awaited IDB write.
   - `updateCurrent` must read the authoritative copy from IDB (`getSession`) before merging the patch, not the in-memory `sessions` array, so concurrent updates don't lose fields.
   - In `pipeline.ts`, concurrent `processConcept` calls each call `persist()` after pushing their nodes/edges. A mutex (`createMutex`) serializes the IDB read→write cycle so parallel workers don't clobber each other's updates.
2. **Summary failure is non-fatal.** In `pipeline.ts`, the summary step's `try/catch` swallows errors and sets `summaryData = null`. The canvas just won't have a `__summary__` node. Don't "fix" this by re-throwing unless you intend to fail the whole generate flow when the summary API hiccups.
3. **`CanvasPage` empty state.** `if (!session || nodes.length === 0)` shows a "No canvas data yet" panel. If you see this in production it's almost always the store race above or `updateCurrent` not having run — check the store, not the canvas component.
4. **MobileFocusView hijacks the canvas** on small screens (`useIsMobile()`). When debugging "canvas is broken", first check viewport width or you'll be looking at a different component entirely (`src/features/canvas/MobileFocusView.tsx`).
5. **Multi-provider API keys.** The Welcome modal calls the key "API key" generically — it must match the selected provider (Mistral or NVIDIA). The Default provider (`'default'`) has `requiresApiKey: false` and hides the key field entirely. The settings store has a `provider` field that switches the API base URL, default model, and fallback model dynamically. See `src/lib/llm/providers.ts` for per-provider config.
6. **`__APP_VERSION__`** is injected via `vite.config.ts` `define` from `process.env.npm_package_version`. Don't grep for where it's set in TS.
7. **`tsconfig.json` has `"types": ["vite/client", "vitest/globals", "node"]`** but the only wall between app code and test code is convention — there are no separate test tsconfigs.
8. **Build warning is safe to ignore:** `settingsStore.ts is dynamically imported by QuizInteraction.tsx but also statically imported by App.tsx...` — it's a Vite chunking hint, not a bug. Whichever way you resolve it (pick one import style), do it deliberately.

## Where things live (quick map)

```
src/
  app/                 App.tsx (orchestrator), ProgressScreen, theme, useToast
  features/
    canvas/            CanvasPage + MobileFocusView + nodes/ + edges/ + useTypingAnimation
    quiz/              QuizInteraction, SummaryQuizInteraction, formats/
    toolbar/           Toolbar
    welcome/           WelcomeModal, PersonaCard, useWelcomeState
  lib/
    components/        ErrorBoundary, NodeErrorFallback, CanvasErrorFallback, QuizErrorFallback
    db/                db.ts (IDB), sessionsDb.ts, sourceCache.ts
    llm/               chat.ts, errors.ts, *Parser.ts, providers.ts, tts.ts, ttsManager.ts
    prompts/           outline.ts, detail.ts, quiz.ts, summary.ts, grade.ts
    pipeline.ts        the multi-step generate pipeline
    fetchSourceContent.ts
  shared/
    stores/            sessionStore.ts, settingsStore.ts, notebookStore.ts
    types.ts           all the shared domain types
    useMediaQuery.ts
  styles/              global.css, reset.css, tokens.css, notebook.css
  main.tsx             React root
```

## Change history (so we don't re-solve the same bug)

- **2026-07-05** — Fixed "blank canvas then back to welcome" race. Root cause: `App.handleGenerate` called `createSession(...)` without `await`, then `await runPipeline(...)` whose final `updateCurrent` wrote nodes/edges. The two async IDB→Zustand updates raced and the loser clobbered `sessions`, leaving `session.nodes` empty. Fix: await `createSession` + `select` before/after the pipeline, and rewrite `sessionStore` to use `set((state) => ...)` updater form, a shared `upsertSession` helper, and IDB-fresh reads inside `updateCurrent`. See `src/app/App.tsx` and `src/shared/stores/sessionStore.ts`.
- **2026-07-07** — Eliminated 4 unnecessary `as unknown as` casts: NoteNode's `(props as unknown as {id:string})` → `props.id`, ConceptNode's `(props.data as unknown as Record<...>).skipTyping` → `props.data.skipTyping`, CanvasPage's data field cast → function-level `as Node[]`. 5 casts remain where `Record<string, unknown>` ↔ specific types structurally require the `unknown` bridge. See `src/features/canvas/nodes/` and `CanvasPage.tsx`.
- **2026-07-07** — Error boundaries at 4 layers (`ErrorBoundary` class component in `src/lib/components/`): app root, canvas container, per-node wrapper, quiz interaction. Each has a distinct fallback (CanvasErrorFallback with retry/home, NodeErrorFallback showing nodeId+type, QuizErrorFallback with close). No more white-screen crashes from a single bad node.
- **2026-07-07** — `.tsbuildinfo` files untracked and gitignored: added `*.tsbuildinfo` to `.gitignore`, `git rm --cached` the tracked files.
- **2026-06-01** — Added NVIDIA free API support alongside Mistral. Introduced `LlmProvider` type, `providers.ts` config, `provider` field in settings store, dynamic `baseUrl`/`model` in `chat.ts`, provider selector UI in Welcome modal. Fallback model retries on 429/5xx with 3 retries + exponential backoff. Source fetching fallback now uses the selected provider, not hardcoded Mistral.
- **2026-07-05** — Added third "Quizify (Default)" provider (`'default'`). A Cloudflare Pages Function at `functions/api/chat.ts` proxies to Mistral with a server-side key. The provider has `requiresApiKey: false`, hiding the API key field from the Welcome modal. Vite dev proxy at `/api/chat`. Requires `MISTRAL_API_KEY` env var.
- **2026-07-07** — Notebook View (implemented): toggleable notebook-style canvas with ruled-line background (handwriting font `Indie Flower`, red margin line), transparent nodes (no card styling), character-by-character typewriter animation via `useTypingAnimation` hook (requestAnimationFrame-based), and auto-synced TTS via `TtsManager` singleton. Camera auto-focuses on the current concept via `setCenter`. Quiz nodes reveal only after the parent concept's TTS finishes (progression gating via `revealedQuizIds` Set + `ttsManager.subscribe`). New files: `notebook.css`, `notebookStore.ts`, `ttsManager.ts`, `useTypingAnimation.ts`.
- **2026-06-02** — Replaced column-first grid with horizontal chain layout. Removed `autoGridLayout.ts`, replaced with `useJourneyLayout` hook in pipeline.ts. Changed handle positions from Top/Bottom to Left/Right on concept nodes. Pipeline creates linear chain edges (concept→quiz→next concept→...).
- **2026-06-03** — Fixed overlapping nodes: removed `useJourneyLayout` hook entirely. Pipeline now assigns positions at node creation time using fixed estimated widths (`ESTIMATED_WIDTH` constants in pipeline.ts). Nodes no longer overlap — each gets its column determined at creation time.
- **2026-07-05** — Added TTS support via Mistral Voxtral (`src/lib/llm/tts.ts`). Falls back to browser Web Speech API when Mistral TTS is unavailable or NVIDIA provider is selected.
- **2026-07-06** — Fixed abort signal not propagating through `chat()`. Root cause: `tryEndpoint`'s third parameter type declared `signal?: AbortSignal` and destructured as `const { ..., signal: userSignal, ... } = opts`, but the caller `chat()` passed a `shared` object with a `userSignal` property (not `signal`). So `userSignal` was always `undefined` inside `tryEndpoint`, meaning caller-provided `AbortSignal` was never passed to `anySignal()`. Fix: changed the type to `userSignal?: AbortSignal` and destructured directly as `userSignal`. See `src/lib/llm/chat.ts:42-50`.
- **2026-07-07** — Parallelized per-concept content generation in pipeline. Replaced sequential `for` loop with bounded-concurrency pool (`CONCURRENCY` const in `pipeline.ts`, default `Infinity`). Concept shells pushed upfront; all LLM calls fire in parallel. A mutex (`createMutex`) serializes `updateCurrent` writes to prevent IDB races. Inter-concept chain edges built after all concepts resolve. Removed 2s sleep between concepts. Failed concepts are caught and skipped (non-fatal). See `src/lib/pipeline.ts`.
- **2026-07-20** — Removed all external CORS proxies (`allorigins.win`, `corsproxy.io`, `cors.eu.org`, `codetabs.com`, `cors.lol`, `corsfix.com`) from `raceProxies`. They caused persistent `net::ERR_FAILED` CORS errors in the browser. Replaced with exclusive server-side proxy path: Vite dev middleware (`/__proxy` + `/api/fetch`) in dev, Cloudflare Function (`/api/fetch`) in prod. Both fetch server-to-server (no CORS) and return `Access-Control-Allow-Origin: *`. See `src/lib/fetchSourceContent.ts` and `functions/api/fetch.ts`.
- **2026-07-20** — Removed the "LLM URL summary" fallback in `fetchSourceContent.ts` that asked the LLM to "Summarize the content found at URL" (LLMs can't browse URLs, producing vague content that caused `parseOutline` to throw "Missing or empty 'concepts' array"). Replaced with `extractSubjectFromUrl()` which extracts a clean subject from the URL path (e.g., `/wiki/Photosynthesis` → `"Photosynthesis"`) and feeds it to `fetchSubjectFromLlm()` for quality educational content generation from scratch. See `src/lib/fetchSourceContent.ts:extractSubjectFromUrl`.
