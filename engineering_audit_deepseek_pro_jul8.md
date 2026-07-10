# Engineering Audit: Quizify

**Date:** 2026-07-08
**Scope:** `src/` (~89 source files), `tests/` (40 files), config files
**Commit:** `2e839c0` (fix `ttsManager.test.ts`, `useTypingAnimation.test.ts`)
**Tests:** 463 tests, 0 failures

---

## 1. Architecture

### 1.1 Overall Design

Quizify is a single-page React app that converts a URL into an interactive node-graph canvas. The architecture follows a **feature-first** directory structure with clear separation:

```
src/
  app/            — App orchestrator, page routing, theme, progress screen
  features/       — canvas, quiz, toolbar, welcome, generation, sessions, settings
  lib/            — llm, db, prompts, tasks, export, pipeline, components, progression
  shared/         — stores (Zustand), types, useMediaQuery
  styles/         — global css, tokens, notebook.css
```

The data flow is unidirectional:

```
URL → fetchSourceContent → LLM outline → parse → createSession → pipeline (parallel concept gen) → IndexedDB ← Zustand store → React Flow canvas
```

**Strengths:**
- Feature-first organization scales well for a single-developer project
- Clear pipeline stages with typed state transitions
- Zustand stores are minimal and focused (settings, sessions, notebook)
- IndexedDB persistence via `idb` is clean and well-structured

**Concerns:**
- No DI / service abstraction — LLM provider, TTS, and DB are imported directly or via singletons (`ttsManager.ts`), making testing harder
- `App.tsx` handles too much orchestration logic (~200 lines); moving pipeline orchestration to a custom hook or controller would improve testability
- `src/features/generation/prompts/` exists but appears unused (the real prompts are in `src/lib/prompts/`)

### 1.2 State Management

Three Zustand stores:

| Store | Persistence | Key Concern |
|-------|-----------|-------------|
| `settingsStore` | localStorage (keys `quizify:*`) | Small, well-factored |
| `sessionStore` | IndexedDB via `sessionsDb.ts` | **Previously had race conditions** — fixed with updater form + mutex |
| `notebookStore` | None (ephemeral) | Tiny, acceptable transient state |

**Race condition fix (history entry 2026-07-05):** `sessionStore.create` and `runPipeline`'s `updateCurrent` both write to IndexedDB. The fix uses `set((state) => ...)` updater form + `upsertSession` helper + IDB-fresh reads in `updateCurrent`. The pipeline also uses a mutex (`createMutex`) to serialize concurrent `processConcept` writes. This is a correct fix but adds cognitive complexity — see recommendation.

### 1.3 Routing

No router library — page state is managed by a `useState('welcome' | 'progress' | 'canvas')` in `App.tsx`. This is acceptable for a single-user tool but would block future features like deep-linking to a specific session or sharing.

---

## 2. Code Quality

### 2.1 TypeScript Usage

**Strengths:**
- Strict TypeScript configuration (`tsconfig.json` has `"strict": true`)
- Discriminated unions for `NodeData` (`ConceptData | QuizData | NoteData | SummaryData`)
- Comprehensive shared types in `src/shared/types.ts`
- Good use of `type` imports and `memo` where appropriate

**Weaknesses:**
- **5 remaining `as unknown as` casts** (per AGENTS.md) — down from 9, but still present in `NoteNode.tsx`, `ConceptNode.tsx`, `QuizNode.tsx`, `SummaryNode.tsx` where `props.data as unknown as ConceptData` etc. are used. The `NodeProps` generic parameter should be used instead: `NodeProps<ConceptData>`.
- `QuizInteraction.tsx` and `SummaryQuizInteraction.tsx` use heavy inline styles instead of CSS modules — inconsistent with the rest of the codebase
- `SummaryQuizInteraction.tsx` has a `correctAnswer` comparison bug: `current.correctAnswer` is accessed but the type says `correctAnswer` is optional on `QuizData`; no null-check

```tsx
// SummaryQuizInteraction.tsx — potential runtime crash
const correct = normalizedAnswer.trim().toLowerCase() === current.correctAnswer.trim().toLowerCase();
//                                           ^^^^  TypeError if correctAnswer is undefined
```

### 2.2 CSS Architecture

**Strengths:**
- Consistent CSS Modules approach (`.module.css` per component)
- CSS custom properties in `tokens.css` — well-organized color/font/spacing design tokens
- Good use of `@keyframes` for animations

**Weaknesses:**
- **Dual-width maintenance burden** (documented in AGENTS.md): each node type has a fixed `width` in its `.module.css`, but `notebook.css:38` overrides with `width: auto; max-width: 450px`. Changing CSS widths requires updating two locations.
- `notebook.css` uses `!important` — a brittle pattern that will cause cascade issues
- Quiz interaction uses **inline styles** — no CSS modules, no tokens, hard to maintain:
  ```tsx
  style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', ... }}
  ```
- Some CSS class naming is inconsistent (some kebab-case, some camelCase within CSS modules)

### 2.3 Error Handling

**Strengths:**
- 4-layer error boundary hierarchy: app root → canvas → per-node → quiz interaction
- Distinct fallback components: `CanvasErrorFallback`, `NodeErrorFallback`, `QuizErrorFallback`
- Pipeline errors are caught and handled gracefully (summary failure is non-fatal, concept failure is caught and skipped)
- LLM `chat.ts` has retry with exponential backoff (3 retries on 429/5xx)

**Weaknesses:**
- No error boundary at the WelcomeModal level — an error during generation setup could white-screen
- `catch` blocks in `ConceptNode.tsx` and `fetchSourceContent.ts` use `console.error()` — no user-facing error feedback
- Pipeline's `catch` only handles "abort" vs "other" — error messages shown to user could be more descriptive
- TTS fallback to Web Speech API is silent on failure (no console or UI feedback)
- `updateCurrent` in sessionStore doesn't return a Promise — callers can't know when the write completes

### 2.4 Accessibility

**Recent improvements (commits `b7bf300`, `23157cf`):**
- `alertdialog` role for delete confirmation
- Focus trap in WelcomeModal and delete dialog
- `htmlFor`/`id` binding on API key and Jina token inputs
- `aria-` attributes added

**Remaining issues:**
- Node components (ConceptNode, QuizNode, SummaryNode) have no `role` attributes — they're interactive but not semantically announced
- Handle elements from React Flow (`<Handle />`) have no labels or descriptions
- Quiz formats: radio inputs (`MultipleChoice.tsx`) lack `aria-label` or accessible grouping
- The "Listen" button in ConceptNode uses an icon + text, which is good, but the `title` attribute duplicates the visible text
- No focus management when quiz modal opens — keyboard users must tab through the overlay
- Export dropdown is a custom implementation with no keyboard navigation (arrow keys, escape)
- No skip-link or keyboard navigation for the canvas area
- Color-only indicators for quiz states (green/red/yellow badges) — no text alternatives for colorblind users
- The `Ordering` component uses `☰` as drag handle — no accessible drag-and-drop (lack keyboard reordering alternative)

---

## 3. Performance

### 3.1 Bundle & Build

```bash
npm run build  # tsc -b && vite build
```

**Observations:**
- Vite 5 config is clean with path alias (`@/` → `./src/`)
- No bundle analysis plugin configured — bundle size is unknown
- `lucide-react` (icon library) is imported per-component (`import { Volume2, Loader2, Square }`), which tree-shakes well
- `@xyflow/react` is the heaviest dependency (React Flow v12) — no code-splitting
- **Build warnings:** settingsStore is dynamically imported by QuizInteraction but statically by App.tsx — acceptable Vite chunking warning

### 3.2 Render Performance

**Strengths:**
- All node components are `memo`-wrapped
- `useMemo` used extensively in `CanvasPage.tsx` for derived data (nodes, edges, conceptTitles, concepts)
- `useCallback` for event handlers in `CanvasPage.tsx`, `NoteNode.tsx`
- Typing animation uses `requestAnimationFrame` via `useTypingAnimation`

**Weaknesses:**
- `filterVisibleNodes` is called on every session state change and returns new arrays — forces downstream `useMemo` re-computation even if visible set hasn't changed
- `visibleData` is derived from `session.nodes` + `session.edges` + `currentConceptIndex` + `revealedQuizIds` + `notebookMode` — any change recalculates everything
- No virtualization for large canvases — a session with 50+ nodes could suffer
- `useTypingAnimation` animation loops run even when the node is off-screen or not visible
- `NoteNode` calls `useSessionStore.getState()` inside event handlers instead of subscribing — this is intentional but bypasses React's reactivity
- `Ordering` component uses `useState(() => [...items].sort(() => Math.random() - 0.5))` — `Math.random` in state initializer means SSR/hydration mismatch if ever used; also not seedable for testing

### 3.3 Concurrency

**Strengths:**
- Pipeline uses `boundedConcurrencyPool` (default `Infinity` = `Promise.all`) to parallelize concept generation
- Mutex (`createMutex`) serializes IndexedDB writes from concurrent workers — prevents clobbering
- Abort signal propagates correctly through `chat()` (fixed 2026-07-06)

**Weaknesses:**
- `CONCURRENCY = Infinity` by default means all concepts fire simultaneously — with 10 concepts, this means 10 concurrent LLM API calls, each with retries. Most LLM APIs rate-limit heavily; a lower concurrency (3–5) would be more reliable.
- No per-provider rate limit awareness — Mistral / NVIDIA have different rate limits but the code treats them identically
- Mutex is an in-memory lock — if the worker crashes mid-write, the lock is released (acceptable but worth noting)

---

## 4. Security

### 4.1 API Key Handling

- API keys stored in `localStorage` under `quizify:*` keys — standard for SPAs but vulnerable to XSS
- No `Authorization` header sent when `requiresApiKey` is false (Default provider)
- Key field hidden when Default provider is selected

### 4.2 Content Security

- No CSP headers configured in Vite dev server or build output
- User-provided URLs are fetched server-side (Jina) or via CORS proxies — no sanitization of fetched content displayed in canvas
- The canvas renders LLM-generated HTML-like content — no `dangerouslySetInnerHTML` found (good), but content is rendered as text nodes

### 4.3 Dependencies

- `roughjs` is an interesting choice for edge rendering — no known CVEs
- `@xyflow/react` is actively maintained
- No `npm audit` run in CI — vulnerability surface is unknown

---

## 5. Testing

### 5.1 Coverage Overview

| Area | Files | Tests | Quality |
|------|-------|-------|---------|
| Stores | 2 | ~20 tests | Good — covers settings + session CRUD |
| Pipeline | 1 | ~30 tests | Good — covers state machine, concurrent writes |
| LLM parsing | 5 | ~50 tests | Good — covers outline, content, grade, summary parsers |
| Chat | 1 | ~15 tests | Adequate — basic retry, abort, JSON mode |
| TTS | 2 | ~20 tests | Good — recent fixes for state reset |
| Truncate | 1 | ~8 tests | Good |
| UseMediaQuery | 1 | ~4 tests | Minimal |
| FetchSourceContent | 1 | ~15 tests | Adequate |
| App | 1 | ~20 tests | Integration-style — covers full flow |
| **Canvas** | **8+** | **0 tests** | **UNCOVERED** |
| **Quiz components** | **8** | **0 tests** | **UNCOVERED** |
| **Welcome modal** | **2** | **0 tests** | **UNCOVERED** |
| **Export** | **4** | **0 tests** | **UNCOVERED** |
| **Error boundaries** | **4** | **0 tests** | **UNCOVERED** |

### 5.2 Test Infrastructure

**Strengths:**
- `tests/setup.ts` configures jsdom, mocks `matchMedia`, `SpeechSynthesisUtterance`, and IndexedDB (via `fake-indexedb`)
- `tests/test-utils.tsx` provides `renderWithProviders` wrapper
- `tests/factories.ts` provides type-safe factory functions
- `tests/db-helpers.ts` has IDB setup/teardown helpers

**Weaknesses:**
- No `window.fetch` mock by default — network-dependent tests need manual mocking
- `fake-indexeddb` is used instead of `idb`'s own test utilities — subtle behavioral differences possible
- No E2E tests at all — the canvas and quiz interaction are untested at the integration level
- No coverage thresholds configured

### 5.3 Test Quality Observations

- `pipeline.test.ts` and `sessionStore.test.ts` are the best tests — thorough, cover edge cases, use factories
- `chat.test.ts` tests retry logic but doesn't test the full abort propagation path (the bug that was fixed 2026-07-06)
- Test descriptions are generally clear but some files use `it('should...')` inconsistently
- No snapshot tests — the canvas rendering is entirely untested

---

## 6. Specific Issues (Ranked by Severity)

### 🔴 Critical

1. **`SummaryQuizInteraction.tsx` — potential crash on `correctAnswer` access**
   - `QuizData.correctAnswer` is typed as optional (`string | undefined`)
   - `SummaryQuizInteraction.tsx` calls `current.correctAnswer.trim()` without null-check
   - **Fix:** Guard with `current.correctAnswer ?? ''` before calling `.trim()`

2. **No canvas component tests**
   - 8+ components (ConceptNode, QuizNode, SummaryNode, NoteNode, WigglyEdge, CanvasPage, MobileFocusView) have zero tests
   - These are the most user-facing parts of the app
   - **Fix:** Add at minimum rendering smoke tests for each node type

3. **Quiz interaction (modal) has no tests**
   - `QuizInteraction.tsx`, `SummaryQuizInteraction.tsx`, and all 6 quiz format components are untested
   - This is where user grading happens — correctness is critical

### 🟠 High

4. **Inline styles in QuizInteraction**
   - ~80 lines of inline styles mixing with CSS modules — inconsistent, non-themeable, harder to maintain
   - **Fix:** Migrate to CSS modules like the rest of the codebase

5. **`as unknown as` casts in node components**
   - ConceptNode, QuizNode, SummaryNode, NoteNode all cast `props.data as unknown as XxxData`
   - React Flow supports generic `NodeProps<DataT>` since v12
   - **Fix:** Use `NodeProps<ConceptData>` etc. directly

6. **Ordering format: `Math.random()` in state initializer**
   - `useState(() => [...items].sort(() => Math.random() - 0.5))` is non-deterministic
   - **Fix:** Use a seeded shuffle or Fisher-Yates with a stable initial order

7. **`CONCURRENCY = Infinity` is aggressive**
   - All concept LLM calls fire simultaneously — likely to hit rate limits
   - **Fix:** Default to 3–5 concurrent requests

### 🟡 Medium

8. **No bundle analysis**
   - Unknown bundle size — `@xyflow/react` and `roughjs` could be large
   - **Fix:** Add `rollup-plugin-visualizer` or `vite-bundle-visualizer`

9. **CSS `!important` in notebook.css**
   - Breaks cascading predictability
   - **Fix:** Increase specificity naturally (e.g., `[data-notebook="true"] .node`)

10. **`__summary__` magic string**
    - Hardcoded `__summary__` node ID in `CanvasPage.tsx` and presumably `pipeline.ts`
    - **Fix:** Extract to a constant like `SUMMARY_NODE_ID = '__summary__'`

11. **SessionStorage for quiz progress**
    - `SummaryQuizInteraction` stores progress in `sessionStorage` — not IndexedDB
    - Progress is lost on tab close; not synced with session data
    - **Fix:** Persist summary quiz progress alongside session data in IndexedDB

12. **No keyboard navigation for export dropdown**
    - Custom dropdown lacks arrow keys, Escape, focus trapping
    - **Fix:** Use a standard `<dialog>` or add keyboard handlers

### 🔵 Low

13. **`console.error()` for user-facing failures**
    - `ConceptNode.tsx:88` catches TTS error and logs to console — user sees nothing

14. **No skip-link for canvas**
    - Large interactive canvas area with no keyboard escape — screen reader users are trapped

15. **Accordion semantics for quiz state badges**
    - Color-only indicators (green/red/yellow) — should include text or icons for accessibility

16. **Empty `features/sessions/` and `features/settings/` directories**
    - Leftover feature scaffolds should be cleaned up

17. **No rate-limit awareness per provider**
    - Mistral and NVIDIA have different rate limits; retry logic is identical

---

## 7. Code Smells / Tech Debt

- **Dual-width CSS maintenance** — documented in AGENTS.md but still a burden
- **App.tsx orchestration is too long** — pipeline coordination, page routing, and error handling all in one component
- **TTSManager is a global singleton** — imported directly, hard to mock in tests (though recent mock additions help)
- `fetchSourceContent.ts` has interleaved async caching logic + network calls + LLM fallback — complex function with multiple responsibilities
- `truncate.ts` is the only lib file with its own test file — most lib files have no unit tests
- Build produces a `dist/` with no visualizer — unknown if tree-shaking is effective
- No Prettier checks in CI — formatting can drift (though `npm run format` exists)

---

## 8. Test Quality Assessment

| Metric | Status |
|--------|--------|
| Total test files | 40 |
| Total tests | 463 |
| Failures | 0 |
| Test framework | Vitest + jsdom + @testing-library/react |
| Setup file | `tests/setup.ts` — mocks matchMedia, SpeechSynthesis, IndexedDB |
| Factories | Excellent — `tests/factories.ts` with `buildMockOutline`, `buildMockConcept`, etc. |
| Store tests | Good — cover CRUD + edge cases |
| Pipeline tests | Good — cover state machine, concurrent writes, error propagation |
| Chat tests | Adequate — cover retry, abort, JSON mode |
| Parser tests | Good — cover outline, content, grade, summary parsers |
| UI component tests | **Poor** — no tests for any canvas node, quiz format, or quiz interaction component |
| Integration tests | Minimal — only `App.test.tsx` covers the full flow |
| E2E tests | None |

---

## 9. Recommendations

### Immediate (next sprint)

1. **Fix `SummaryQuizInteraction.correctAnswer` null-safety** — guard with `?? ''`
2. **Add rendering smoke tests** for the 6 quiz format components (they're small, pure, easy to test)
3. **Add rendering smoke tests** for ConceptNode and QuizNode (at minimum)
4. **Lower default concurrency** in `pipeline.ts` from `Infinity` to `3`
5. **Fix `Ordering` component** — use a deterministic initial shuffle

### Short-term (this iteration)

6. **Migrate quiz interaction inline styles to CSS modules**
7. **Fix `as unknown as` casts** — use `NodeProps<ConceptData>` generics
8. **Add bundle analysis** — `vite-bundle-visualizer`
9. **Extract `__summary__` to a constant**
10. **Replace `!important` in `notebook.css` with higher-specificity selectors**
11. **Add keyboard navigation to export dropdown**

### Medium-term

12. **Add integration tests for quiz submission and grading flow**
13. **Move session quiz progress from `sessionStorage` to IndexedDB**
14. **Extract pipeline orchestration from `App.tsx` into a custom hook**
15. **Add CSP headers in Vite config**
16. **Implement skip-link and keyboard navigation improvements for canvas**
17. **Consider using `@tanstack/react-router` or similar for deep-linkable session URLs**

### Long-term

18. **Full component test coverage for the canvas** (all node types, interactions)
19. **E2E tests with Playwright** — the core user flow (URL → fetch → outline → canvas → quiz) is critical
20. **Accessibility audit** — run axe-core or Lighthouse for baseline
21. **Service worker / PWA** — offline support for previously generated sessions
22. **Provider-specific rate limiting** in the LLM chat layer

---

## 10. Summary

Quizify is a well-architected React application with thoughtful patterns (concurrent pipeline, mutex-protected state, layered error boundaries, discriminated union types). The codebase is clean for a single-developer project and the recent history shows active improvement of known issues (race conditions, type casts, error boundaries, abort signal propagation).

The **critical gaps** are:
1. **No tests for canvas and quiz components** — the most user-facing code is untested
2. **A null-safety bug** in `SummaryQuizInteraction.tsx` waiting to crash
3. **Overly aggressive parallelism** in the pipeline (infinity concurrency)
4. **CSS debt** — dual-width maintenance, inline styles, `!important`

The test infrastructure is solid (factories, setup, utilities) but coverage is concentrated in stores/lib rather than UI. Fixing the immediate issues and adding quiz format smoke tests would provide a strong safety net for the core user interaction.

---

*Generated by DeepSeek Pro — 2026-07-08*
