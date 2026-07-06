# Engineering Decisions

> Log of significant engineering decisions made during v1 MVP build.
> Each entry: date, decision, rationale.

---

## 2026-07-05

### ESLint config format (.cjs over flat config)
**Decision:** Use `.cjs` legacy config format with `eslint-plugin-react` + `eslint-plugin-react-hooks`.
**Rationale:** Faster setup, well-documented, no migration to flat config needed for MVP.
**Trade-off:** `--legacy-peer-deps` needed with ESLint 9; flat config is the future but longer setup.

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

### Mistral via raw fetch (no SDK)
**Decision:** Use `fetch` directly to `api.mistral.ai/v1/chat/completions` instead of the `@mistralai/mistralai` SDK.
**Rationale:** Saves ~30kb gzipped from bundle, full control over retries/abort/timeouts, ~120 lines of code. The SDK adds abstraction with no benefit at this scale.

### Quiz state persisted per-node (no separate analytics store)
**Decision:** Each quiz node stores its own `attempts[]` and derived `state` field. The summary node reads from all quiz nodes to compute mastery.
**Rationale:** Simple, no cross-referencing. Architecture supports per-node retry/regeneration naturally. Mastery computation is a one-pass `reduce` over nodes.

### No E2E tests in v1
**Decision:** Unit + component tests only. E2E deferred.
**Rationale:** Mistral API key requirement makes automated CI E2E brittle. Manual smoke test documented in README instead.
