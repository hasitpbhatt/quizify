# Engineering Decisions

> Log of significant engineering decisions made during v1 MVP build.
> Each entry: date, decision, rationale.

---

## 2026-07-05

### Default (Quizify-managed) LLM provider
**Decision:** Add a third `default` provider (`'default'`) that proxies chat requests through a Cloudflare Pages Function at `/api/chat` with a server-side Mistral API key. The Welcome modal hides the API key field entirely when this provider is selected. The provider is marked experimental — hint text reads "may not always work".
**Rationale:** A zero-config option for new users — no signup or API key needed to try the app. The server-side key is set once in Cloudflare Pages env vars; the Vite dev server has a matching inline proxy for local development.
**Trade-off:** Adds a dependency on the Pages Function being deployed and its key remaining valid. Users who need reliability should use their own Mistral or NVIDIA key.
**Cost:** One Pages Function (`functions/api/chat.ts`, ~25 lines), `requiresApiKey: false` in `providers.ts`, conditional UI in `WelcomeModal.tsx`, an `/api/chat` dev proxy in `vite.config.ts`, and `.env.example`.

### TTS via Voxtral with Web Speech fallback
**Decision:** Use Mistral Voxtral API (`voxtral-mini-tts-2603`) when Mistral provider is selected and connected; fall back to browser's SpeechSynthesis API.
**Rationale:** Adds reading-aloud affordance with no extra infra. Voxtral is free via Mistral keys users already have. Browser TTS covers the NVIDIA provider path and offline scenarios.
**Cost:** Single file `src/lib/llm/tts.ts`, ~33 lines.

### State-store race fix (updater form + IDB-fresh reads)
**Decision:** Rewrite `sessionStore.ts` to use `set((state) => …)` updater form, a shared `upsertSession` helper, and read the authoritative copy from IndexedDB inside `updateCurrent` before merging patches. In `App.tsx`, always `await createSession` + `await select` before AND after `runPipeline`.
**Rationale:** Concurrent `createSession` and `updateCurrent` calls (both awaiting IDB writes then replacing `sessions`) used to clobber each other — the pipeline's nodes vanished, leaving a blank canvas. The updater form prevents stale closures; IDB-fresh reads prevent lost fields when two updates happen concurrently.
**Trade-off:** Slightly more verbose store code, but eliminates a hard-to-debug race that was the #1 "blank canvas on load" bug.

### ESLint config format (flat config)
**Decision:** Migrate from `.cjs` legacy config to ESLint flat config (`eslint.config.js`).
**Rationale:** Flat config is the future of ESLint 9+ and avoids `--legacy-peer-deps`. Switched from `eslint-plugin-react` to `typescript-eslint` + `eslint-plugin-react-hooks`.
**Trade-off:** Minor setup effort; no functional change in lint rules.

### Font delivery (Google Fonts CDN, not self-hosted)
**Decision:** Reference Google Fonts via `<link>` in `index.html` for v1. Self-hosting deferred to v1.1.
**Rationale:** Zero setup cost, works immediately, no font files to download/manage in repo. The ~150kb font payload is a one-time cache hit. Privacy concern is negligible for MVP (no PII in the request).
**Cost:** Extra DNS + network hop on first visit; fonts cached after.

### CSS methodology (CSS modules + tokens.css, no Tailwind)
**Decision:** Component-scoped CSS modules + a global `tokens.css` variables file. No Tailwind.
**Rationale:** Design spec has a small, token-driven palette. Tailwind's utility classes would add noise without value at this scale (4 node types, ~10 components). CSS modules keep styling local and tree-shakeable.
**Trade-off:** More manual CSS than Tailwind; easier to migrate to Tailwind later if the component count grows.

### Build target (es2022)
**Decision:** `build.target = 'es2022'` in Vite.
**Rationale:** All modern browsers (Chrome 97+, Firefox 96+, Safari 15.4+, Edge 97+) fully support ES2022. No need for legacy transforms. Smaller bundles.
**Trade-off:** Drops IE11 and very old Safari (pre-15.4). Acceptable for an MVP.

### Zustand over Redux / React Query
**Decision:** Zustand for state management. No Redux or TanStack Query.
**Rationale:** 1kb, no boilerplate, fits the app's scale (4 small stores). React Query is overkill — the generation pipeline is mutation-heavy, not query-cache-heavy.

### LLM via raw fetch (no SDK)
**Decision:** Use `fetch` directly to LLM provider endpoints instead of vendor SDKs.
**Rationale:** Saves ~30kb gzipped from bundle, full control over retries/abort/timeouts, ~140 lines of code. Multi-provider support (Mistral + NVIDIA) is a simple config swap without SDK dependency conflicts.

### Quiz state persisted per-node (no separate analytics store)
**Decision:** Each quiz node stores its own `attempts[]` and derived `state` field. The summary node reads from all quiz nodes to compute mastery.
**Rationale:** Simple, no cross-referencing. Architecture supports per-node retry/regeneration naturally. Mastery computation is a one-pass `reduce` over nodes.

### No E2E tests in v1
**Decision:** Unit + component tests only. E2E deferred.
**Rationale:** API key requirement makes automated CI E2E brittle. Manual smoke test in README instead.

---

## 2026-06-03

### Fixed-width layout at creation time (no reactive hook)
**Decision:** Pipeline assigns `(x, y)` positions at node creation time using constants (`ESTIMATED_WIDTH`). Removed `useJourneyLayout.ts` hook.
**Rationale:** The reactive layout hook re-ran on every store update and caused overlapping nodes. Computing positions once at creation time using fixed widths matching the CSS gives predictable results with zero runtime jank.
**Trade-off:** Nodes are tightly packed by default — manual drag may be needed if a concept has unusually wide content. Acceptable for MVP.

## 2026-06-02

### Horizontal chain layout (replacing column-first grid)
**Decision:** Nodes are laid out in a single horizontal chain: Concept 1 → Quiz 1 → Concept 2 → Quiz 2 → ... → Summary. Removed `autoGridLayout.ts`.
**Rationale:** For the MVP scale (~10-15 concepts), a horizontal chain fits well on widescreen displays, avoids wrapping complexity, and makes the linear reading order visually obvious. The column-first grid was complex and didn't add value at MVP size.
**Trade-off:** Users with small viewports need to pan right more. Mitigated by pan-on-scroll and fit-view controls.

## 2026-06-01

### Multi-provider LLM support (Default + Mistral + NVIDIA)
**Decision:** Abstract LLM calls behind a provider-agnostic `chat.ts` that dynamically switches `baseUrl`/`model` via the `LlmProvider` type. Three providers: Quizify Default (server-proxied), Mistral (console.mistral.ai), and NVIDIA free API (build.nvidia.com).
**Rationale:** NVIDIA offers generous free tier (200k requests/month at the time of adding), making initial usage truly zero-cost. The abstraction aligns with the forward-compatible "AI provider" hook already spec'd in product_spec §9.
**Cost:** ~80 extra lines in `providers.ts` (three providers + `requiresApiKey` field), a `provider` field in `settingsStore.ts`, a provider selector in the Welcome modal with conditional API key field visibility. Retry logic in `chat.ts` grew from simple retry to fallback model retry with 3 attempts and exponential backoff.
