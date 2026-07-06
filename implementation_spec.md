# Quizify — Implementation Specification

> **Status:** v1 (MVP)
> **Last updated:** 2025-07-05
> **Companion to:** `product_spec.md`, `design_spec.md`
> **Owner:** Engineering
> **Constraint:** Only runtime cost is the user-supplied LLM API key (Mistral or NVIDIA), unless using the default Quizify-managed provider (zero-config, experimental). Minimal backend: one Cloudflare Pages Function `/api/chat` for the default provider path.

---

## 1. Architecture overview

### 1.1 Guiding constraint

Quizify is a **pure static SPA**. There is no server we own. The only network egress from the browser goes to:

1. **LLM API** — Mistral, NVIDIA, or a Quizify-managed proxy (`/api/chat` on Cloudflare Pages). For Mistral/NVIDIA, the user supplies their own API key. The default provider proxies through a Pages Function using a server-side Mistral key (experimental; may not always be available).
2. **r.jina.ai Reader** (`https://r.jina.ai/<url>`) — primary free service that fetches a URL server-side and returns cleaned, readable Markdown text (handles CORS, dynamic pages, and PDFs). Zero infrastructure on our side.
3. **Fallback CORS proxies** (allorigins / corsproxy / cors.eu.org) — only used when Jina is rate-limited or down. Returns raw HTML which we strip in-browser (see §7).
4. **Optional Jina bearer token** — Strategy B in §7.3. Lifts the anonymous 20 RPM cap for power users. Free, user-supplied, stored locally alongside the API key.

**Note on rate limits in our architecture:** every request originates from the user's own browser (there is no backend). Public proxies apply their limit per-IP:
- **Jina anonymous tier** (no token): request is bucketed by `<user's IP>`. On a home NAT this is fine (you alone). On corporate / dorm / shared Wi-Fi everyone on that IP shares the ~20 RPM pool — they can collide.
- **Jina with free token** (Strategy B): Jina buckets by the *token*, not the IP. The user has their own private quota independent of who else shares their NAT. This is the only mode where "client-side" truly means "isolated limit."

In practice, even the anonymous IP limit is rarely hit for v1: each generation is **1 fetch call per canvas** (the ~24 sequential calls are to the LLM provider, which doesn't touch the proxy tier). The fallback chain in §7.3 absorbs the rare anonymous-tier edge cases (NAT sharing, bursts); adding a free Jina token in Settings eliminates them entirely.

Everything else runs in the browser: routing, state, persistence (IndexedDB), canvas rendering.

### 1.2 Architecture diagram

```
┌────────────────────────── Browser (SPA) ──────────────────────────┐
│                                                                   │
│  React (Vite build)                                               │
│   ├─ Welcome flow (persona + API key + URL input + provider)      │
│   ├─ Top toolbar (sessions, settings)                             │
│   ├─ React Flow canvas (concepts, quizzes, notes, summary)        │
│   ├─ Generation pipeline (orchestrator)                          │
│   │    ├─ fetchSourceContent(url) → r.jina.ai Reader              │
│  │    ├─ chat(outline prompt) → LLM (default / Mistral / NVIDIA) │
│  │    ├─ for each concept:                                       │
│  │    │   └─ chat(content prompt, combined detail+quiz) → LLM    │
│  │    └─ gradeAnswer(quiz, answer) → LLM (on submit only)        │
│   ├─ Persistence layer (IndexedDB via idb)                        │
│   └─ Theme + tokens                                               │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │ HTTPS
                ┌────────────────┴────────────────────────────────────┐
                ▼                                                   ▼
       https://r.jina.ai/             Mistral / NVIDIA API / /api/chat
       (free Reader proxy)            (selected by user or default proxy)
```

### 1.3 Why these choices

| Decision | Why |
|---|---|
| **Vite + React + TS** | Spec-recommended; fast HMR; static build; matches React Flow ecosystem; huge hiring/learning surface. |
| **React Flow (`@xyflow/react`)** | MIT, mature infinite pan/zoom, custom nodes, custom edges — exactly the spec's canvas model. |
| **r.jina.ai Reader** | Free, no auth, fetches readable content + PDFs, returns Markdown pre-cleaned for LLMs, returns CORS-friendly headers — fits "zero infra" perfectly. |
| **LLM providers (default / Mistral / NVIDIA)** | Three providers via `providers.ts` config and provider-agnostic `chat()` in `chat.ts`. The default provider uses a server-side proxy (`/api/chat`) with no API key required; Mistral and NVIDIA use direct browser-to-API calls with user-supplied keys. |
| **IndexedDB via `idb`** | Spec-mandated multi-session persistence with potentially large canvases; `idb` is 1kb Promises wrapper. |
| **Cloudflare Pages** | Free unlimited static hosting on a global CDN, no build-minute caps that matter; one-command deploy. |
| **Minimal Pages Function for default provider** | One function at `functions/api/chat.ts` proxies chat requests to Mistral using a server-side API key. Only active when the user selects the "Quizify (Default)" provider — Mistral/NVIDIA paths remain direct. |
| **Client-direct fetches (Mistral/NVIDIA paths)** | A server-side proxy concentrates all users' traffic onto our single IP. For Mistral/NVIDIA we use client-direct fetches. The default provider's proxy is intentionally single-tenant (one server-side key) and marked experimental. |

### 1.4 Non-goals (v1)

- No server-side session storage, no auth, no analytics, no backend proxy.
- No streaming UI beyond reactive node insertion (we *will* stream LLM tokens internally for speed, but the user-visible "streaming" motion is node-by-node).
- No build pipeline beyond Vite. No CI required (PR deploys are automatic on Cloudflare Pages).

---

## 2. Tech stack — pinned versions

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@xyflow/react": "^12.3.5",        // React Flow v12 (MIT)
    "idb": "^8.0.0",                   // IndexedDB Promises wrapper

    "clsx": "^2.1.1",
    "lucide-react": "^0.453.0"
  },
  "devDependencies": {
    "vite": "^5.4.8",
    "@vitejs/plugin-react": "^4.3.2",
    "typescript": "^5.6.2",
    "@types/react": "^18.3.10",
    "@types/react-dom": "^18.3.0",
    "vitest": "^2.1.1",
    "@testing-library/react": "^16.0.1",
    "eslint": "^9.11.1",
    "@typescript-eslint/parser": "^8.7.0",
    "@typescript-eslint/eslint-plugin": "^8.7.0",
    "prettier": "^3.3.3"
  }
}
```

**No backend. No database. No secrets at build time.**

---

## 3. Repository layout

```
quizify/
├─ functions/
│  └─ api/
│     └─ chat.ts                   # Pages Function for default provider proxy
├─ public/
│  └─ fonts/                       # Caveat + Inter self-hosted (see §11)
├─ src/
│  ├─ main.tsx                     # bootstrap
│  ├─ app/
│  │  ├─ App.tsx                   # shell: routes between welcome/canvas
│  │  ├─ ProgressScreen.tsx        # generation progress display
│  │  ├─ theme.ts                  # token resolve + system preference
│  │  ├─ useTheme.ts
│  │  └─ useToast.ts
│  ├─ features/
│  │  ├─ welcome/
│  │  │  ├─ WelcomeModal.tsx        # persona cards + provider + API key + URL
│  │  │  ├─ PersonaCard.tsx
│  │  │  └─ useWelcomeState.ts
│  │  ├─ sessions/
│  │  │  └─ ... (deferred until needed)
│  │  ├─ toolbar/
│  │  │  └─ Toolbar.tsx
│  │  ├─ canvas/
│  │  │  ├─ CanvasPage.tsx          # React Flow wrapper
│  │  │  ├─ nodes/
│  │  │  │  ├─ ConceptNode.tsx
│  │  │  │  ├─ QuizNode.tsx
│  │  │  │  ├─ NoteNode.tsx
│  │  │  │  └─ SummaryNode.tsx
│  │  │  ├─ edges/
│  │  │  │  └─ WigglyEdge.tsx       // hand-drawn SVG path edge
│  │  │  ├─ MobileFocusView.tsx     // mobile single-node focus
│  │  │  └─ MobileFocusView.module.css
│  │  ├─ quiz/
│  │  │  ├─ QuizInteraction.tsx      // per-format affordances (see §8)
│  │  │  └─ formats/
│  │  │     ├─ MultipleChoice.tsx
│  │  │     ├─ TrueFalse.tsx
│  │  │     ├─ ShortAnswer.tsx
│  │  │     ├─ FreeText.tsx
│  │  │     ├─ FillBlank.tsx
│  │  │     └─ Ordering.tsx
│  ├─ lib/
│  │  ├─ pipeline.ts               // orchestrator (see §4)
│  │  ├─ fetchSourceContent.ts     // r.jina.ai Reader + fallbacks + LLM knowledge
│  │  ├─ truncate.ts               // paragraph-aware content truncation
│  │  ├─ db/
│  │  │  ├─ db.ts                   // IndexedDB setup
│  │  │  ├─ sessionsDb.ts           // session CRUD
│  │  │  └─ sourceCache.ts          // source content cache
│  │  ├─ llm/
│  │  │  ├─ chat.ts                 // provider-agnostic LLM client
│  │  │  ├─ providers.ts            // default + Mistral + NVIDIA config
│  │  │  ├─ errors.ts               // AuthError, RateLimitError, NetworkError
│  │  │  ├─ outlineParser.ts
│  │  │  ├─ contentParser.ts        // combined detail+quiz parser
│  │  │  ├─ summaryParser.ts
│  │  │  ├─ gradeParser.ts
│  │  │  └─ tts.ts                  // Voxtral TTS with Web Speech fallback
│  │  └─ prompts/
│  │     ├─ outline.ts
│  │     ├─ content.ts              // combined detail+quiz prompt
│  │     ├─ summary.ts
│  │     └─ grade.ts
│  ├─ shared/
│  │  ├─ types.ts                   // Session, NodeData, Persona, LlmProvider, etc.
│  │  ├─ stores/
│  │  │  ├─ sessionStore.ts         // sessions + currentId, backed by IDB
│  │  │  └─ settingsStore.ts        // apiKey, jinaToken, persona, theme, provider
│  │  ├─ Button.tsx / Input.tsx / etc.
│  │  └─ useMediaQuery.ts
│  ├─ styles/
│  │  ├─ reset.css
│  │  ├─ global.css
│  │  ├─ tokens.css                 // CSS variables (design_spec §3)
│  │  └─ canvas.css
├─ tests/
│  ├─ setup.ts
│  ├─ truncate.test.ts
│  └─ useMediaQuery.test.ts
├─ index.html
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
├─ eslint.config.js
├─ .prettierrc
├─ AGENTS.md
├─ design_spec.md
├─ eng_decisions.md
├─ implementation_spec.md
├─ product_spec.md
└─ .env.example                    # MISTRAL_API_KEY for default provider dev proxy
```

A `_redirects` file at `public/_redirects` ensures SPA deep-link fallback:
```
/*    /index.html   200
```

---

## 4. Generation pipeline

The pipeline is the heart of the app. It must:

- Run entirely in the browser.
- Stream nodes onto the canvas as each concept + quiz pair is ready.
- Be cancellable.
- Survive partial failures (a node that fails to generate doesn't block the rest).
- Cost the user only LLM API tokens (Mistral or NVIDIA).

### 4.1 High-level flow

```
input: { url, persona, apiKey, provider: 'default' | 'mistral' | 'nvidia' }
                │
                ▼
       ┌──────────────────┐
       │ fetchSourceContent│  HTTP GET https://r.jina.ai/<url>
       │   (Jina Reader)  │  → cleaned Markdown text (or fallback chain)
       └────────┬─────────┘
                │  { content, fetched: bool }
                ▼
       ┌──────────────────┐       LLM call #1 (selected provider)
       │ chat(outline)    │       prompt → JSON: 10-15 concept titles + 1-line summaries
       └────────┬─────────┘
                │  ConceptOutline[]
                ▼
       ┌──────────────────────────────────────────────┐
       │  for each concept (await sequentially):      │  LLM call #2..N (serialized)
       │    1. push concept shell with "Loading..."   │     - each: combined detail+quiz in one prompt
       │    2. chat(content prompt, responseFormat)   │     - positions assigned with fixed widths
       │       → { detail: ConceptData, quizzes[] }   │     - concept then quiz(zes) placed horizontally
       │    3. hydrate concept + push quiz nodes      │     - 2s delay between concepts (rate-limit safety)
       │    4. emit + persist to IndexedDB            │
       │    5. yield on cancel token if requested     │
       └──────────────────────────────────────────┘
                │
                ▼
       ┌──────────────────────────┐    LLM call #N+1
       │ chat(summary prompt)     │    → 4-6 recap bullets + 5-8 mixed-format summary quiz
       └────────┬─────────────────┘
                │  SummaryNode (placed at cursorX end of chain)
                ▼
             persist + emit
                │
                ▼
            done
```

### 4.2 Cancellation

The orchestrator accepts an `AbortController`. Before every LLM call it checks `signal.aborted`; if aborted, it stops issuing new calls and resolves the partial pipeline (already-emitted nodes stay). The model call itself uses `fetch` + `signal` so in-flight requests cancel cleanly.

### 4.3 Error handling strategy

| Stage | Failure | Response |
|---|---|---|
| Jina fetch | network error / 4xx / 5xx | Log to console + telemetry toast. Continue with `content = ""`, `fetched = false` — outline prompt notes "URL unavailable, use your knowledge". |
| Outline | LLM auth (401) | Stop pipeline. Surface an inline error on the welcome modal: *"That API key didn't work."* Do not retry. |
| Outline | LLM non-200 | Retry once after 800ms. If still fails, stop with toast *"Couldn't start generation. Try again."* |
| Outline | Invalid JSON | Use `parsers.ts` lenient extractor (regex for `{...}` block, then `JSON.parse`, then JSON5 if needed). On total failure: stop with toast. |
| Individual concept | Any error | Increment failure counter on the status chip, render a **placeholder node** with title "Concept N unavailable" + Retry button. Continue pipeline. Never abort the whole canvas for one concept. |
| Individual quiz | Any error | Render concept node fully; render quiz node in `error` state with Retry button. Continue. |
| Summary | Failure | Render summary node in error state with Retry. Other nodes are unaffected. |

**Every node is independently retriable.** The placeholder concept/quiz nodes expose a `Retry` button that calls just that node's generation function (sets up the architecture for the post-MVP "regenerate single node" feature from product_spec §9 — see §12).

### 4.4 Prompt overview (full prompts in §6.5)

1. **Outline** — system: "You are an expert tutor…", user: `PERSONA pois persona description + sourceContent + URL + requested count 10-15`. Output: `{ concepts: [{ title, oneLiner }] }`.
2. **Concept** — system: "Explain one concept…", user: persona + outline item + source excerpt (truncated). Output: `{ title, explanation, example, sourceReference }`.
3. **Quiz** — system: "Generate a verification question…", user: persona + concept. We randomly pick a format per call to control cost. Output: typed quiz shape (see §8.1).
4. **Summary** — system: "Summarize and produce a mixed quiz…", user: all concepts' titles + oneLiners. Output: `{ recap: string[], finalQuiz: QuizQuestion[] }`.
5. **Grade** — only invoked on user submit for short answer / free text formats (see §8.5). Output: `{ grade: 'correct'|'partial'|'incorrect', rationale, idealAnswer }`.

### 4.5 Token budget per canvas

Models vary by provider (e.g. Mistral `mistral-large-latest` ~125k context, NVIDIA `nemotron-3-super` ~128k context). Per canvas, rough envelope:

- Outline: ~1 call, ~1500 tokens out.
- Concept + Quiz (combined in one call): ~1 call × 12 = 12 calls, ~800 tokens out each ≈ 9600 out.
- Summary: ~1 call, ~1500 out.
- Grading (later, on demand): ~2-4 calls per session, ~500 out.

**Per canvas generation ≈ 17,400 output tokens + proportional inputs.** At typical LLM pricing (~$1/M out tokens), this is well under $0.05 per full canvas — clearly acceptable for an MVP. We **do not** implement client-side rate limits, but we *do* show token usage on the settings sheet ("~17k tokens used in this session") so users can self-monitor.

### 4.6 Sequential vs parallel fat-pipe trade-off

Per concept, we **await** the concept call before issuing the quiz call (the concept informs the quiz prompt). Across concepts, we run sequentially too:

- Pros: simplest, lowest risk of rate-limit hits on free tiers (some providers have low RPM), nodes stream in stable order matching the reading order, simplest UI animation.
- Cons: slower (`~12 × 2 × ~3s = 70s` total ~ realistic).
- Optimization to consider: parallelize **2 at a time** (Promise pool of size 2) and re-order emits based on position. Defer to v1.1; out of scope for MVP.

---

## 5. Data model & persistence

### 5.1 IndexedDB schema (single DB `quizify`)

| Store | Key | Fields |
|---|---|---|
| `sessions` | `id` (uuid) | `id, name, url, persona, createdAt, updatedAt, nodes[], edges[], scores{}` |
| `settings` | `key` (string) | `key, value` (single-row store for `persona`, `apiKey`, `theme`) |

We use `idb`'s convenience helpers; no migrations beyond `version: 1`. If schema changes later, version up.

### 5.2 Core types (`shared/types.ts`)

```ts
export type Persona = 'curious' | 'student' | 'professional' | 'expert';

export interface Source {
  type: 'url';                       // future: 'topic' | 'file' | 'book'
  url: string;
  fetched: boolean;                  // did Jina return content?
  hostname: string;
}

export type NodeKind = 'concept' | 'quiz' | 'note' | 'summary';

export interface ConceptData {
  kind: 'concept';
  index: number;                     // 1..15 (display counter)
  title: string;
  explanation: string;
  example: string;
  sourceReference?: string;          // quote or 'from model knowledge'
  sourceUrl?: string;
}

export type QuizFormat =
  | 'multipleChoice' | 'trueFalse' | 'shortAnswer'
  | 'freeText' | 'fillBlank' | 'ordering';

export interface QuizData {
  kind: 'quiz';
  parentConceptId: string;           // React Flow node id of parent concept
  format: QuizFormat;
  prompt: string;
  options?: string[];                // multipleChoice / trueFalse
  blankedSentence?: string;         // fillBlank
  items?: string[];                  // ordering (shuffled)
  correctAnswer: string;             // single canonical answer
  acceptableAnswers?: string[];      // multipleChoice/trueFalse/fillBlank: hard truth set
  rationale: string;                // tied to concept, shown after submit
  attempts: Attempt[];
  bestScore?: number;               // 0..1
  state: QuizState;                 // 'untested'|'inProgress'|'correct'|'partial'|'incorrect'|'mastered'
}

export interface Attempt {
  timestamp: number;
  given: string | string[];
  grade: 'correct' | 'partial' | 'incorrect';
  rationale?: string;
  idealAnswer?: string;              // LLM-graded only
}

export interface NoteData {
  kind: 'note';
  text: string;
  linkedConceptId?: string;
}

export interface SummaryData {
  kind: 'summary';
  recap: string[];                   // 4-6 bullets
  finalQuiz: QuizData[];             // 5-8 mixed-format questions
  results?: SummaryResults;          // populated when finalQuiz completes
}

export interface SummaryResults {
  masteryPct: number;                // 0..100
  conceptsMastered: number;
  conceptsShaky: number;
  conceptsUntested: number;
  perConcept: Record<string, QuizState>;
}

export type QuizState = 'untested' | 'inProgress' | 'correct' | 'partial' | 'incorrect' | 'mastered';

export interface Session {
  id: string;
  name: string;
  url: string;
  hostname: string;
  persona: Persona;
  createdAt: number;
  updatedAt: number;
  nodes: CanvasNode[];              // React Flow nodes with data: ConceptData | QuizData | NoteData | SummaryData
  edges: CanvasEdge[];
  scores: Record<string, { best: number; attempts: number }>;
}
```

### 5.3 Layout assigned at write-time (horizontal chain)

Layout is computed inline in `pipeline.ts` using fixed estimated widths — no separate layout module. A cursor `cursorX` advances rightward as each node is created:

```
const ESTIMATED_WIDTH = { concept: 260, quiz: 240, summary: 300 };
const GAP_X = 120;
const Y = 100;
let cursorX = 100;

// For each concept:
position = { x: cursorX, y: Y };         // concept
cursorX += ESTIMATED_WIDTH.concept + GAP_X;

// Then for each quiz of that concept:
position = { x: cursorX, y: Y };         // quiz
cursorX += ESTIMATED_WIDTH.quiz + GAP_X;

// Summary sits at final cursorX position:
position = { x: cursorX, y: Y };         // summary
```

Result: all nodes sit on a single horizontal line (`y = 100`), spaced by `ESTIMATED_WIDTH + GAP_X`. Users can drag nodes freely; the initial positions are a starting layout, not enforced after creation.

### 5.4 Draggable-override contract

Nodes are fully draggable from first paint. There is no "Reset Layout" button in v1 — nodes stay where the user puts them. New streamed nodes from retry/resume get fresh positions on the same horizontal line.

---

## 6. LLM client

### 6.1 Multi-provider design

Quizify supports three LLM providers, selected by the user in the Welcome modal:

| Provider | Base URL | Default model | Fallback model | API key |
|---|---|---|---|---|
| **Quizify (Default)** | `/api/chat` (same-origin Pages Function) | `mistral-large-latest` | `mistral-medium-latest` | Server-side (no user key needed) |
| **Mistral** | `https://api.mistral.ai/v1/chat/completions` | `mistral-large-latest` | `mistral-medium-latest` | User-supplied |
| **NVIDIA** | `https://integrate.api.nvidia.com/v1/chat/completions` | `nvidia/nemotron-3-super-120b-a12b` | `meta/llama-3.3-70b-instruct` | User-supplied |

The client uses raw `fetch` (no SDK) — ~140 lines across all providers.

### 6.2 `chat.ts` interface

```ts
export interface ChatOptions {
  model?: string;                    // default from provider config
  apiKey: string;
  provider?: LlmProvider;           // 'mistral' | 'nvidia' — default 'mistral'
  temperature?: number;
  responseFormat?: 'json';
  signal?: AbortSignal;
  maxTokens?: number;
}

export async function chat(messages: Message[], opts: ChatOptions): Promise<ChatResponse>;
```

Internals:
- Reads `provider` from `ChatOptions`, resolves config via `getProviderConfig(provider)`.
- Dynamic `baseUrl`/`model` based on provider.
- When `requiresApiKey === false` (default provider), the `Authorization` header is omitted from the fetch call.
- Retry loop: tries `defaultModel` then `fallbackModel` (if default fails with 429/5xx).
- Each model attempt retries up to **3 times** with exponential backoff: `1s × 2^attempt`.
- 60s timeout via `AbortSignal.timeout` merged with user's cancel signal.
- On 401/403 throw `AuthError`; on rate-limit throw `RateLimitError`; on network failure throw `NetworkError`.
- Returns `{ content: string, model: string, usage?: { promptTokens, completionTokens, totalTokens } }`.

### 6.3 Provider config

`src/lib/llm/providers.ts` defines per-provider `ProviderConfig`:

```ts
export interface ProviderConfig {
  name: LlmProvider;
  label: string;
  apiBase: string;
  defaultModel: string;
  fallbackModel: string;
  gradingModel: string;        // cheaper model used for grading
  requiresApiKey: boolean;     // false for the default proxy provider
  apiKeyLabel: string;
  apiKeyHint: string;
  apiKeyPlaceholder: string;
  signupUrl: string;
}
```

Helper functions `getApiBase(provider)` and `getGradingModel(provider)` allow the grading pipeline to use the provider's designated grading model without hardcoding.

### 6.4 Settings storage

- `apiKey` — localStorage `quizify:apiKey` (plaintext, in browser only).
- `jinaToken` — localStorage `quizify:jinaToken`.
- `persona` — localStorage `quizify:persona`.
- `provider` — localStorage `quizify:provider` (`'default' | 'mistral' | 'nvidia'`).
- `theme` — localStorage `quizify:theme`.

Why API key in localStorage not IndexedDB: simpler sync reads across the app, smaller, fine for a non-sensitive local-only key.

### 6.5 Prompt skeletons

**Outline** (system):
```
You are an expert curriculum designer. Given a source and a learner profile,
produce {N} concepts the learner must understand.

Learner profile: {personaDescription}

Source URL: {url}
Source content:
"""
{truncatedJinaContent  up to ~6000 tokens}
"""
(if Jina failed): "Source could not be retrieved. Use your knowledge 
                           of the topic the URL points to: {hostname}."

Return STRICT JSON only:
{
  "concepts": [
    { "title": "...", "oneLiner": "..." }
  ]
}
```

The persona description map:

```ts
const personaDescription: Record<Persona, string> = {
  curious:       "A curious beginner with no prior exposure. Use simple language and everyday analogies.",
  student:       "A formal student preparing for exams. Use textbook depth and exam-style framing.",
  professional:  "A working professional learning this for practical application. Use applied scenarios and business framing.",
  expert:        "An expert. Be terse, technical, and probe edge cases.",
};
```

**Concept** (system):
```
You are explaining one concept to a {personaDescription} learner. 
Return STRICT JSON:
{
  "title": "<title>",
  "explanation": "2-4 sentences in plain language",
  "example": "A concrete example from real life",
  "sourceReference": "A 1-line quote from the source OR the literal string 'from model knowledge'"
}
```

**Quiz** (system): picks format at random pre-call. JSON output:
```ts
{
  multipleChoice: { "prompt": "...", "options": ["A","B","C","D"], "correctAnswer": "B", "rationale": "1-2 lines tied to the concept" },
  trueFalse:      { "prompt": "Statement: ...",   "options": ["True","False"], "correctAnswer": "True", "rationale": "..." },
  shortAnswer:    { "prompt": "Answer in <= 12 words: ...", "correctAnswer": "<idealAnswer>", "rationale": "..." },
  freeText:       { "prompt": "Explain in your own words: ...", "correctAnswer": "<idealAnswer>", "rationale": "..." },
  fillBlank:      { "blankedSentence": "... ____ ...", "correctAnswer": "...", "acceptableAnswers": ["synonyms..."], "rationale": "..." },
  ordering:       { "prompt": "Put these in order", "items": ["shuffled..."], "correctAnswer": "<comma-joined expected order>", "rationale": "..." },
}
```

For short/free text we do **not** grade locally — on submit we defer to the grading LLM call (§8.5).

**Summary** (system):
```
Given the list of concepts (titles + one-liners), produce:
{
  "recap": ["4-6 bullets capturing the strongest insights"],
  "finalQuiz": [5-8 mixed-format questions, each as in the Quiz schema]
}
```

The summary quiz picks formats to *mix* deliberately (e.g. exactly one of each format if 6 questions, remainder MCQ).

**Grade** (system):
```
You are grading a learner's answer to a quiz question about "{conceptTitle}".
Question: "{prompt}"
Learner's answer: "{givenAnswer}"
Ideal answer: "{idealAnswer}"

Return STRICT JSON:
{
  "grade": "correct" | "partial" | "incorrect",
  "rationale": "1-2 lines tied to the concept.",
  "idealAnswer": "<canonical ideal short answer>"
}
```

### 6.6 Token economics — input truncation

- Jina content is by far the biggest input. Cap at **~6000 tokens** input (≈24k chars) by paragraph-aware truncation: keep first 5 paragraphs + last paragraph + headings.
- Use `tiktoken`-equivalent? **No** — too heavy. Use a simple char counter with a `maxCharsPerSource = 24000` heuristic. Mistral tokenizer is close enough to char-based for truncation purposes.
- Outline prompt includes all source text + persona description; concept prompt includes only the relevant outline item + a 200-char source excerpt (the top of the source).
- Each individual call sees only what it needs.

---

## 7. URL fetching (r.jina.ai Reader)

### 7.1 Resilience strategy

For zero-cost + zero-infra we depend on free public proxies. They all rate-limit (mostly per-IP, anonymous tier). Our approach combines three mitigations:

- **Strategy A — multi-proxy fallback chain**: try Jina first, silently fall back to allorigins → corsproxy → LLM-knowledge.
- **Strategy B — optional Jina bearer token**: a free Jina API key (one click at `jina.ai/apikey`) lifts the 20 RPM anonymous cap. Surfaced as an optional Settings field.
- **Strategy C — IndexedDB content cache** keyed by `sha256(url)`, TTL 24h. Repeat views of a saved canvas skip the network entirely.

Each fetch costs ~1 Jina hit per canvas, and LLM calls (sequential, ~12 per canvas with combined detail+quiz) don't touch the proxy tier, so even the anonymous tier is well within limits for normal use. The fallback chain covers NAT-shared IPs and bursts.

### 7.2 IndexedDB source cache (new store)

Add to the schema in §5.1:

| Store | Key | Fields |
|---|---|---|
| `sourceCache` | `sha256(url)` | `url, content, fetched, hostname, fetchedAt, ok` |

- TTL: hard-cap entries at 24h (drop on read if older).
- Warm-cached: when loading a saved session, we never re-fetch — `session.url` lookup hits the cache first.
- Cache invalidation: a "Refresh source" affordance on the canvas top right (small icon) deletes the cache entry for the session's URL and re-runs the pipeline (post-MVP, *not* in v1).

### 7.3 `fetchSourceContent.ts` with fallback chain

```ts
export interface SourceResult {
  content: string;
  fetched: boolean;     // true if any real text came back
  hostname: string;
  source: 'jina' | 'allorigins' | 'corsproxy' | 'cors-eu' | 'cache' | 'llm-knowledge';
}

const PROXY_TIMEOUT_MS = 5000;

interface FetchSourceOpts {
  jinaToken?: string;            // optional, from settings
  signal?: AbortSignal;
  cache?: IDBSourceCache;        // injected; tests pass a fake
}

export async function fetchSourceContent(
  rawUrl: string,
  opts: FetchSourceOpts = {}
): Promise<SourceResult> {
  const url = normalizeUrl(rawUrl);
  const hostname = hostnameOf(url);

  // 1. cache
  const cached = await opts.cache?.get(sha256(url));
  if (cached && Date.now() - cached.fetchedAt < 24 * 3600 * 1000) {
    return { ...cached, source: 'cache' };
  }

  // 2. Jina (with optional bearer)
  const jina = await tryJina(url, opts.jinaToken, opts.signal);
  if (jina.fetched) {
    await opts.cache?.set(sha256(url), { url, ...jina, fetchedAt: Date.now() });
    return { ...jina, hostname, source: 'jina' };
  }

  // 3. allorigins (raw HTML) → readability-stripped in-browser
  const ao = await tryAllOrigins(url, opts.signal);
  if (ao.fetched) {
    const stripped = stripHtml(ao.content);
    await opts.cache?.set(sha256(url), { url, content: stripped, fetched: true, fetchedAt: Date.now() });
    return { content: stripped, fetched: true, hostname, source: 'allorigins' };
  }

  // 4. corsproxy (raw HTML)
  const cp = await tryCorsProxy(url, opts.signal);
  if (cp.fetched) {
    const stripped = stripHtml(cp.content);
    await opts.cache?.set(sha256(url), { url, content: stripped, fetched: true, fetchedAt: Date.now() });
    return { content: stripped, fetched: true, hostname, source: 'corsproxy' };
  }

  // 5. cors.eu (raw HTML)
  const ce = await tryCorsEu(url, opts.signal);
  if (ce.fetched) {
    const stripped = stripHtml(ce.content);
    await opts.cache?.set(sha256(url), { url, content: stripped, fetched: true, fetchedAt: Date.now() });
    return { content: stripped, fetched: true, hostname, source: 'cors-eu' };
  }

  // 6. final fallback: LLM knowledge (no body content, pipeline handles it)
  await opts.cache?.set(sha256(url), { url, content: '', fetched: false, fetchedAt: Date.now() });
  return { content: '', fetched: false, hostname, source: 'llm-knowledge' };
}

const tryJina = async (url: string, token: string | undefined, signal?: AbortSignal) => {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'markdown',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      signal: anySignal(signal, AbortSignal.timeout(PROXY_TIMEOUT_MS))
    });
    if (!res.ok) return { content: '', fetched: false };
    const text = await res.text();
    return { content: text ?? '', fetched: text.length > 200 };
  } catch { return { content: '', fetched: false }; }
};

// tryAllOrigins, tryCorsProxy, tryCorsEu follow the same pattern
// with their respective URL templates:
//   allorigins: https://api.allorigins.win/raw?url=<encodeURIComponent(url)>
//   corsproxy:  https://corsproxy.io/?url=<encodeURIComponent(url)>
//   cors-eu:    https://cors.eu.org/<url>
```

- `anySignal(...signals)` merges multiple AbortSignals into one (combine user-cancel with per-call timeout).
- `stripHtml(html)` uses `DOMParser` to drop `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`, `<aside>`, then collapses whitespace and returns the body's `textContent`. ~30 lines. No readability-lib dependency (we'd rather have slightly noisy text than a 50kb dep).
- The banner copy on the canvas depends on `result.source`:
  - `'cache'` → no banner (silent).
  - `'jina'` → no banner.
  - `'allorigins' | 'corsproxy' | 'cors-eu'` → subtle *"Source fetched via fallback proxy — content may be noisy."*
  - `'llm-knowledge'` → *"Couldn't read the URL — concepts generated from model knowledge."* (already spec'd)

### 7.4 Settings sheet — optional Jina token

Add a Jina API key field to `SettingsSheet.tsx`:

```
LLM API key       [ ******** ]  (show)   ← existing, required
Provider          ○ Mistral  ● NVIDIA   ← existing
Jina Reader key   [ optional ]  (show)  ← new, optional, lifts 20 RPM limit
                                  "Get a free key at jina.ai/apikey"
```

- Stored in `localStorage` key `quizify:jinaToken` (parallel to `quizify:apiKey`).
- Empty by default — anonymous tier is the baseline.
- Sent as `Authorization: Bearer <token>` only when present.
- The settings sheet explains in a single line: *"Falls back automatically if Jina is rate-limited."*

### 7.5 Privacy note for README (updated)

Update the privacy section to:

> - The URL you paste is sent to r.jina.ai (and, only on Jina failure, to one of allorigins / corsproxy / cors.eu.org) for content retrieval. These are third parties. If you provide a Jina API key it's sent only to Jina as a bearer token.
> - Your API key is sent only to the selected provider's endpoint (api.mistral.ai or integrate.api.nvidia.com). It never touches any other service.
> - All other data (your sessions, notes, quiz scores) lives only in your browser's IndexedDB.
> - We have no server, no database, no analytics. Nothing leaves your browser except the two items above.

---

## 8. Quiz interaction & grading

### 8.1 Per-format UI affordance

| Format | Component | Grading |
|---|---|---|
| `multipleChoice` | radio list, Submit | exact match to `correctAnswer` |
| `trueFalse` | two pill buttons, Submit | exact match |
| `shortAnswer` | text input, Submit | LLM grade call (§8.5) |
| `freeText` | textarea, Submit | LLM grade call |
| `fillBlank` | inline input in sentence, Submit | case-insensitive fuzzy: `acceptableAnswers` ∪ `{correctAnswer}` includes (normalized) `given` |
| `ordering` | draggable list, Submit | ordered by index compared to expected |

### 8.2 Local grading path

For locally graded formats (`multipleChoice`, `trueFalse`, `fillBlank`, `ordering`), no LLM call is made on submit. The `rationale` from generation time is shown alongside the correct answer. This is the cheapest path and most quizzes go here.

### 8.3 LLM grading path

For `shortAnswer` and `freeText`, on submit we POST to the selected LLM provider with the grade prompt (§6.5). Show a small inline spinner ("Grading…"). On 401, fall back to local fuzzy grading (`given.trim().toLowerCase() === ideal.trim().toLowerCase()` plus length check) and toast "Couldn't reach the grader — used rough local grading."

### 8.4 Attempt history & state badge logic

```
attempts.length === 0           → 'untested'
best grade === 'correct'        → 'correct'
best grade === 'partial'        → 'inProgress' (warning badge)
worst grade === 'incorrect' && best grade === 'incorrect' → 'incorrect' (danger badge)
last attempt within last 90 days with nodename contains 'concept'         → 'mastered' if best === 'correct' ever
```

The mastery mapping lives in `shared/types.ts:computeState(attempts)`.

### 8.5 Summary quiz UX

The summary node's `finalQuiz` is shown **sequentially** (one question at a time) with `[Prev] [Next]` and a `3 / 8` counter. After the last answer, the `results` panel replaces the question view with the mastery %, per-concept breakdown (links scroll canvas to the concept node), and `[Retake all]` / `[New canvas]` buttons.

`[Retake all]` clears all attempts for the finalQuiz's questions (but not per-concept quiz attempts) and re-renders the first question.

---

## 9. Styling system

### 9.1 CSS architecture

- **Tailwind not used** in v1 — the design spec is token-heavy and component-scoped; a small CSS file with custom properties is lighter and aligns with the "calm/minimal" principle. (We revisit if v1.1 adds many form components.)
- **Style authoring**: `.module.css` per component + a single `tokens.css` exporting CSS variables from `design_spec §3.1/§3.2`.
- Tokens are scoped to `:root` (light by default) and overridden under `[data-theme="dark"]`.

### 9.2 Fonts

Self-host Google Fonts in `public/fonts/` to avoid Google Fonts CDN network requests and privacy concerns (perf + UX win, no cost):

```
public/fonts/Caveat-Regular.woff2
public/fonts/Caveat-Bold.woff2
public/fonts/Inter-Regular.woff2
public/fonts/Inter-Medium.woff2
public/fonts/Inter-SemiBold.woff2
public/fonts/JetBrainsMono-Regular.woff2
```

Download the woff2 files from Google Fonts (using a one-off script like `fontsource`), commit them, and `@font-face` in `styles/fonts.css`. This adds ~150kb to the static deploy (cached permanently on CDN).

### 9.3 Wiggly edges

The `WigglyEdge.tsx` React Flow custom edge component renders an SVG path. Approach:

1. Use `roughjs` (`"roughjs": "^4.6.6"` — add to deps) to draw a freehand line between `sourceX, sourceY` and `targetX, targetY`.
2. Memoize the path string per (source, target) so it's stable across re-renders — re-generating the wiggly per render looks jittery.
3. Stroke uses `currentColor`; activated edges (hovered / focused) render with accent — pos `--accent`.
4. On wide spanning lines (e.g. summary node spanning columns) the wiggly gets slightly more curved to feel natural.

The component is ~80 lines.

---

## 10. State management

- No Redux. **Zustand** (`"zustand": "^4.5.5"`) is the right size: 1kb, no provider boilerplate, devtools built-in. Stores:
  - `useSessionsStore` — list, current id, CRUD operations wrapping `sessionsDb.ts`.
  - `useSettingsStore` — apiKey, persona, theme.
  - `useGenerationStore` — current pipeline status, errors, cancellation controller.
  - `useCanvasStore` — *thin* React Flow state wrapper; we use React Flow's own `useNodesState` / `useEdgesState` directly inside `CanvasView.tsx`, and only mirror critical paths into Zustand for cross-component events (e.g. "node focus requested from minimap").

- React Query / TanStack Query **not needed**. We're not caching server data per se; the pipeline is one-shot mutations, not queries. Generation uses our own Promise orchestration with `AbortController`.

Add `"zustand": "^4.5.5"` to deps.

---

## 11. Performance & bundle budgets

| Asset | Budget | Reason |
|---|---|---|
| Initial JS (gzipped) | < 250kb | React + React Flow + app code + idb + zustand |
| Initial CSS | < 30kb | tokens + reset + canvas |
| Fonts | ~150kb woff2 | self-hosted |
| Total first paint | < 500kb transferred | Cached forever after |
| Time-to-interactive (3G) | < 4s | Cloudflare Pages CDN + static |
| React Flow node render | < 16ms each | memoization required on every node component |

Mitigations:
- React Flow is split-loaded only when CanvasView mounts (route-level lazy).
- `roughjs` (~30kb gzipped) is imported only by WigglyEdge; thin edge is bundled with CanvasView anyway.
- WelcomeModal/PersonaQuizGeneration code-paths live eagerly (typical first run).
- An LLM SDK would push us to ~350kb; the raw fetch approach keeps us under 250kb.
- Every node component is wrapped in `React.memo` with `areEqual` comparing only the `data` field (React Flow bumps `selected`/`position` independently — we don't want to re-render on transient state).

---

## 12. Forward-compatible hooks for post-MVP

Even in MVP we keep these boundaries clean (costs nothing extra):

1. `fetchSourceContent` returns a `Source[] {... }` interface ready for `{ type: 'topic' | 'file' | 'book' }` post-MVP.
2. **Multi-provider already implemented** — `chat.ts` is provider-agnostic and the `LlmProvider` type in `providers.ts` makes adding OpenAI/Anthropic a one-file change.
3. The `scores{}` map on Session already stores `best`/`attempts` per question — an SRS scheduler can plug in unchanged.
4. The `nodes[]` slot in Session is server-mirroring-ready — a future `/sessions` endpoint mirrors this shape.
5. `populateFromSource(content)` lets us later add "paste the text directly" as an alternative input without touching the pipeline below.

---

## 13. Testing strategy

### 13.1 Unit tests (vitest) — must-have scope

- `pipeline.ts` layout logic — verify positions for n=1..15 concepts, summary placement at chain end, spacing between nodes.
- `parsers.ts` — feed malformed JSON, missing fields, extras, comments; verify lenient extraction works.
- `prompts/*.ts` — snapshot tests of constructed prompt strings for two personas and two source types (fetched vs not).
- `llmClient.ts` — fetch mocked; cover 200 happy path, 401 → AuthError, 429 retry path, 5xx retry path, abort signal task.
- `fetchSourceContent.ts` — mocked fetch, cover ok, 4xx, network error, empty body, timeout.
- `useQuizAnswer.ts` — local grading logic for all 4 locally-graded formats; `computeState(attempts)` for state badge transitions.
- `sessionsDb.ts` — create, list, update, delete operations on an IndexedDB shim (use `fake-indexeddb`).
- `useToast.ts` — basic enqueue/dequeue behavior.

### 13.2 Component tests (testing-library)

- `WelcomeModal` — persona select updates store; API key visibility toggle; URL field enables Submit when both present; Enter triggers callback.
- `QuizInteraction` per format — submit disabled until answer provided; correct/wrong badge shows; grade spinner correctly toggles for LLM-graded formats.
- `SummaryNode` results screen — mastery math correct for varied input.
- `CanvasView` — small canvas with three nodes verifies auto-layout, draggable, Reset Layout.

### 13.3 E2E

Out of scope for MVP. API key requirement makes E2E brittle (we'd need a key in CI). Document manual smoke steps in `README.md`.

### 13.4 Lint/format

- ESLint with `@typescript-eslint/recommended` + `react/recommended` + `react-hooks/recommended`.
- Prettier with single quotes, semi true (CU spec preference), print width 100.
- `npm run typecheck && npm run lint && npm test` must pass before deploy (pre-commit hook optional but recommended via `lint-staged`).

Run verification commands after the MVP build; failing commands are blocking:
```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

---

## 14. Build & deployment

### 14.1 Vite config (`vite.config.ts`)

- `@vitejs/plugin-react` enabled.
- `build.target = 'es2022'`.
- `build.target` excludes IE; Safari <14 fine.
- `manualChunks`: split `react-flow` + `roughjs` out of main bundle; the welcome/settings screens don't need it.
- `define`: inject `__APP_VERSION__` from `package.json` for the About sheet.

### 14.2 Cloudflare Pages deploy

1. Connect the repo to Cloudflare Pages.
2. Framework preset: **Vite**.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Environment variables: `MISTRAL_API_KEY` required for the default provider's Pages Function (set in Cloudflare Pages dashboard). Not needed for Mistral/NVIDIA direct use.
6. `_redirects` in `public/_redirects` (copy to `dist/_redirects` via build) ensures SPA deep links load.

### 14.3 Local development

```bash
npm install
npm run dev                  # http://localhost:5173
npm run typecheck
npm run lint
npm test -- --run            # unit + component tests
```

A `.env` file with `MISTRAL_API_KEY` is required to use the default provider via the Vite dev proxy at `/api/chat`. For Mistral/NVIDIA providers, the API key still comes from the Welcome modal. Local dev: `MISTRAL_API_KEY=... npm run dev` or populate `.env` from `.env.example`.

### 14.4 README requirements

- Stack & rationale (one paragraph).
- Local dev commands.
- Build & deploy docs linking to Cloudflare Pages.
- Privacy note: URL → r.jina.ai, API key → selected LLM provider (browser → provider direct for Mistral/NVIDIA; default provider proxies through `/api/chat` on Cloudflare Pages using a server-side key, so your prompts pass through our infrastructure).
- Token-cost estimate per canvas (so users aren't surprised).
- Troubleshooting: API key errors, fetch failures, partial node failures with retry.

---

## 15. Implementation order — recommended sequence

The implementation is intentionally staged to keep a buildable artifact end-to-end as early as possible.

### Phase 0 — Bootstrap (1-2h)
- `npm create vite@latest` React+TS, install deps.
- ESLint, Prettier, base path aliases.
- Tokens CSS, fonts, reset.

### Phase 1 — Welcome + API key + persona (2-4h)
- WelcomeModal component + PersonaCard grid.
- useSettingsStore with apiKey + persona + theme.
- LocalStorage/IndexedDB for settings.
- Wire "Generate" submit to log the payload (no real call yet).

### Phase 2 — LLM client + Jina fetch + outline (4-6h)
- `llmClient.ts`, `fetchSourceContent.ts`.
- `prompts/outline.ts` + lenient parser.
- On "Generate", show a debug panel rendering the outline JSON.

### Phase 3 — Persistence + sessions shell (3h)
- IndexedDB setup, sessionsDb, sessions list dropdown.
- Create empty session on Generate; auto-name from hostname.
- Switch between sessions.

### Phase 4 — Canvas scaffold (4-6h)
- React Flow integration.
- ConceptNode + placeholder data (manual mock).
- WigglyEdge + horizontal chain layout.
- Just render mock concepts into a grid.

### Phase 5 — Generation pipeline end-to-end (6-8h)
- Hook up pipeline.ts: outline → for each concept: concept call + quiz call → emit node + persist.
- Streaming status chip; Cancel via AbortController.
- Error placeholders + Retry on failed nodes.

### Phase 6 — Quiz interactions (6-8h)
- All six format components.
- Local grading paths.
- LLM grading for shortAnswer/freeText.
- Attempt history + state badges.

### Phase 7 — Summary node + final quiz (4-6h)
- Summary generation call.
- Sequential quiz UI, results panel, mastery calc, links back to concept nodes.

### Phase 8 — Notes + settings + theme (3h)
- NoteNode creation, paperclip connector to concept.
- SettingsSheet: persona re-pick, API key, theme toggle.

### Phase 9 — Mobile focus view + minimap (4-6h)
- `<640px` breakpoint branch in CanvasView.
- One-node focus UI with horizontal swipe.
- Map overlay button + minimap rendering.

### Phase 10 — Polish & test (4-6h)
- Animations (stream-in, badge bounce, count-up).
- Pull tab, hint copy, error states polish.
- Run `typecheck / lint / test` and fix fallout.
- README.

**Total estimate: 40-60 hours of focused engineering for a working v1.**

---

## 16. Open questions / risk list

- [ ] **r.jina.ai rate limits / uptime** — if Jina throttles, we silently fall back to LLM knowledge. We should add a fallback chain: Jina → if-other-public-proxy-configured-in-settings → LLM knowledge. Defer to v1.1.
- [ ] **LLM model availability** — model aliases update over time; consider freezing actual model tags on production builds to avoid behavior drift.
- [ ] **Quiz format distribution** — currently random per node. After validation, we may want to bias the per-concept quiz to alternate formats to ensure variety (no canvas should have all `trueFalse`). Post-MVP.
- [ ] **Token estimates for grading** — confirm the provider's designated grading model handles grade prompts reliably; if not, fall back to the main generation model.
- [ ] **Cross-session alarm when localStorage API key cleared** — if user clears browser data, we should show the welcome modal on next launch. Already handled by "no apiKey → show welcome".
- [ ] **PDF source UX** — r.jina.ai handles PDFs via inline extraction; verify output quality on a test set of 3 PDFs (research paper, white paper, e-book chapter) before launch.
- [ ] **CSP** — set a strict Content-Security-Policy header in `_headers` (Cloudflare Pages supports per-path headers) allowing only the selected LLM provider endpoints and r.jina.ai as connect-src. **Strong recommendation for v1**, near-zero cost.
- [ ] **Bundle size of roughjs** — confirm <40kb after gzip; if it balloons, hand-roll a simpler wiggly SVG path generator (a quadratic bezier with seeded pseudo-random control points).

---

## 17. Acceptance criteria — MVP is done when

✅ A new visitor with a fresh API key + URL can:
1. See the welcome modal, pick a persona and provider (Default / Mistral / NVIDIA), paste a key if required, paste a URL, click Generate.
2. See nodes stream onto the canvas (10-15 concepts + per-concept quizzes + 1 summary quiz node) in a horizontal chain layout.
3. Click any quiz node, answer it, see immediate inline feedback with rationale.
4. Take the final summary quiz sequentially, see mastery %.
5. Refresh and find their canvas restored (no session loss), can rename or delete it.
6. Switch theme via Settings sheet (Auto/Light/Dark).
7. Open on mobile and use the one-node focus + map toggle.
8. Have a failed node show Retry; clicking Retry regenerates that single node.

✅ Cost
9. Zero cost when using user-supplied Mistral/NVIDIA keys. The default provider requires a server-side Mistral API key (cost borne by the Quizify project, no user cost).

✅ Quality
10. `npm run typecheck && npm run lint && npm test -- --run && npm run build` all pass.
11. Initial gzipped JS < 250kb.
12. Lighthouse score ≥ 90 (Performance / Accessibility / Best Practices / SEO passive) on a static welcome screen.

---

*End of implementation spec.*
