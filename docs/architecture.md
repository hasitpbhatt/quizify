# Quizify Architecture

> Architectural reference for AI agents and contributors.

```mermaid
flowchart TD
    %% ── 1. USER INPUT ──
    subgraph "1. User Input"
        direction LR
        A[WelcomeModal] -->|URL/topic + persona + provider| B[App.tsx\nhandleGenerate]
    end

    %% ── 2. FETCH ──
    subgraph "2. Content Fetching"
        direction TB
        C[fetchSourceContent] --> D{Cache Hit?}
        D -->|Yes| E[Return cached content]
        D -->|No| F{Is URL?}

        F -->|Yes| G[raceProxies]
        F -->|No| H1[fetchSubjectFromLlm\nsubject]

        G -->|Dev| G1[Vite /__proxy?url=]
        G -->|Prod| G2[CF /api/fetch?url=]
        G1 -->|Server fetch + CORS: *| G3{OK + >200 chars?}
        G2 -->|Server fetch + CORS: *| G3
        G3 -->|Yes| H[Real article content]
        G3 -->|No| I[extractSubjectFromUrl]
        I --> J[fetchSubjectFromLlm\nfrom extracted subject]

        H1 --> K
        H --> K
        J --> K

        K[Validate ≥50 chars\nTruncate by paragraphs\nCache to IDB]
    end

    %% ── 3. OUTLINE ──
    subgraph "3. Outline"
        L[executePromptTask\noutlineTask] --> M[chat → LLM]
        M --> N[parseOutline]
        N --> O{Valid?\ntitle + concepts[]?}
        O -->|No| P{Retry < 2?}
        P -->|Yes| Q["Hint: 'Return ONLY\nvalid JSON'"] --> M
        P -->|No| R[Throw ParseError\n→ catch in App]
        O -->|Yes| S[OutlineData\n{title, summary, concepts}]
    end

    %% ── 4. PIPELINE ──
    subgraph "4. Pipeline"
        T[createSession → IDB\nsetPage('canvas')] --> U[runPipeline]

        U --> V[Phase 0\npushConceptShells\nplaceholder nodes]
        V --> W[Phase 1\nrunContentPhase\nparallel concepts]

        subgraph Per Concept
            P1[executePromptTask\ncontentTask]
            P1 --> P2[Update node +\ncreate quiz nodes +\nwiggly edges]
            P2 --> P3[persist via mutex]
        end

        W --> X[Phase 2\npushChainEdges\nlastQuiz→nextConcept]
        X --> Y[Phase 3\npushSummary\nrecap + final quiz\nnon-fatal, skipped for\nlow-RPM providers]
    end

    %% ── 5. CANVAS ──
    subgraph "5. Canvas & Interaction"
        Z[CanvasPage\nReactFlow renderer]
        Z --> Z1[Progression Gating\nvisible by concept index]
        Z --> Z2[Notebook Mode\nTTS + typing animation +\nquiz reveal on segment end]
        Z --> Z3[Quiz Interaction\nformat renderer +\ngrading + persist attempts]
        Z --> Z4[Mobile Focus View\nsingle-card navigation]

        Z1 --> Z5[Export\nJSON / Markdown / PNG]
    end

    %% Connections
    B --> C
    K --> L
    S --> T
    Y --> Z

    %% Error flow
    R --> ERR{Page state?}
    ERR -->|progress| ERR1[Show error + Go back]
    ERR -->|canvas| ERR2[Toast + keep partial nodes]
```

## Fetch Strategy (3 tiers)

```
Tier 1: IndexedDB cache ──┬── source_cache store, keyPath "url"
                           └── expires after 24h (cachedAt timestamp)

Tier 2: Server-side proxy ──┬── Dev: Vite middleware at /__proxy?url=
                            ├── Prod: Cloudflare Function at /api/fetch?url=
                            └── Both return Access-Control-Allow-Origin: *
                                → No CORS errors (server-to-server)

Tier 3: LLM knowledge ──┬── URL input and proxy fails:
                        │      extractSubjectFromUrl() extracts last path segment
                        │      e.g., /wiki/Photosynthesis → "Photosynthesis"
                        │      → fetchSubjectFromLlm() generates educational content
                        │
                        └── Topic input (non-URL):
                               fetchSubjectFromLlm() generates from scratch
```

## Why This Works

| Scenario | Outcome |
|----------|---------|
| Proxy works (Cloudflare/Vite) | Real article content → high-quality outline |
| Proxy fails for URL | Subject extracted from URL → LLM generates from knowledge → quality outline |
| Topic input (e.g., "gravity") | LLM generates from scratch directly → quality outline |
| No server backend | All proxy attempts fail → subject extraction + LLM fallback |

## Key Data Flow

```
Input ──► fetchSourceContent() ──► SourceResult.content
                                        │
                                        ▼
                              executePromptTask(outlineTask, content)
                                        │
                                        ▼
                              OutlineData.concepts[]
                                        │
                                        ▼
                              runPipeline(concepts)
                                        │
                                        ▼
                              { nodes: CanvasNode[], edges: CanvasEdge[] }
                                        │
                                        ▼
                              Zustand sessionStore (persisted to IndexedDB)
                                        │
                                        ▼
                              CanvasPage (ReactFlow render)
```

## Error Handling Layers

1. **LLM retries** — `chat.ts` retries 3× on 429/5xx with exponential backoff; `promptTask.ts` retries 1× on parse failure
2. **Pipeline per-concept** — failed concepts are caught and skipped (non-fatal), abort propagates
3. **Summary** — failure is caught and swallowed (canvas works without summary node)
4. **Error boundaries** — App root (reload), Canvas container (retry/home), per-node (nodeId+type), Quiz (close)
5. **App catch** — AbortError → silent return to welcome; other errors → shown on progress page or toast on canvas

## Store Architecture

```
settingsStore ──┬── apiKey, jinaToken, persona, theme, provider
                └── localStorage "quizify:*" keys

sessionStore ──┬── sessions[] + currentId
               └── IndexedDB via idb (db "quizify", v2)
                   ├── sessions (keyPath "id")
                   └── source_cache (keyPath "url")

notebookStore ──┬── notebookMode, ttsPlaying/Paused, currentSegmentNodeId
                └── completedTypingNodeIds Set
```
