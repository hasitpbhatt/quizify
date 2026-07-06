# AGENTS.md — Cheat sheet for AI agents working on Quizify

Reading this file first should save you from re-exploring the codebase every
session. It captures what Quizify is, how it's wired, and the gotchas that bit
us before.

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
  - `src/shared/stores/settingsStore.ts` — `apiKey` / `jinaToken` / `persona` / `theme`, mirrored to `localStorage` under `quizify:*` keys.
  - `src/shared/stores/sessionStore.ts` — sessions list + `currentId`, backed by IndexedDB.
- **Persistence**: IndexedDB via `idb`. DB name `quizify`, version 2, stores `source_cache` (keyPath `url`) and `sessions` (keyPath `id`). Entry point `src/lib/db/db.ts`.
- **Canvas**: `@xyflow/react` (React Flow v12). Nodes in `src/features/canvas/nodes/`, edges in `src/features/canvas/edges/`, layout in `src/features/canvas/layout/autoGridLayout.ts`.
- **LLM**: Mistral only. `src/lib/llm/chat.ts` posts to `https://api.mistral.ai/v1/chat/completions`. Default model `mistral-medium-latest`, grading model `mistral-small-latest`. Retries once on 429/5xx, 60s timeout, supports `responseFormat: 'json'` and `AbortSignal`. Note: the SDK is Mistral-specific, not a generic OpenAI client, despite how the Welcome modal labels the key.
- **Tests**: Vitest + jsdom + @testing-library. `tests/setup.ts` is the setup file. Only `src/lib/truncate.test.ts` and `src/shared/useMediaQuery.test.ts` exist today — coverage is thin.

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
runPipeline(title, concepts, ...)  → src/lib/pipeline.ts            (stages: 'detail' → 'quiz' → 'summary' → 'build' → 'done')
  - detail  : chat() + parseDetailExpansion
  - quiz    : chat() + parseQuizResponse
  - summary : chat() + parseSummaryResponse  (failure is non-fatal — summary node is just skipped)
  - build   : autoGridLayout + updateCurrent({ nodes, edges })
await select(session.id)           # re-pin in case of concurrent store updates
setPage('canvas')
```

The `catch` block sends ANY non-abort error back to `'welcome'` and stores the message in `error`. So "blank canvas → back to welcome" almost always means something threw during the pipeline or canvas mount. Check the browser console first.

## Key data types (`src/shared/types.ts`)

- `Session` — top-level persisted object: `{ id, name, url, hostname, persona, createdAt, updatedAt, nodes: CanvasNode[], edges: CanvasEdge[], scores }`.
- `CanvasNode` — `{ id, type, position, data: NodeData, draggable?, selected? }`.
- `NodeData` is a discriminated union on `kind`: `ConceptData | QuizData | NoteData | SummaryData`.
- `QuizData.format` ∈ `multipleChoice | trueFalse | shortAnswer | freeText | fillBlank | ordering`. Renderers live in `src/features/quiz/formats/`.
- `Persona` ∈ `curious | student | professional | expert`.

## Source fetching (`src/lib/fetchSourceContent.ts`)

Order: IDB cache → Jina (`https://r.jina.ai/{url}`, optional Bearer token) → public CORS proxies (allorigins / corsproxy / cors-eu) → ask Mistral for a summary of the URL. Content is truncated via `truncateByParagraphs` and cached to IDB asynchronously. In dev mode the Vite middleware at `/__proxy?url=` is tried first to avoid CORS (see `devProxyPlugin` in `vite.config.ts`).

## Quiz grading

Quiz answers are graded by sending the user's answer + the quiz's `rationale`/`correctAnswer` to Mistral `mistral-small-latest`; parsing in `src/lib/llm/gradeParser.ts`, prompt in `src/lib/prompts/grade.ts`. Attempts are appended to `QuizData.attempts`; `bestScore` and `state` (`untested | inProgress | correct | partial | incorrect | mastered`) drive the UI.

## Gotchas — read these before touching store/pipeline code

1. **State-store race (FIXED, keep it fixed).** `sessionStore.create` and `runPipeline`'s `updateCurrent` both await IndexedDB writes and then `set({ sessions })`. If they run concurrently they used to clobber each other's `sessions` array, leaving `session.nodes` empty and the canvas blank. Rules that prevent regressions:
   - In `App.tsx`, always `await createSession(...)` and `await select(session.id)` before AND after `runPipeline`. Never call `createSession` without awaiting.
   - In `sessionStore.ts`, always use the updater form `set((state) => ...)` and the `upsertSession` helper — never replace `sessions` with a snapshot captured before an awaited IDB write.
   - `updateCurrent` must read the authoritative copy from IDB (`getSession`) before merging the patch, not the in-memory `sessions` array, so concurrent updates don't lose fields.
2. **Summary failure is non-fatal.** In `pipeline.ts`, the summary step's `try/catch` swallows errors and sets `summaryData = null`. The canvas just won't have a `__summary__` node. Don't "fix" this by re-throwing unless you intend to fail the whole generate flow when the summary API hiccups.
3. **`CanvasPage` empty state.** `if (!session || nodes.length === 0)` shows a "No canvas data yet" panel. If you see this in production it's almost always the store race above or `updateCurrent` not having run — check the store, not the canvas component.
4. **MobileFocusView hijacks the canvas** on small screens (`useIsMobile()`). When debugging "canvas is broken", first check viewport width or you'll be looking at a different component entirely (`src/features/canvas/MobileFocusView.tsx`).
5. **Hardcoded Mistral.** The Welcome modal calls the key "API key" but it must be a Mistral key — the chat layer hits `api.mistral.ai` directly with `Authorization: Bearer ...`. No proxy in production.
6. **`__APP_VERSION__`** is injected via `vite.config.ts` `define` from `process.env.npm_package_version`. Don't grep for where it's set in TS.
7. **`tsconfig.json` has `"types": ["vite/client", "vitest/globals", "node"]`** but the only wall between app code and test code is convention — there are no separate test tsconfigs.
8. **Build warning is safe to ignore:** `settingsStore.ts is dynamically imported by QuizInteraction.tsx but also statically imported by App.tsx...` — it's a Vite chunking hint, not a bug. Whichever way you resolve it (pick one import style), do it deliberately.

## Where things live (quick map)

```
src/
  app/                 App.tsx (orchestrator), ProgressScreen, theme, useToast
  features/
    canvas/            CanvasPage + nodes/ + edges/ + layout/
    quiz/              QuizInteraction, SummaryQuizInteraction, formats/
    toolbar/           Toolbar
    welcome/           WelcomeModal, PersonaCard, useWelcomeState
  lib/
    db/                db.ts (IDB), sessionsDb.ts, sourceCache.ts
    llm/               chat.ts, errors.ts, *Parser.ts
    prompts/           outline.ts, detail.ts, quiz.ts, summary.ts, grade.ts
    pipeline.ts        the multi-step generate pipeline
    fetchSourceContent.ts
  shared/
    stores/            sessionStore.ts, settingsStore.ts
    types.ts           all the shared domain types
    useMediaQuery.ts
  styles/              global.css, reset.css, tokens.css
  main.tsx             React root
```

## Change history (so we don't re-solve the same bug)

- **2026-07-05** — Fixed "blank canvas then back to welcome" race. Root cause: `App.handleGenerate` called `createSession(...)` without `await`, then `await runPipeline(...)` whose final `updateCurrent` wrote nodes/edges. The two async IDB→Zustand updates raced and the loser clobbered `sessions`, leaving `session.nodes` empty. Fix: await `createSession` + `select` before/after the pipeline, and rewrite `sessionStore` to use `set((state) => ...)` updater form, a shared `upsertSession` helper, and IDB-fresh reads inside `updateCurrent`. See `src/app/App.tsx` and `src/shared/stores/sessionStore.ts`.
