# Quizify GitHub Issues — Master Reference

> Maps [`docs/roadmap.md`](roadmap.md) to all GitHub issues across 6 milestones.
> Last updated: 2026-07-28
> Total issues: 70+ across all phases

---

## Milestones

| # | Milestone | Due | Issues |
|---|-----------|-----|--------|
| 1 | Phase 0 — Secure and Focus | 2026-08-10 | #83–#96, #162–#165, #170, #172, #182, #184, #185 (21) |
| 2 | Phase 1 — Trustworthy First Win | 2026-10-01 | #97–#116, #166–#169, #171, #183 (26) |
| 3 | Phase 2 — Create the Return Loop | 2026-12-01 | #117–#129, #173, #174, #178 (16) |
| 4 | Phase 3 — Earn Adaptive Differentiation | 2027-03-01 | #130–#141, #175, #179 (13) |
| 5 | Phase 4 — Build Distribution into the Artifact | 2027-05-01 | #142–#149, #176, #180 (10) |
| 6 | Phase 5 — Monetize Retained Value | 2027-08-01 | #150–#161, #177, #181 (14) |

---

## Phase 0 — Secure and Focus (Weeks 1–2)

**Exit gate:** The team can measure one complete learning loop, attribute cost, and safely expose the beta.

### Stories
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #83 | [Story] Phase 0: Secure API gateway for beta exposure | High | `phase-0` `priority-high` `story` |
| #84 | [Story] Phase 0: Instrument product analytics funnel | Medium | `phase-0` `priority-high` `story` |
| #85 | [Story] Phase 0: Evaluation baseline and prompt governance | Medium | `phase-0` `priority-high` `story` |

### Day 1 — Establish Truth
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #164 | [ANA-1] Implement full 33-event analytics taxonomy | Medium | `phase-0` `priority-critical` `type:analytics` |
| #165 | [COST-1] Add per-request token cost tracking + budget alert | Medium | `phase-0` `priority-critical` `type:analytics` |
| #92 | [Task] Wire activation funnel events in App flow | Low | `phase-0` `priority-high` `task` |
| #94 | [Task] Document cost/latency baselines before prompt changes | Low | `phase-0` `priority-high` `task` |

### Day 2 — Secure Highest-Risk Surfaces
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #162 | [SEC-1] Harden /api/chat: schema validation, body limits, and auth | High | `phase-0` `priority-critical` `type:security` |
| #163 | [SEC-2] Harden /api/fetch: SSRF protection, redirect limits, MIME filtering | High | `phase-0` `priority-critical` `type:security` |
| #86 | [Task] Harden /api/chat: allowlist, quotas, rate limits, spend ceiling | High | `phase-0` `priority-high` `task` |
| #87 | [Task] Harden /api/fetch: SSRF, extraction limits, readable content | High | `phase-0` `priority-high` `task` |
| #88 | [Task] Gateway security acceptance tests | Medium | `phase-0` `priority-high` `task` |

### Day 3-4 — Define Learning Loop + Quality
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #89 | [Task] Implement full analytics event taxonomy | Medium | `phase-0` `priority-high` `task` |
| #90 | [Task] Add correlation IDs and token cost attribution | Medium | `phase-0` `priority-high` `task` |
| #91 | [Task] Integrate PostHog (or equivalent) analytics sink | High | `phase-0` `priority-high` `task` |
| #93 | [Task] Version prompts/schemas and scaffold eval corpus | Medium | `phase-0` `priority-high` `task` |

### Day 5-10 — Observe, Decide, Gate
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #95 | [Task] Phase 0: Student observations and design partner recruitment | Low | `phase-0` `priority-high` `task` |
| #96 | [Task] Phase 0: Naming sprint and rebrand prep | Low | `phase-0` `priority-high` `task` |
| #170 | [TTS-1] Fix TTS: ensure Web Speech fallback, remove unavailable claims | Low | `phase-0` `priority-high` `type:bug` |
| #172 | [PLAN] Phase 0 — Day 1-10 Execution Plan | Low | `phase-0` `priority-critical` `task` |
| #182 | [LATENCY-1] Adaptive concurrency: detect rate-limit throttling and back off to 1 | Low | `phase-0` `priority-high` `type:performance` |
| #185 | [LATENCY-2] Summary blocks "lesson ready" notification by 5-15s | Low | `phase-0` `priority-high` `type:performance` |
| #184 | [LATENCY-4] Add per-concept latency telemetry to pipeline progress | Low | `phase-0` `priority-high` `type:performance` |
| #183 | [LATENCY-3] Full nodes array persisted on every stream tick (200ms) | Medium | `phase-1` `priority-medium` `type:performance` |

---

## Phase 1 — Trustworthy First Win (Months 1–2)

**Exit gate:** Trust, activation, latency, and cost targets hold for two consecutive cohorts.

### Stories
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #97 | [Story] Phase 1: Multi-format source intake | High | `phase-1` `priority-high` `story` |
| #98 | [Story] Phase 1: Citations and trust layer | High | `phase-1` `priority-high` `story` |
| #99 | [Story] Phase 1: Diagnostic-first five-minute learning path | High | `phase-1` `priority-high` `story` |
| #100 | [Story] Phase 1: Activation hardening | Medium | `phase-1` `priority-high` `story` |

### Sprint 2 — Source Ingestion (Weeks 3-4)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #167 | [SRC-1] Add PDF and pasted-text input modalities | High | `phase-1` `priority-high` `type:feature` |
| #101 | [Task] PDF upload intake with extraction preview | High | `phase-1` `priority-high` `task` |
| #102 | [Task] Paste text intake with extraction preview | Low | `phase-1` `priority-high` `task` |
| #103 | [Task] Source preview with editable exclusions and confidence | Medium | `phase-1` `priority-high` `task` |
| #104 | [Task] Source hash and normalized source/chunk structures | Low | `phase-1` `priority-high` `task` |

### Sprint 3 — Citations and Quality (Weeks 5-6)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #168 | [CITE-1] Populate sourceReference end-to-end and render citations | High | `phase-1` `priority-high` `type:feature` |
| #105 | [Task] Passage-level citation schema and pipeline population | High | `phase-1` `priority-high` `task` |
| #106 | [Task] Show evidence UI and generated-fallback labeling | Medium | `phase-1` `priority-high` `task` |
| #107 | [Task] Report a problem flow for generated content | Medium | `phase-1` `priority-high` `task` |
| #108 | [Task] Pipeline quality checks: citation, answerability, duplication | High | `phase-1` `priority-high` `task` |

### Sprint 4 — First-Value Speed (Weeks 7-8)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #109 | [Task] Reorder pipeline for diagnostic-first flow | Medium | `phase-1` `priority-high` `task` |
| #110 | [Task] Stream first practiceable item during background generation | High | `phase-1` `priority-high` `task` |
| #111 | [Task] Partial-result recovery and generation idempotency | High | `phase-1` `priority-high` `task` |
| #112 | [Task] Cache normalized sources and generated artifacts | Medium | `phase-1` `priority-high` `task` |

### Sprint 5 — Activation Hardening (Weeks 9-10)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #113 | [Task] Incorrect-answer remediation with changed retrieval | High | `phase-1` `priority-high` `task` |
| #114 | [Task] Mobile retry/skip recovery parity with desktop | Medium | `phase-1` `priority-high` `task` |
| #171 | [MOB-1] Add mobile retry/skip recovery for failed concepts | Medium | `phase-1` `priority-medium` `type:feature` |
| #115 | [Task] TTS: ship /api/tts or declaim server TTS | Low | `phase-1` `priority-high` `task` |
| #116 | [Task] E2E test for first graded answer (mocked functions) | Medium | `phase-1` `priority-high` `task` |
| #169 | [QUIZ-1] Add evidence fields to Attempt type | Low | `phase-1` `priority-high` `type:feature` |
| #166 | [SCH-1] Fix spaced-review scheduler: completed concepts re-enter review | Medium | `phase-1` `priority-high` `type:scheduler` |

---

## Phase 2 — Create the Return Loop (Months 3–4)

**Exit gate:** Day-7 return and due-review completion meet targets. Scheduler deterministic, testable, inspectable. Anonymous work migrates without loss.

### Stories
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #117 | [Story] Phase 2: Exam goal setup and study planning | High | `phase-2` `priority-high` `story` |
| #118 | [Story] Phase 2: Spaced review scheduler and Today inbox | High | `phase-2` `priority-high` `story` |
| #119 | [Story] Phase 2: Magic-link auth and local-first cloud sync | High | `phase-2` `priority-high` `story` |
| #120 | [Story] Phase 2: Opt-in reminders and learning dashboard | Medium | `phase-2` `priority-high` `story` |

### Planning Hub
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #178 | [PLAN] Phase 2 — Exam goal, scheduler, auth, sync, reminders, dashboard | Low | `phase-2` `priority-high` `task` |

### Sprint 6 — Identity Foundation (Weeks 11-12)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #124 | [Task] Exam date, confidence, and study-time goal setup | Medium | `phase-2` `priority-high` `task` |
| #125 | [Task] Supabase magic-link authentication | High | `phase-2` `priority-high` `task` |
| #126 | [Task] Repository interfaces for local and cloud storage | High | `phase-2` `priority-high` `task` |
| #128 | [Task] Anonymous-to-account migration | High | `phase-2` `priority-high` `task` |

### Sprint 7 — Local-First Cloud Sync (Weeks 13-14)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #127 | [Task] Local-first sync queue with conflict rules | High | `phase-2` `priority-high` `task` |
| #173 | [SYNC-1] Sync state indicator and conflict resolution UI | Medium | `phase-2` `priority-high` `type:feature` |

### Sprint 8 — Concept Mastery & Scheduler (Weeks 15-16)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #121 | [Task] Fix learningProgress: completed concepts re-enter spaced review | Medium | `phase-2` `priority-high` `task` |
| #135 | [Task] Mastery state: stability, retrievability, next due, misconception tags | High | `phase-3` `priority-high` `task` |

### Sprint 9 — Today Review Inbox (Weeks 17-18)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #122 | [Task] Today review inbox with cap, snooze, and urgency grouping | High | `phase-2` `priority-high` `task` |

### Sprint 10 — Reminders & Dashboard (Weeks 19-20)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #129 | [Task] Opt-in email reminders and notification preferences | High | `phase-2` `priority-medium` `task` |
| #123 | [Task] Durable recall dashboard (not streaks) | Medium | `phase-2` `priority-medium` `task` |
| #174 | [DASH-1] Confidence calibration and durable recall computation | High | `phase-2` `priority-medium` `type:feature` |

---

## Phase 3 — Earn Adaptive Differentiation (Months 5–7)

**Exit gate:** Adaptive cohorts outperform static on 7-day recall. Quality regression detected, traced, and rolled back within one working day.

### Stories
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #130 | [Story] Phase 3: Concept-level knowledge model | High | `phase-3` `priority-high` `story` |
| #131 | [Story] Phase 3: Adaptive activity selection policy | High | `phase-3` `priority-high` `story` |
| #132 | [Story] Phase 3: Exam mode and targeted recovery plan | Medium | `phase-3` `priority-medium` `story` |
| #133 | [Story] Phase 3: Internal quality console and adaptive validation | High | `phase-3` `priority-high` `story` |

### Planning Hub
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #179 | [PLAN] Phase 3 — Knowledge model, adaptive policy, exam mode, quality console | Low | `phase-3` `priority-high` `task` |

### Sprint 11 — Adaptive Activity Policy (Weeks 21-22)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #134 | [Task] Attempt evidence schema (latency, hints, confidence, delayed context) | Low | `phase-3` `priority-high` `task` |
| #135 | [Task] Mastery state: stability, retrievability, next due, misconception tags | High | `phase-3` `priority-high` `task` |
| #136 | [Task] Adaptive policy rules for encoding/retrieval/transfer/spacing | High | `phase-3` `priority-high` `task` |

### Sprint 12 — Prerequisite Remediation (Weeks 23-24)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #138 | [Task] Prerequisite remediation when application fails | High | `phase-3` `priority-medium` `task` |
| #137 | [Task] Item variant generation and reuse controls | High | `phase-3` `priority-medium` `task` |

### Sprint 13 — Exam Mode (Weeks 25-26)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #139 | [Task] Exam mode session assembly from weak concepts | High | `phase-3` `priority-medium` `task` |

### Sprint 14 — Adaptive Validation (Weeks 27-28)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #141 | [Task] Adaptive vs static baseline experiment (7-day recall) | Medium | `phase-3` `priority-high` `task` |

### Sprint 15 — Quality Operations (Weeks 29-30)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #140 | [Task] Internal quality console (prompt/model/regression dashboard) | High | `phase-3` `priority-high` `task` |
| #175 | [EVAL-1] Staged rollout, rollback controls, and expanded evaluation corpus | High | `phase-3` `priority-high` `type:feature` |

---

## Phase 4 — Build Distribution into the Artifact (Months 8–9)

**Exit gate:** No private source leakage. Shared previews activate recipients at repeatable rate (>= 8%). Course groups justify complexity.

### Stories
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #142 | [Story] Phase 4: Read-only share links and clone for my exam | High | `phase-4` `priority-high` `story` |
| #143 | [Story] Phase 4: Private course groups and collaborative corrections | Medium | `phase-4` `priority-medium` `story` |
| #144 | [Story] Phase 4: Source-permitted public study pages | Medium | `phase-4` `priority-medium` `story` |

### Planning Hub
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #180 | [PLAN] Phase 4 — Share links, course groups, public study pages | Low | `phase-4` `priority-high` `task` |

### Sprint 16 — Private Sharing (Weeks 31-32)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #145 | [Task] Share link creation with source-safety inspection | Medium | `phase-4` `priority-high` `task` |
| #146 | [Task] Anonymous share preview and clone for my exam | High | `phase-4` `priority-high` `task` |

### Sprint 17 — Clone and Referral Loop (Weeks 33-34)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #147 | [Task] Clone lineage, deduplicated artifact reuse, referral attribution | High | `phase-4` `priority-medium` `task` |

### Sprint 18 — Private Course Cohorts (Weeks 35-36)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #148 | [Task] Private course groups with roles and moderation | High | `phase-4` `priority-medium` `task` |
| #176 | [SHARE-1] Moderation, version history, takedown, public indexing | High | `phase-4` `priority-medium` `type:feature` |

### Sprint 19 — Permitted Public Artifacts (Weeks 37-38)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #149 | [Task] Public study pages with takedown and indexing controls | High | `phase-4` `priority-medium` `task` |

---

## Phase 5 — Monetize Retained Value (Months 10–12)

**Exit gate:** Paid conversion, churn, gross margin, and durable recall healthy together. Generation cost below $0.20; gross margin above 75%.

### Stories
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #150 | [Story] Phase 5: Usage ledger and server-side entitlements | High | `phase-5` `priority-high` `story` |
| #151 | [Story] Phase 5: Stripe billing and subscription lifecycle | High | `phase-5` `priority-high` `story` |
| #152 | [Story] Phase 5: Paywall experiments and pricing research | Medium | `phase-5` `priority-medium` `story` |
| #153 | [Story] Phase 5: Unit economics optimization | High | `phase-5` `priority-high` `story` |

### Planning Hub
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #181 | [PLAN] Phase 5 — Entitlements, Stripe billing, unit economics | Low | `phase-5` `priority-high` `task` |

### Sprint 20 — Pricing Research and Entitlements (Weeks 39-40)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #154 | [Task] Usage ledger and server-side quota enforcement | High | `phase-5` `priority-high` `task` |
| #155 | [Task] Data export and deletion workflows | Medium | `phase-5` `priority-high` `task` |
| #158 | [Task] Paywall UI at generation boundary (never on due reviews) | Medium | `phase-5` `priority-medium` `task` |

### Sprint 21 — Billing (Weeks 41-42)
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #156 | [Task] Stripe Checkout and Customer Portal integration | High | `phase-5` `priority-high` `task` |
| #157 | [Task] Webhook idempotency and entitlement reconciliation tests | High | `phase-5` `priority-high` `task` |
| #177 | [BILL-1] Tax handling, multi-currency pricing, and receipt delivery | High | `phase-5` `priority-medium` `type:feature` |

### Post-Billing Optimization
| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #159 | [Task] Model routing to lowest-cost passing model per task | High | `phase-5` `priority-high` `task` |
| #160 | [Task] Source and artifact cache optimization | Medium | `phase-5` `priority-medium` `task` |
| #161 | [Task] Expand test matrix per roadmap definition of done | Low | `phase-5` `priority-medium` `task` |

---

## Label Reference

| Label | Color | Used In |
|-------|-------|---------|
| `priority-critical` | red | Phase 0 blockers (security, cost, analytics) |
| `priority-high` | dark red | Major features blocking the phase |
| `priority-medium` | yellow | Important but not blocking |
| `type:security` | dark red | Security vulnerabilities |
| `type:analytics` | green | Analytics instrumentation |
| `type:scheduler` | blue | Spaced review scheduling |
| `type:feature` | blue | New features |
| `type:bug` | red | Bug fixes |
| `type:security` | dark red | Security hardening |
| `phase-0` through `phase-5` | purple/green/blue | Phase membership |
| `story` | blue | Epic or user story |
| `task` | yellow | Implementable work item |

## New Issues (2026-07-28)

| Issue | Title | Complexity | Labels |
|-------|-------|-----------|--------|
| #182 | [LATENCY-1] Adaptive concurrency: detect rate-limit throttling and back off to 1 | Low | `phase-0` `priority-high` `type:performance` |
| #183 | [LATENCY-3] Full nodes array persisted on every stream tick (200ms) | Medium | `phase-1` `priority-medium` `type:performance` |
| #184 | [LATENCY-4] Add per-concept latency telemetry to pipeline progress | Low | `phase-0` `priority-high` `type:performance` |
| #185 | [LATENCY-2] Summary blocks "lesson ready" notification by 5-15s | Low | `phase-0` `priority-high` `type:performance` |

---

## Quick Links by Component

### Backend / Functions
- #86, #162 — `/api/chat` hardening
- #87, #163 — `/api/fetch` hardening
- #88, #157 — Security/webhook tests
- #115, #170 — TTS /api/tts audit
- #125 — Supabase magic-link auth
- #154 — Usage ledger
- #156, #177 — Stripe billing + tax

### Analytics & Cost
- #84, #89, #90, #91, #92, #164 — Analytics taxonomy + correlation
- #94, #165 — Cost baselines + budget
- #123, #174 — Learning dashboard metrics

### Pipeline & Quality
- #108 — Pipeline quality checks
- #109 — Diagnostic-first reorder
- #110, #111 — Streaming + idempotency
- #112 — Caching
- #140, #175 — Quality console + eval

### Scheduler & Mastery
- #121, #166 — Spaced review fix
- #122 — Today inbox
- #134, #135, #169 — Attempt evidence + mastery state
- #136, #137, #138 — Adaptive policy + remediation

### Source Intake
- #101, #102, #103, #104, #167 — PDF, pasted text, preview, hash

### Citations & Trust
- #105, #106, #107, #168 — Source references, evidence UI, reporting

### Mobile & Accessibility
- #113, #114, #171 — Mobile recovery
- #115, #170 — Reduced motion, TTS

### Sharing & Distribution
- #145, #146, #147 — Share links, clone, referral
- #148, #176 — Course groups, moderation
- #149 — Public pages, takedown
