# Quizify 12-Month Product Roadmap

> **Status:** Canonical product strategy (supersedes prior product/implementation/design specs and audits)
> **Last updated:** 2026-07-27
> **Audience:** Founders, contributors, and AI agents
> **Codename:** Quizify (public rebrand pending naming sprint in Phase 0)

This document is the single source of truth for product direction. Older root-level specs, audits, and plans that conflicted with this strategy have been removed.

## Strategic reset
- **Beachhead:** university students preparing for exams from lecture slides, readings, and notes in content-heavy subjects such as biology, psychology, history, and business. Expand to broader self-learning only after retention is proven.
- **Job to be done:** “Turn this pile of course material into the shortest reliable path to remembering it on exam day.”
- **Category:** adaptive study coach, not quiz generator or generic AI tutor.
- **Positioning:** source material → guided explanation → retrieval practice → scheduled review → proof of durable recall.
- **Tagline:** **Turn your material into knowledge that sticks.**
- **Naming:** retire “Quizify” before a broad launch. Multiple overlapping quiz/study products already use that name, and it anchors the product to a commoditized output. Keep it as the internal codename while running a two-week naming, domain, trademark, and student-preference sprint; the new name should signal mastery or progress without containing “quiz,” “AI,” or “study.”

## Product thesis and moat
Quiz generation is not a moat: [Gemini Notebook](https://notebooklm.google/), [Quizlet](https://quizlet.com/features/ai-study-tools), [Knowt](https://knowt.com/), and [StudyFetch](https://www.studyfetch.com/) already generate study materials, often for free. Quizify should win on the closed learning loop they do not uniquely own:

1. **Trust layer:** every explanation and question is traceable to the learner’s source, with uncertainty and generated fallback clearly labeled.
2. **Personal mastery model:** maintain concept-level evidence of what the learner can retrieve, how difficult it was, and when it will likely be forgotten.
3. **Adaptive action engine:** choose the next explanation, question type, difficulty, and review time from observed outcomes—not a static deck.
4. **Compounding data advantage:** longitudinal, privacy-conscious data linking source concepts, interventions, and delayed recall improves scheduling and remediation.
5. **Distribution loop:** shareable, cloneable study paths bring classmates into the product and accumulate corrected, high-quality learning artifacts.

The moat is earned in that order. There is no defensible data advantage until students repeatedly return and complete delayed reviews.

## North-star and guardrails
- **North-star metric:** weekly durable recalls—the number of concepts correctly retrieved after at least seven days. This measures learning that lasted, not content generated or time spent.
- **Activation:** at least 50% of generated sessions reach a first graded answer; median time to first practice under 90 seconds.
- **Retention:** at least 15% of activated learners return by Day 7; at least 40% complete a due review when prompted.
- **Trust:** at least 95% citation coverage and 95% factual pass rate on a maintained evaluation set; generation failure below 3%.
- **Economics:** complete lesson generation below $0.20 at target quality; gross margin above 75% before paid acquisition.
- **Business:** 3–5% activated-to-paid conversion and monthly paid churn below 8% by Month 12.

## Phase 0 — Weeks 1–2: secure and focus
- Observe 15–20 students preparing for real exams; recruit a 50–100 student design-partner cohort from two or three content-heavy courses.
- Instrument the complete funnel, delayed recall, latency, provenance, failures, and per-request token cost. The current analytics module records only a few events locally in [src/lib/analytics/events.ts](src/lib/analytics/events.ts).
- Protect [functions/api/chat.ts](functions/api/chat.ts) and [functions/api/fetch.ts](functions/api/fetch.ts): server-owned model/token limits, authentication or anonymous quotas, rate limits, URL validation, timeouts, response limits, and budget alerts.
- Fix model routing and establish a versioned evaluation set before changing prompts or providers.
- Run the rebrand sprint, but do not spend on a visual identity until the positioning resonates in interviews.
- **Exit gate:** the team can measure one complete learning loop, attribute cost, and safely expose the beta. Otherwise, pause feature work.

## Phase 1 — Months 1–2: deliver a trustworthy first win
- Replace raw-HTML ingestion with reliable extraction; add PDF, pasted text, and lecture-note inputs before more exotic formats.
- Add source-level and passage-level citations to concepts and questions, building on the unused `sourceReference` field in [src/shared/types.ts](src/shared/types.ts).
- Replace the default 11–20-question journey with a diagnostic-first five-minute path: one concept, one meaningful retrieval, immediate remediation, then an explicit choice to continue.
- Stream the first useful concept/question while the rest generates; cache normalized sources and reusable generated artifacts.
- Close mobile recovery and production TTS gaps; preserve reduced motion, captions, keyboard support, and local-first resume.
- Build automated factuality, citation, difficulty, duplication, and answerability checks around [src/lib/pipeline.ts](src/lib/pipeline.ts).
- **Exit gate:** trust, activation, latency, and cost targets hold for two consecutive cohorts. Do not add social or billing if learners do not finish the first practice.

## Phase 2 — Months 3–4: create the return loop
- Ask for exam date, confidence, and available study time; generate a short plan rather than an undifferentiated lesson.
- Fix the scheduler in [src/shared/learningProgress.ts](src/shared/learningProgress.ts) so completed concepts re-enter spaced review and mastery is based on repeated successful retrieval.
- Add a “Today” review inbox, concept-level mastery state, adaptive intervals, and short reminder flows. Keep reviews free and fast.
- Introduce magic-link identity, versioned cloud storage, and local-first sync with explicit conflict rules; preserve IndexedDB offline behavior and the race protections in [src/shared/stores/sessionStore.ts](src/shared/stores/sessionStore.ts).
- Add a compact learning dashboard centered on due work, durable recall, and weak concepts—not streaks or time spent.
- **Exit gate:** Day-7 return and due-review completion meet targets. If not, iterate on reminders, workload, and review quality before expanding scope.

## Phase 3 — Months 5–7: earn adaptive differentiation
- Build a concept-level knowledge model that ties every question and final assessment back to a concept, difficulty, attempts, hints, confidence, and delayed outcomes.
- Select the next activity based on uncertainty: explanation for encoding failure, easier retrieval after repeated failure, harder transfer questions after mastery, and wider spacing after stable success.
- Add exam-mode practice assembled from weak concepts, followed by a targeted recovery plan.
- Create an internal quality console for prompt/model comparisons, learner reports, and regressions. Treat corrections as training/evaluation signals, not automatic truth.
- Decompose oversized desktop/mobile orchestration components only where it accelerates experimentation; avoid a broad rewrite.
- **Exit gate:** adaptive cohorts outperform static cohorts on seven-day recall with acceptable cost. If not, the “adaptive” claim is removed from positioning.

## Phase 4 — Months 8–9: build distribution into the artifact
- Add read-only share links for source-safe study paths, with “clone and adapt for my exam” as the conversion action.
- Support private course groups and collaborative corrections only after one-to-one sharing works; do not build a social feed or marketplace.
- Run exam-sprint cohorts, campus ambassadors, and creator partnerships around specific courses or certifications. Measure share → visit → activated learner, not impressions.
- Publish source-permitted public pages for corrected study paths to create search distribution and reusable generation economics.
- **Exit gate:** sharing produces activated learners at a repeatable rate, targeting at least 8% share-visit-to-activation before investing in community features.

## Phase 5 — Months 10–12: monetize retained value
- Keep onboarding and scheduled reviews free. Meter costly generation: test a free allowance near three source imports per month, then Pro price points around $5.99–$9.99 monthly and $39–$59 annually.
- Pro value should be unlimited/expanded imports, larger files, multi-source courses, exam planning, advanced analytics, and priority generation—not basic memory maintenance.
- Add server-verified Stripe entitlements, quotas, usage ledgers, data export/deletion, and support/refund operations.
- Optimize model routing, caching, reusable question banks, and background generation from measured quality/cost data.
- **Exit gate:** paid conversion, churn, gross margin, and durable recall remain healthy together. Revenue that coincides with collapsing retention is not product-market fit.

## Operating system and committee lenses
- **Weekly:** Eric Ries experiment review—one risky assumption, one cohort, one measurable decision.
- **Monthly:** Don Norman usability observation; Deming quality/evaluation review; Bezos mechanism and customer-pain review.
- **Quarterly:** Porter/Christensen positioning and competitive review; Graham/Naval leverage review; Dalio pre-mortem and runway scenarios.
- Maintain one roadmap owner. The “committee” supplies decision lenses, not consensus governance.

## Explicit non-goals for Year 1
- No general-purpose chatbot, native mobile rewrite, institutional LMS suite, social feed, content marketplace, or expansion to every subject.
- No gamification whose primary measure is time spent or streak preservation.
- No large visual-graph rebuild; validate learning outcomes and return behavior using the current guided-notebook strength first.
- No paid acquisition until activation, Day-7 retention, abuse controls, and per-lesson economics are understood.

## Delivery artifact
After approval, convert this strategy into a standalone interactive roadmap canvas showing the phases, gates, metric tree, moat progression, risks, and “now/next/later” priorities. No product-code changes are part of that artifact unless separately requested.

---

# Detailed Execution Handbook

## 1. Planning assumptions

This plan deliberately optimizes for:

- A 12-month horizon beginning when implementation starts.
- A founder-led team of one to three full-time people.
- A web-first, English-language product.
- University students, primarily age 18 or older, in content-heavy courses.
- Self-learners as a later adjacent segment, not a simultaneous launch market.
- A limited operating budget and no paid acquisition until retention and unit economics are proven.
- The existing React/Vite application, Cloudflare deployment shape, local-first persistence, generation pipeline, notebook experience, accessibility work, and tests as assets to preserve.
- Willingness to replace the current name, information architecture, data model, onboarding, backend, pricing, and visual identity.

The plan does not assume:

- Existing product-market fit.
- Existing production analytics or reliable retention data.
- That “AI-generated quizzes” is differentiated.
- That more features will improve retention.
- That the current architecture is ready for unauthenticated scale.
- That a rebrand, native app, community, or subscription can compensate for weak learning outcomes.

## 2. Exact strategic choice

### 2.1 Initial ideal customer

The first ideal customer is:

- A university student taking a content-heavy course.
- Has an exam between seven and 42 days away.
- Has lecture slides, notes, PDFs, or assigned readings.
- Feels overwhelmed by volume and uncertain about what they actually know.
- Currently rereads, highlights, asks a generic chatbot for summaries, or manually creates flashcards.
- Is willing to study in five-to-20-minute sessions.
- Values confidence and exam readiness more than novelty.

Start with biology, psychology, history, business, introductory law, and similar recall-and-understanding-heavy subjects. Do not initially claim excellence for advanced mathematics, symbolic logic, diagram-heavy engineering, or programming exercises; those require separate grading and representation systems.

### 2.2 Primary job

Functional job:

> Help me convert my real course material into the smallest set of learning and review actions that will make me ready by exam day.

Emotional job:

> Replace vague study anxiety with credible evidence that I am improving.

Social job:

> Let me share something useful with classmates without exposing private source material or doing hours of manual preparation.

### 2.3 Category and promise

- Category: adaptive study coach.
- Core promise: “Know what to study next—and know whether it stuck.”
- Public tagline: “Turn your material into knowledge that sticks.”
- One-sentence pitch: “Upload your course material, take a short diagnostic, and get a source-grounded plan that teaches, tests, and schedules exactly what you are likely to forget.”
- Proof statement: “Progress is based on delayed recall, not pages read or cards flipped.”

### 2.4 Competitive counter-positioning

- Against Gemini Notebook: Quizify should not win on document chat or summaries; it should win on a directed practice plan and delayed proof of retention.
- Against Quizlet and Knowt: Quizify should not win on deck volume; it should win on concept understanding, fresh retrieval variants, remediation, and source traceability.
- Against StudyFetch: Quizify should not race to ship every media modality; it should be simpler, more transparent, and measurably better at the next action.
- Against Anki: Quizify should not claim a better mature scheduler immediately; it should remove authoring friction and vary retrieval while preserving evidence-based spacing.
- Against generic chatbots: Quizify should constrain answers to sources, maintain learning state, and initiate retrieval rather than simply answering.

## 3. Brand replacement plan

### 3.1 Why the current name should change

- “Quizify” is used by multiple overlapping quiz and learning products.
- It communicates one commodity output instead of the broader learning outcome.
- It makes expansion into planning, explanation, review, and mastery feel like feature creep.
- It is difficult to own in search, app stores, social handles, and word of mouth.

### 3.2 Naming brief

The replacement name must:

- Be easy to pronounce after seeing it once.
- Be easy to spell after hearing it once.
- Work as a noun and product brand, not a sentence.
- Avoid “quiz,” “AI,” “GPT,” “study,” and trendy suffixes that will age quickly.
- Suggest progress, memory, clarity, confidence, or mastery without making an unverifiable claim.
- Be broad enough for students and later self-learners.
- Have a viable domain and social-handle path.
- Pass legal screening in relevant software and education classes.
- Avoid confusion with existing education, memory, note-taking, or AI companies.

### 3.3 Two-week naming procedure

Day 1:

- Define three territories: durable memory, guided progress, and earned confidence.
- Generate at least 20 names per territory.
- Reject names that fail pronunciation, spelling, or obvious web-conflict checks.

Day 2:

- Score the remaining names on distinctiveness, relevance, warmth, international pronunciation, visual compactness, and expansion room.
- Produce a shortlist of 12.

Day 3:

- Run preliminary domain, app-store, company, and trademark searches.
- Remove any name with a close education/software conflict.

Days 4–5:

- Test the shortlist with at least 15 target students.
- Use an unaided five-second impression test, pronunciation test, delayed recall test, and “what would this product do?” question.
- Do not ask which logo they like.

Week 2:

- Select three finalists.
- Have qualified counsel perform proper trademark clearance before commitment.
- Reserve the chosen domain and relevant handles.
- Update only core identity elements: wordmark, type, primary color usage, favicon, and landing-page language.
- Keep the internal repository/package rename separate unless operationally necessary; avoid a risky all-at-once code rename.

### 3.4 Brand voice

- Calm, direct, and evidence-oriented.
- Never shame the learner or exaggerate certainty.
- Say “due for review,” not “you broke your streak.”
- Say “this explanation was generated from your source,” not “AI magic.”
- Say “evidence suggests you may need another attempt,” not “you have mastered this” after one correct answer.
- Treat difficulty as useful information, not failure.

## 4. Product principles

Every roadmap item must satisfy these principles:

1. **Retrieval before reassurance:** ask the learner to recall before revealing the answer when pedagogically appropriate.
2. **Source before synthesis:** ground generated material in supplied sources and expose the supporting passage.
3. **Short first value:** the learner should reach a meaningful graded action before being asked for prolonged commitment.
4. **One next action:** every screen should make the best next action obvious.
5. **Delayed proof:** do not call something learned solely because it was answered correctly immediately.
6. **Adaptive with evidence:** only personalize from observed behavior or explicit goals; do not invent “learning styles.”
7. **Free memory maintenance:** scheduled review should remain available after generation limits are reached.
8. **Local resilience:** network failure must not erase completed work.
9. **Accessible by default:** keyboard, screen-reader, captions, reduced motion, and mobile recovery are release requirements.
10. **Mechanisms over heroics:** quality, cost, abuse, and support are controlled by systems and thresholds.

## 5. Fully specified learner journey

### 5.1 First visit

- Show one primary action: add material.
- Offer four inputs in this order: upload PDF, paste text, add URL, enter topic.
- Label topic-only generation as less source-grounded before submission.
- Provide a safe example that launches instantly without consuming the learner’s quota.
- Do not require an account before first value.
- Ask only for the minimum anonymous consent and privacy disclosures required for telemetry.

### 5.2 Source intake

- Parse and display title, page/section count, language, and extraction confidence.
- Show a source preview with editable exclusions.
- Warn when extraction is sparse, image-only, paywalled, unsupported, or mostly navigation.
- Allow the learner to continue with a clear limitation, replace the source, or paste text.
- Assign a stable source hash so duplicate uploads can reuse extraction and generation safely.

### 5.3 Goal setup

- Ask what the learner needs: understand, review, or prepare for an exam.
- For exam preparation, ask exam date and available minutes per day.
- Ask confidence with a simple low/medium/high control.
- Make all questions skippable; use sensible defaults.
- Do not ask for a “learning style.”

### 5.4 Diagnostic-first generation

- Extract an initial concept set with source references.
- Select one representative concept for the first retrieval action.
- Present the first question as soon as it is ready while remaining content generates.
- Keep first practice answerable from the source but nontrivial.
- Grade objective items locally.
- Use the LLM only when semantic grading is needed, with a deterministic rubric and visible rationale.

### 5.5 Immediate remediation

- Correct answer with high confidence: give a concise explanation and offer the next concept.
- Correct answer with low confidence: reinforce briefly and schedule a nearer review.
- Incorrect answer: identify the misconception, show the relevant source passage, explain once, then ask a changed retrieval question.
- Repeated failure: reduce retrieval difficulty or return to encoding; do not loop the same item.
- Hint use lowers evidence strength even if the final answer is correct.

### 5.6 Lesson continuation

- Default to a five-minute path.
- At the end, show learned, uncertain, and not-yet-covered concepts.
- Offer “continue for five minutes,” “schedule the rest,” and “finish.”
- Persist after every meaningful state transition.
- Keep narration optional and never gate progression on audio completion outside an explicitly enabled guided mode.

### 5.7 Return experience

- Default home view is “Today,” not a library.
- Show due reviews, estimated minutes, next exam, and one resume action.
- Group reviews by urgency, not by source file.
- Use a review cap to prevent an overwhelming backlog.
- Let learners snooze with an explicit consequence to the plan.
- After review, show evidence of change: stability increased, weak concept recovered, or plan adjusted.

### 5.8 Dashboard

- Primary: durable recalls this week.
- Secondary: concepts due, confidence calibration, weak concepts, and exam readiness range.
- Show uncertainty; do not present a fake precise readiness percentage without enough evidence.
- Separate work completed from learning retained.
- Avoid leaderboards and streak-first design.

### 5.9 Sharing

- Default all content to private.
- Share only generated artifacts and source excerpts that are legally and technically safe to expose.
- Let the owner inspect exactly what a recipient will see.
- Recipients can preview without an account.
- “Clone for my exam” creates an independent plan and mastery state.
- Corrections require provenance, moderation status, and version history.

### 5.10 Upgrade

- Trigger the paywall at a clear incremental-cost or advanced-value boundary, such as another import, a larger source, or multi-source course planning.
- Never interrupt a due review with a paywall.
- Show exact limits and renewal terms.
- Prefer annual value framing only after the learner has experienced at least one return cycle.

## 6. Learning and adaptation specification

### 6.1 Unit of learning

The primary learning-state unit is a concept, not a generated question. Each concept has:

- Stable identifier and version.
- Source references.
- Learning objective.
- Prerequisite identifiers where known.
- Difficulty estimate.
- Current stability estimate.
- Current retrievability estimate.
- Last retrieval time.
- Next due time.
- Evidence count.
- Misconception tags.
- Confidence-calibration history.

Questions are replaceable evidence probes attached to concepts. This prevents a learner from appearing to master a concept by memorizing one card.

### 6.2 Attempt evidence

Record for each attempt:

- Concept and item identifiers.
- Item type and difficulty.
- Prompt/item version.
- Correctness or semantic score.
- Response latency.
- Hint and reveal use.
- Learner confidence.
- Immediate versus delayed context.
- Grading model/rubric version when applicable.
- Source version.
- Timestamp and session.

### 6.3 Initial review algorithm

Use a transparent baseline before machine-learned personalization:

- New concept: same-session varied retrieval after explanation.
- Successful first retrieval: review near one day.
- Second success: review near three days.
- Third success: review near seven days.
- Continued success: expand toward 14 and 30 days.
- Incorrect or hint-assisted retrieval: shorten the interval and change the question surface.
- Low-confidence correct response: treat as weaker evidence than high-confidence correct response.
- High-confidence incorrect response: flag a misconception and require remediation.
- Cap daily reviews and prioritize exam-critical, weak, and overdue concepts.

Run an FSRS-style or equivalent stability/difficulty model only after the event schema and baseline are reliable. Do not fit a proprietary scheduler to sparse data.

### 6.4 Adaptation policy

- If initial encoding is weak, give a shorter explanation and worked example.
- If recognition succeeds but free recall fails, shift away from multiple choice.
- If factual recall succeeds repeatedly, introduce application or comparison.
- If application fails, return to the specific prerequisite concept.
- If performance is stable after delay, widen spacing rather than adding busywork.
- If the exam is near, favor coverage and exam-style transfer while clearly acknowledging lower long-term retention.
- Keep the learner able to inspect and override the plan.

### 6.5 Scientific validation

- Compare adaptive sequencing against a static, well-designed baseline.
- Primary outcome: seven-day delayed concept retrieval.
- Secondary outcomes: completion, time to competence, confidence calibration, and learner-reported usefulness.
- Do not use time-on-task as a learning proxy.
- Predefine experiment inclusion, exclusion, and stopping rules.
- Report effects by subject and prior confidence; an average can hide harm to weaker learners.

## 7. Metric dictionary

### 7.1 North-star

**Weekly durable recalls** counts unique concept retrievals that:

- Occur at least seven days after the concept’s first successful retrieval.
- Use an unrevealed question variant.
- Are completed without answer reveal.
- Meet the correctness threshold.

Report:

- Total durable recalls.
- Durable recalls per weekly active learner.
- Percentage of activated learners producing at least one durable recall.
- Breakdown by subject, cohort, and acquisition source.

### 7.2 Funnel definitions

- Visitor: opens the product.
- Source started: begins an import.
- Source accepted: confirms usable extracted content.
- Generation started: generation job is accepted by the backend.
- First value: views the first source-grounded concept or question.
- Activated learner: submits the first graded answer.
- First-loop complete: completes one concept plus remediation or confirmation.
- Plan created: leaves with at least one future due review.
- Retained Day 7: returns and completes a meaningful action between days six and eight.
- Review adopter: completes at least one due review.
- Durable learner: produces at least one durable recall.
- Paying learner: has an active server-verified entitlement.

### 7.3 Quality definitions

- Citation coverage: supported generated claims divided by support-eligible claims.
- Citation validity: cited passage actually supports the generated claim.
- Answerability: question can be answered from the allowed source context.
- Key correctness: designated answer is correct and unambiguous.
- Distractor quality: incorrect options are plausible but clearly incorrect from the source.
- Duplication: semantic overlap above the defined threshold within a path.
- Difficulty fit: predicted versus observed success by learner state.
- Generation completion: jobs producing at least one valid concept and question.

### 7.4 Cost definitions

- Extraction cost per accepted source.
- Generation cost per activated lesson.
- Semantic grading cost per open response.
- Cost per weekly active learner.
- Cost per durable recall.
- Cache-hit rate.
- Gross margin by free and paid cohort.
- Abuse/quota-denial rate.

### 7.5 Required event taxonomy

Capture, with privacy-minimized properties:

- `landing_viewed`
- `example_started`
- `source_import_started`
- `source_import_failed`
- `source_previewed`
- `source_accepted`
- `goal_configured`
- `generation_requested`
- `generation_first_value`
- `generation_partially_completed`
- `generation_completed`
- `generation_failed`
- `question_viewed`
- `answer_submitted`
- `hint_used`
- `answer_revealed`
- `remediation_viewed`
- `concept_completed`
- `plan_created`
- `review_due`
- `review_started`
- `review_completed`
- `durable_recall_recorded`
- `lesson_resumed`
- `share_created`
- `share_viewed`
- `share_cloned`
- `paywall_viewed`
- `checkout_started`
- `subscription_started`
- `subscription_renewed`
- `subscription_cancelled`
- `feedback_submitted`

Every generation and grading event must include job ID, model route, prompt version, source type, latency, token usage, cache status, result status, and anonymous/user cohort ID. Never send raw learner source text to analytics.

## 8. Recommended technical target

### 8.1 Frontend

- Retain React, Vite, TypeScript, Zustand, Vitest, and the current accessible notebook experience.
- Convert to an installable PWA only after return behavior is validated; do not start with a native rewrite.
- Keep IndexedDB as the offline cache and anonymous-user persistence layer.
- Introduce repository interfaces so local and cloud storage do not leak through UI components.
- Split [src/features/canvas/CanvasPage.tsx](src/features/canvas/CanvasPage.tsx) and the mobile experience along feature boundaries when touched: journey shell, review queue, concept activity, progress summary, and recovery controls.

### 8.2 Backend

- Keep Cloudflare as the public API and model gateway.
- Recommended lean default: Supabase for magic-link authentication, Postgres, row-level security, and private source storage because it minimizes the number of systems a one-to-three-person team must operate.
- Keep the data layer behind application-owned interfaces so Supabase can be replaced without rewriting the product.
- Use asynchronous jobs only when generation duration or retries exceed request limits; avoid introducing a queue before measured need.
- Add idempotency keys for imports, generation, checkout, and webhook handling.

### 8.3 Core server entities

- `users`
- `anonymous_profiles`
- `courses`
- `sources`
- `source_versions`
- `source_chunks`
- `learning_paths`
- `concepts`
- `concept_sources`
- `items`
- `item_versions`
- `attempts`
- `mastery_states`
- `review_events`
- `generation_jobs`
- `model_runs`
- `quality_reports`
- `shares`
- `share_versions`
- `corrections`
- `subscriptions`
- `entitlements`
- `usage_ledger`
- `notification_preferences`
- `audit_events`

Each generated entity needs provenance and version fields. Never silently mutate a question that has historical attempts; create a new version.

### 8.4 Local-first synchronization

- Generate a stable device ID.
- Keep local writes immediate.
- Maintain per-record version, updated-at timestamp, and deletion tombstone.
- Sync through a queue with idempotent operations.
- Prefer append-only attempts and review events.
- Resolve mutable metadata with explicit last-writer rules only where data loss is acceptable.
- Surface conflicts involving source edits, notes, or plan structure.
- Test offline creation, simultaneous devices, interrupted sync, token expiry, account linking, and deletion propagation.
- Preserve the existing IndexedDB-fresh reads and serialized write protections in [src/shared/stores/sessionStore.ts](src/shared/stores/sessionStore.ts) and [src/lib/pipeline.ts](src/lib/pipeline.ts).

### 8.5 Observability stack

- Product analytics: PostHog or an equivalent event/cohort tool with consent controls.
- Error reporting: Sentry or equivalent for frontend and functions.
- Operational metrics: Cloudflare analytics plus application counters for request rate, model cost, latency, failures, and quotas.
- Quality: internal versioned evaluation runner and dashboard.
- Alerts: daily cost threshold, sudden generation failure, citation regression, p95 latency, abuse spike, webhook failure, and sync-error spike.

### 8.6 API security

For [functions/api/chat.ts](functions/api/chat.ts):

- Reject unknown fields and oversized bodies.
- Use server-owned model allowlists.
- Cap input and output tokens by task.
- Authenticate signed-in users and issue constrained anonymous session tokens.
- Rate-limit by account, session, IP risk, and endpoint.
- Enforce entitlements and record usage atomically.
- Add timeout, bounded retries, circuit breaker, and structured error codes.
- Never return provider credentials or raw provider errors.

For [functions/api/fetch.ts](functions/api/fetch.ts):

- Permit only `http` and `https`.
- Resolve and block loopback, link-local, private, metadata, and internal network ranges before every redirect.
- Limit redirects, bytes, content types, and total time.
- Normalize URLs and cache safe results.
- Respect access restrictions; do not bypass authentication or paywalls.
- Parse readable content server-side and discard scripts/navigation.

For source storage:

- Private by default.
- Encryption in transit and at rest.
- Signed, expiring access.
- Defined deletion and retention behavior.
- No model training on learner content without separate explicit consent.

## 9. Generation and quality system

### 9.1 Pipeline stages

1. Validate and normalize input.
2. Extract content and structural metadata.
3. Chunk by semantic section while preserving page/section references.
4. Detect language and quality.
5. Build a concept outline with source spans.
6. Validate concept coverage, duplication, and support.
7. Produce the first diagnostic item.
8. Stream first value.
9. Generate remaining explanations and item variants.
10. Run schema and deterministic validations.
11. Run targeted model-based quality checks only where deterministic checks are insufficient.
12. Persist versioned artifacts and cost/provenance records.

### 9.2 Evaluation corpus

Start with at least:

- 30 representative sources.
- Six subject families.
- Short and long PDFs.
- Slide decks converted to PDF.
- Clean articles.
- Noisy web pages.
- A scanned/image-only failure case.
- A paywalled or blocked case.
- Adversarial prompt-injection text.
- Sources with tables, footnotes, and conflicting statements.

For every release candidate, evaluate:

- Extraction completeness.
- Citation support.
- Concept coverage.
- Factual accuracy.
- Question answerability.
- Correct answer validity.
- Distractor quality.
- Difficulty.
- Duplication.
- Safety and prompt-injection resistance.
- Latency and cost.

Maintain separate development and holdout sets. Record reviewer disagreement rather than forcing false certainty.

### 9.3 Prompt and model governance

- Version every prompt and output schema.
- Route tasks to the cheapest model that meets a predefined quality threshold.
- Do not let clients choose arbitrary models.
- Compare prompt/model changes on the same holdout set.
- Require no critical regression and an explicit cost/quality rationale before rollout.
- Canary changes to a small cohort.
- Keep rollback available.
- Treat provider fallback as a continuity mechanism, not an excuse to accept different behavior silently.

## 10. First ten working days

### Day 1 — Establish truth

- Freeze noncritical feature development.
- Record current build, test, generation, and deployment behavior.
- Create the product metric dictionary and baseline dashboard skeleton.
- Add a temporary operational cost ceiling and provider budget alert.
- List every public endpoint and current abuse path.
- Schedule the first five student observation sessions.

### Day 2 — Secure the highest-risk surfaces

- Define request schemas, task-specific token limits, and model allowlists.
- Define anonymous and authenticated quota policy.
- Specify URL-fetch SSRF controls, redirect policy, MIME allowlist, size limit, and timeout.
- Write security acceptance tests before implementation.

### Day 3 — Define the learning loop

- Map current onboarding to first graded answer.
- Remove every field and screen not needed before first value.
- Write the five-minute path prototype.
- Define “activated,” “first-loop complete,” and “plan created.”
- Draft the baseline review schedule.

### Day 4 — Define quality

- Select the first ten evaluation sources.
- Write human review rubrics.
- Label critical versus noncritical defects.
- Establish prompt/model version naming.
- Specify citation data structure and rendering behavior.

### Day 5 — Observe users

- Run at least three live study observations.
- Ask participants to use their own real material.
- Measure time, confusion, trust questions, abandonment points, and workaround behavior.
- Do not explain the interface unless the participant is irretrievably blocked.
- Synthesize evidence the same day.

### Day 6 — Decide infrastructure

- Validate Supabase versus a Cloudflare-only data path against auth, sync, storage, effort, cost, and lock-in criteria.
- Select the lean default and document the decision.
- Draft the server data model and local/cloud repository boundary.
- Draft account-linking and anonymous migration behavior.

### Day 7 — Instrument

- Implement or specify the funnel and cost events.
- Ensure raw source text and answers are excluded from analytics by default.
- Add correlation IDs from browser through gateway and model call.
- Define dashboards for activation, reliability, quality, retention, and cost.

### Day 8 — Prototype

- Test a clickable or coded five-minute flow with at least three students.
- Compare diagnostic-first with explanation-first.
- Test source citation discoverability.
- Record what learners believe the product promises.

### Day 9 — Brand and recruitment

- Complete first-pass name generation and conflict screening.
- Publish a focused beta-recruitment page using the new positioning, not a new visual identity.
- Recruit from two or three real courses and schedule the first exam-sprint cohort.

### Day 10 — Gate review

- Review security readiness, instrumentation completeness, user evidence, quality baseline, and cost baseline.
- Select only the next two-week sprint scope.
- Publish a one-page internal decision memo: facts, assumptions, decisions, rejected work, and next gate.

## 11. Biweekly delivery schedule

### Sprint 1 — Weeks 1–2: safe measurable beta

Product:

- Finalize five-minute path and beta positioning.
- Remove avoidable pre-value decisions.
- Add generated-fallback and source-quality disclosures.

Engineering:

- Secure model and fetch gateways.
- Add end-to-end correlation, cost, latency, and funnel events.
- Fix model routing and fallback assertions.
- Add production environment validation.

Research and growth:

- Complete 15–20 observations/interviews.
- Recruit 50–100 design partners.
- Begin naming sprint.

Gate:

- No critical endpoint abuse path.
- Complete generation can be traced and costed.
- At least ten target users understand the promise without explanation.

### Sprint 2 — Weeks 3–4: source ingestion

Product:

- Add PDF and pasted-text intake.
- Show extraction preview and quality state.
- Let users exclude irrelevant sections.

Engineering:

- Implement readable web extraction, MIME checks, canonicalization, source hashing, and bounded storage.
- Add extraction fixtures and adversarial cases.
- Introduce source/version/chunk structures.

Research and growth:

- Test real lecture slides and readings from the cohort.
- Compare which input produces the highest accepted-source and activation rate.

Gate:

- At least 90% of supported clean sources produce a usable preview.
- Unsupported sources fail clearly without wasting a generation call.

### Sprint 3 — Weeks 5–6: citations and quality

Product:

- Render concept and question source references.
- Add “show evidence” and “report a problem.”
- Explain when content is generated beyond the source.

Engineering:

- Add citation schema and source-span validation.
- Build first 30-source evaluation corpus.
- Version prompts, models, schemas, and artifacts.

Research and growth:

- Test whether citations improve trust without overwhelming the flow.
- Identify the minimum citation UI needed during practice.

Gate:

- Citation coverage and validity meet the initial threshold on the evaluation set.
- No critical answer-key defect in the release candidate.

### Sprint 4 — Weeks 7–8: first-value speed

Product:

- Launch diagnostic-first generation.
- Stream first question/concept.
- Add five-minute completion and continue/schedule choices.

Engineering:

- Reorder [src/lib/pipeline.ts](src/lib/pipeline.ts) around first useful output.
- Add idempotency and partial-result recovery.
- Cache normalized sources and safe generated artifacts.

Research and growth:

- Run first controlled exam-sprint cohort.
- Compare diagnostic-first and current flow.

Gate:

- Median time to first practice is below 90 seconds.
- At least 50% of accepted generations reach first graded answer.

### Sprint 5 — Weeks 9–10: activation hardening

Product:

- Improve incorrect-answer remediation.
- Add changed retrieval after explanation.
- Remove pacing or narration gates that create abandonment.
- Add mobile retry/skip recovery.

Engineering:

- Repair production TTS fallback or remove unavailable server TTS claims.
- Add mobile viewport and accessibility regression coverage.
- Add first-activity E2E against a mocked production function contract.

Research and growth:

- Interview completers and abandoners separately.
- Identify the top three first-loop drop-off reasons.

Gate:

- First-loop completion improves without reducing question quality.
- Mobile and desktop completion gap is understood and shrinking.

### Sprint 6 — Weeks 11–12: identity foundation

Product:

- Offer account creation after first-loop value.
- Explain benefits: cross-device resume, review reminders, and protected progress.
- Preserve anonymous use.

Engineering:

- Add magic-link authentication.
- Create user, anonymous-profile, source, path, and entitlement foundations.
- Implement anonymous-to-account linking.
- Add row-level security tests and deletion skeleton.

Research and growth:

- Test account prompt timing and copy.
- Measure account conversion without blocking activation.

Gate:

- Anonymous work migrates without duplication or loss.
- Cross-account access tests fail safely.

### Sprint 7 — Weeks 13–14: local-first cloud sync

Product:

- Add sync state and recoverable conflict messaging.
- Preserve offline access to existing lessons and reviews.

Engineering:

- Add repository interfaces, append-only attempt sync, versioned metadata, tombstones, retries, and idempotency.
- Test two-device edits, offline attempts, token expiry, and account logout.

Research and growth:

- Observe real cross-device use.
- Validate that sync indicators are understandable but unobtrusive.

Gate:

- No lost attempts in the sync test matrix.
- Existing local sessions survive account linking.

### Sprint 8 — Weeks 15–16: concept mastery and scheduler

Product:

- Replace one-time completion with learning, due, strengthening, and stable states.
- Explain why and when a concept is due.

Engineering:

- Tie questions and final assessment to concepts.
- Fix [src/shared/learningProgress.ts](src/shared/learningProgress.ts) so completed concepts return.
- Implement transparent baseline intervals and evidence scoring.

Research and growth:

- Validate terminology with students.
- Check whether due dates feel credible and manageable.

Gate:

- Completed concepts reliably re-enter review.
- Scheduler behavior is deterministic, testable, and inspectable.

### Sprint 9 — Weeks 17–18: Today review inbox

Product:

- Make Today the signed-in home.
- Add review estimate, urgency, cap, snooze, and completion summary.
- Mix concepts across sources only when context remains clear.

Engineering:

- Build due-item query, prioritization, review-session assembly, and review completion events.
- Add notification-ready due state.

Research and growth:

- Run reminder-free review tests first to measure intrinsic return.
- Observe backlog anxiety and adjust caps.

Gate:

- At least 25% of eligible beta learners complete one naturally due review.
- Review sessions fit the promised time estimate.

### Sprint 10 — Weeks 19–20: reminders and dashboard

Product:

- Add opt-in email reminders and notification preferences.
- Add durable recall, due concepts, weak concepts, and exam plan to dashboard.

Engineering:

- Add reminder scheduling, delivery tracking, unsubscribe, timezone handling, and quiet hours.
- Add confidence calibration and durable-recall computation.

Research and growth:

- Test reminder timing and message framing.
- Compare exam-date urgency with neutral due-review framing.

Gate:

- Day-7 return reaches the target cohort threshold or shows a clear improving trend.
- Reminder complaints and unsubscribes remain acceptable.

### Sprint 11 — Weeks 21–22: adaptive activity policy

Product:

- Vary question type and support based on evidence.
- Show a concise reason for the selected next action.

Engineering:

- Implement policy rules for encoding failure, recognition/free-recall mismatch, misconception, and stable success.
- Add item-variant generation and reuse controls.

Research and growth:

- Verify that learners perceive adaptation as useful rather than random.
- Audit outcomes for weaker learners.

Gate:

- Policy decisions are reproducible from recorded evidence.
- No group shows a material quality or completion regression.

### Sprint 12 — Weeks 23–24: prerequisite remediation

Product:

- Detect and offer prerequisite review when application fails.
- Add concise worked examples where appropriate.

Engineering:

- Add prerequisite links and misconception tags.
- Add remediation outcome tracking.
- Extend quality corpus with misconception cases.

Research and growth:

- Conduct learning-science review of the intervention rules.
- Observe whether explanations resolve the identified misconception.

Gate:

- Remediation improves next-attempt performance without excessive session length.

### Sprint 13 — Weeks 25–26: exam mode

Product:

- Generate an exam-style session from weak and representative concepts.
- Add time, coverage, difficulty, and question-format controls.
- End with a recovery plan, not only a score.

Engineering:

- Build blueprint-based exam assembly.
- Prevent repeated surface forms and leakage of prior answers.
- Connect every result back to mastery state.

Research and growth:

- Test in the week before real exams.
- Compare perceived readiness with actual delayed results where available.

Gate:

- Exam mode produces actionable weakness information.
- It does not inflate mastery from immediate repeated testing.

### Sprint 14 — Weeks 27–28: adaptive validation

Product:

- No major feature expansion.
- Refine only observed failure points.

Engineering:

- Run adaptive versus static baseline experiment.
- Lock experiment definitions and monitor data quality.
- Audit model and scheduler version consistency.

Research and growth:

- Collect seven-day outcomes and qualitative feedback.
- Analyze by subject and starting confidence.

Gate:

- Adaptive path improves delayed recall or meaningfully reduces time at equal recall.
- If not, simplify the claim and iterate before further investment.

### Sprint 15 — Weeks 29–30: quality operations

Product:

- Add learner-visible correction status and artifact version notices where necessary.

Engineering:

- Build internal quality console for model/prompt comparisons, reports, costs, and regressions.
- Add staged rollout and rollback controls.
- Expand holdout evaluation corpus.

Research and growth:

- Establish a small paid expert-review panel for sampled content.
- Categorize learner reports by severity and recurrence.

Gate:

- A quality regression can be detected, traced, and rolled back within one working day.

### Sprint 16 — Weeks 31–32: private sharing

Product:

- Add inspected read-only share links.
- Let recipients preview a concept and practice item without signing in.
- Add “clone for my exam.”

Engineering:

- Create share versions, revocation, permissions, source-safety checks, and abuse reporting.
- Keep recipient mastery independent.

Research and growth:

- Measure natural one-to-one sharing.
- Interview senders about why and where they share.

Gate:

- No private source leakage.
- Shared previews activate recipients at a promising rate.

### Sprint 17 — Weeks 33–34: clone and referral loop

Product:

- Let recipients adapt exam date, source scope, and plan.
- Credit the original creator without exposing identity by default.

Engineering:

- Implement clone lineage, deduplicated artifact reuse, and referral attribution.
- Add anti-spam limits.

Research and growth:

- Run course-specific sharing prompts after a successful first loop or review.
- Avoid generic invite rewards until organic motivation is understood.

Gate:

- Target at least 8% share-view-to-activation.
- Cloned paths demonstrate lower generation cost without lower quality.

### Sprint 18 — Weeks 35–36: private course cohorts

Product:

- Add invitation-only course groups with shared paths and corrections.
- Keep individual mastery private.

Engineering:

- Add group roles, scoped permissions, moderation, version history, and removal.
- Do not add feeds, chat, or public profiles.

Research and growth:

- Pilot in two or three courses.
- Measure whether groups create repeated sharing or administrative burden.

Gate:

- Course groups increase activation or retention enough to justify complexity.
- Otherwise return to simple share links.

### Sprint 19 — Weeks 37–38: permitted public artifacts

Product:

- Publish selected source-safe, corrected study paths.
- Add transparent provenance, update date, and quality status.

Engineering:

- Add indexing controls, canonical URLs, structured metadata, copyright takedown flow, and public caching.
- Exclude private or ambiguously licensed source excerpts.

Research and growth:

- Create high-quality pages around a narrow course/exam cluster.
- Measure search visits through activation, not rankings alone.

Gate:

- Public artifacts attract qualified learners and remain operationally safe.

### Sprint 20 — Weeks 39–40: pricing research and entitlements

Product:

- Test value and limit comprehension without charging the full cohort.
- Define free, Pro, grace, trial, and cancelled states.

Engineering:

- Build usage ledger and server-side entitlement checks.
- Add quota UI and clear error states.
- Complete export/deletion workflows.

Research and growth:

- Run willingness-to-pay interviews after demonstrated retention value.
- Test monthly and annual price bands and feature packaging.

Gate:

- Learners understand what is free and why paid value exists.
- Entitlements cannot be bypassed from the client.

### Sprint 21 — Weeks 41–42: billing

Product:

- Add checkout, account billing, renewal disclosure, cancellation, and restore.
- Keep due reviews accessible through cancellation.

Engineering:

- Integrate Stripe Checkout and Customer Portal.
- Verify signed webhooks, idempotency, retry handling, and entitlement reconciliation.
- Add tax and receipt behavior appropriate to launch markets.

Research and growth:

- Launch to a small, high-intent cohort.
- Conduct cancellation interviews manually.

Gate:

- Billing state remains consistent under duplicate, delayed, and failed webhooks.
- Support can resolve entitlement issues quickly.

### Sprint 22 — Weeks 43–44: paywall experiments

Product:

- Test generation allowances and plan framing.
- Present annual only after value; never use deceptive countdowns.

Engineering:

- Add experiment assignment, exposure logging, and revenue/refund metrics.
- Enforce cost limits before provider calls.

Research and growth:

- Compare approximately three free imports against alternative usage-based boundaries.
- Test $5.99–$9.99 monthly and $39–$59 annual bands.

Gate:

- Paid conversion reaches an encouraging range without damaging activation or review retention.

### Sprint 23 — Weeks 45–46: unit economics

Product:

- No novelty features.
- Improve perceived speed and explain queued work.

Engineering:

- Route each task to the lowest-cost passing model.
- Improve source and artifact cache hits.
- Batch safe work and remove redundant generation.
- Add per-cohort gross-margin reporting.

Research and growth:

- Identify features users value versus expensive features they merely try.

Gate:

- Target lesson cost and gross margin are reached at maintained quality.

### Sprint 24 — Weeks 47–48: paid retention

Product:

- Improve renewal value with course continuity, exam plan, and learning history.
- Add ethical annual-plan prompts.

Engineering:

- Add subscription lifecycle cohorts, dunning state, grace access, and failed-payment recovery.

Research and growth:

- Analyze AI-tourist behavior separately from durable learners.
- Interview retained, cancelled, and refunded users.

Gate:

- Paid retention, durable recall, and support burden justify continuing consumer subscription investment.

### Sprint 25 — Weeks 49–50: product-market-fit review

Product:

- Freeze expansion.
- Polish the smallest high-retention loop.

Engineering:

- Resolve top reliability, sync, quality, and cost defects.
- Remove dead experiments and stale paths.
- Update architecture and operating documentation.

Research and growth:

- Analyze cohorts by course, source type, exam horizon, and acquisition channel.
- Identify the narrowest segment with repeatable activation, retention, sharing, and payment.

Gate:

- Choose one: concentrate, reposition, pivot segment, or stop scaling.
- Do not average weak and strong segments into a misleading success story.

### Sprint 26 — Weeks 51–52: Year 2 decision

- Write a full annual review against every gate.
- Decide whether Year 2 focuses on deeper consumer mastery, mobile distribution, creator-led course packs, a specific exam vertical, or institutional expansion.
- Set headcount only after selecting that direction.
- Archive rejected initiatives and document why.
- Publish the next 12-month roadmap from evidence, not the original vision.

## 12. Growth plan

### 12.1 First 100 learners

- Recruit manually from two or three university courses.
- Use real exam dates to create natural return windows.
- Offer concierge onboarding and ask learners to bring their own material.
- Watch sessions live with consent.
- Provide a direct founder support channel.
- Do not use friends and generic AI enthusiasts as the primary cohort.

### 12.2 First 1,000 learners

- Repeat only in courses where activation and review retention are strongest.
- Run two-week “exam readiness” cohorts.
- Encourage sharing after a successful learning outcome, not immediately after signup.
- Partner with small course creators, tutors, teaching assistants, and student societies.
- Publish transparent case studies showing process and measured recall, not unsupported grade promises.

### 12.3 Channel order

1. Direct cohort recruitment.
2. Classmate sharing.
3. Tutor and course-creator partnerships.
4. Narrow source-safe public pages.
5. Campus ambassadors after the referral loop works.
6. Paid acquisition only after retention and contribution margin support it.

### 12.4 Content strategy

- Teach effective study behavior: retrieval, spacing, confidence calibration, and exam planning.
- Use product data only in aggregate and with proper privacy safeguards.
- Build content around specific problems such as “turn lecture slides into a seven-day review plan.”
- Avoid generic “top AI study tools” content as the core acquisition strategy.

### 12.5 Referral mechanism

- Trigger: learner completes a useful path or durable review.
- Object shared: a useful study path preview, not a referral code.
- Recipient value: practice one concept immediately.
- Conversion: clone and set an exam date.
- Reward: expanded generation capacity only after fraud controls and organic sharing are understood.

## 13. Pricing and packaging

### Free

- Anonymous first learning loop.
- Approximately three source imports per month, subject to experiments.
- Normal-size sources.
- Unlimited scheduled reviews of already created concepts.
- Basic mastery history.
- Limited sharing.

### Pro

- Higher or unlimited fair-use source imports.
- Larger files and multi-source courses.
- Full exam planner and exam mode.
- Advanced mastery and calibration analytics.
- Priority/background generation.
- Expanded sharing and course organization.
- Data export.

### Packaging rules

- Do not paywall basic accessibility, correction reporting, privacy, or scheduled review.
- Do not advertise “unlimited” without a documented fair-use policy.
- Show consumption before a limit is reached.
- Provide grace for in-progress generation failures.
- Offer transparent refunds for material product failure.
- Price-test only after a learner has experienced return value.

## 14. Team and responsibility model

### If one founder

- Spend roughly 50% on product/engineering, 25% on user observation/support, 15% on quality/operations, and 10% on distribution.
- Protect at least two user sessions and one metric review every week.
- Use contractors only for legal/trademark, security review, specialized learning-science review, and visual identity after name clearance.

### If two people

- Founder/product-growth lead: customer research, positioning, roadmap, analytics, cohorts, partnerships, pricing, and support.
- Full-stack/ML-product lead: gateway, ingestion, generation, data, sync, scheduler, quality system, billing, and reliability.
- Both attend weekly user observations and quality review.

### If three people

- Add a product designer/front-end engineer or learning-experience designer.
- Own onboarding, review UX, accessibility, mobile behavior, prototypes, and design system.
- Retain external learning-science review for experimental rigor rather than assuming design expertise equals scientific validation.

### Decision rights

- One directly responsible owner per metric and release.
- Founder owns positioning, gates, and resource allocation.
- Technical owner can block release for security, data-loss, or reliability risk.
- Quality owner can block generated-content changes for critical evaluation regressions.
- User research informs decisions but does not become feature voting.

## 15. Operating cadence

### Daily

- Review critical errors, endpoint abuse, spend, and generation failure.
- Triage learner reports by safety, factuality, data loss, billing, and UX.
- Keep a written decision log for material changes.

### Weekly

- Monday: metric review and one-sentence sprint outcome.
- Tuesday–Wednesday: implementation and user sessions.
- Thursday: quality evaluation and release candidate.
- Friday: experiment decision, support synthesis, cost review, and next-week scope.
- Ship small changes behind flags; do not bundle unrelated experiments.

### Monthly

- Observe at least five target learners.
- Review cohort activation and retention.
- Audit 50 sampled generated items or an equivalent statistically justified sample.
- Review model cost, cache performance, abuse, and support categories.
- Remove at least one low-value complexity source.
- Produce a short operating memo.

### Quarterly

- Reassess target segment and competitive position.
- Run a pre-mortem.
- Review runway and downside scenarios.
- Decide what explicitly stops.
- Revisit hiring only after bottlenecks are evidenced.

## 16. Reliability, privacy, and support

### Service targets by Month 4

- 99.5% successful availability for core non-provider application paths.
- Generation success above 97%, including useful partial recovery.
- p95 first-value latency below three minutes; p50 below 90 seconds.
- Sync data-loss incidents: zero.
- Critical factual or citation defects acknowledged within one business day.
- Billing/entitlement discrepancies resolved within one business day.

### Incident severities

- Severity 0: credential exposure, cross-account data access, destructive data loss, or dangerous systemic content. Stop affected service and notify appropriately.
- Severity 1: billing corruption, widespread generation failure, sync loss risk, or major source leakage. Same-day mitigation.
- Severity 2: degraded quality, high latency, broken modality, or isolated incorrect content. Prioritized repair.
- Severity 3: cosmetic or low-impact UX defect. Normal backlog.

### Support taxonomy

- Source import.
- Incorrect content.
- Ambiguous question.
- Grading disagreement.
- Lost progress/sync.
- Account access.
- Billing/refund.
- Accessibility.
- Copyright/privacy.
- Feature request.

Every support category needs an owner, response target, and recurring-defect review.

## 17. Budget and economic controls

- Set a hard monthly model-spend ceiling from Day 1.
- Deny or queue work predictably when the ceiling is approached; never allow an uncontrolled bill.
- Keep free cohort size invite-based until per-activated-lesson cost is known.
- Track cost per durable recall, not only cost per generation.
- Avoid paid acquisition in the first six months.
- Prefer variable tools with generous early tiers; do not pre-purchase annual infrastructure before usage is understood.
- Budget external specialists for limited legal/trademark, security, accessibility, and learning-science reviews.
- Require a written expected learning or revenue outcome for any recurring tool above a chosen monthly threshold.

Unit economics must include:

- Model and extraction cost.
- Storage and bandwidth.
- Analytics and monitoring.
- Payment fees.
- Refunds and chargebacks.
- Support time.
- Creator/referral rewards.
- Taxes where applicable.

## 18. Risk register and precommitted responses

### Risk: generated material is untrustworthy

Early signal:

- Citation validity falls, reports increase, or experts find systematic errors.

Response:

- Narrow supported source types/subjects, stop the faulty model route, strengthen evaluation, and remove unsupported claims. Do not solve with disclaimer copy alone.

### Risk: learners use it once and leave

Early signal:

- Activation is acceptable but due-review completion and Day-7 return remain weak.

Response:

- Reduce initial workload, improve plan relevance and reminder timing, interview abandoners, and pause sharing/monetization work.

### Risk: adaptation is theater

Early signal:

- Adaptive and static cohorts have equal delayed recall, or weaker learners perform worse.

Response:

- Revert to the strongest transparent static schedule, stop the adaptive claim, and research the failed intervention.

### Risk: AI costs overwhelm consumer pricing

Early signal:

- Cost per activated learner rises, open-answer grading dominates, or heavy free users drive spend without retention.

Response:

- Route cheaper models, grade objective items locally, cache, cap costly actions, reduce unnecessary generation, and redesign packaging.

### Risk: public gateway abuse

Early signal:

- Traffic/cost deviates from product events, repeated anonymous patterns appear, or model payloads bypass intended tasks.

Response:

- Tighten signed sessions, rate limits, task schemas, provider keys, and edge rules; rotate exposed credentials immediately.

### Risk: incumbent feature convergence

Early signal:

- Large competitors reproduce visible workflow features.

Response:

- Concentrate on learner outcome data, trust, adaptive evidence, narrow-course distribution, and simplicity. Do not chase their feature inventory.

### Risk: sharing leaks copyrighted/private material

Early signal:

- Takedowns, user complaints, or source excerpts appear publicly.

Response:

- Disable affected sharing, inspect artifact policy, minimize excerpts, add source-owner controls, and maintain takedown operations.

### Risk: team becomes roadmap-bound

Early signal:

- Work continues despite failed gates or user evidence.

Response:

- Gates override calendar dates. Move later phases back rather than declaring earlier phases complete.

## 19. Kill, pivot, and scale criteria

### Continue and concentrate when

- One course/subject cohort repeatedly exceeds activation and Day-7 targets.
- Learners complete due reviews without intensive manual prompting.
- Delayed recall improves.
- Sharing brings similar learners.
- Some retained learners pay at sustainable margin.

### Pivot positioning or segment when

- The learning loop works but only for a narrower subject, exam type, or self-learning use case.
- Students value explanation or planning but not review.
- A creator/tutor-led workflow has far stronger acquisition and retention than direct consumer use.

### Stop scaling and revisit the product when

- After three serious iterations, fewer than 30% of accepted sources reach first graded answer.
- Day-7 meaningful return remains below 7% despite a functioning reminder and review system.
- Citation/key correctness cannot reach the required threshold at viable cost.
- Adaptive sequencing shows no learning or time benefit over a simpler baseline.
- Paid conversion depends on deceptive limits or retention collapses after purchase.

### Scale only when

- Security and quotas are operational.
- Quality is measured continuously.
- Activation and retention are stable across multiple cohorts.
- Unit economics are positive or have a credible measured path.
- Support load is bounded.
- The team can detect and roll back regressions.

## 20. Definition of done

A product feature is not done until:

- User problem and expected behavior are written.
- Analytics exposure and outcome events exist.
- Accessibility states are tested.
- Mobile and keyboard behavior are verified.
- Loading, empty, offline, partial, denied, and error states exist.
- Security and privacy implications are reviewed.
- Unit and integration tests pass.
- Relevant E2E path passes.
- Generation changes pass the quality holdout.
- Cost impact is measured.
- Documentation is updated.
- Rollout and rollback are defined.
- The responsible metric has an observation window and decision date.

Repository verification remains:

- `npm run build`
- `npm run lint`
- `npm test`

Add, as the roadmap progresses:

- API contract tests against deployed preview functions.
- Security tests for gateway and fetch behavior.
- Sync conflict tests.
- Accessibility automation and manual checks.
- Generation-quality evaluation.
- Billing webhook/idempotency tests.
- Critical-path E2E for anonymous activation, account linking, review, sharing, and subscription.

## 21. Final Year-1 outcome

By the end of 12 months, the product should not merely generate quizzes. It should be able to demonstrate this loop:

1. A learner supplies real material.
2. The product extracts it safely and cites it.
3. The learner reaches a meaningful retrieval action quickly.
4. The product responds to evidence, not a fictional learning style.
5. The learner returns when memory is predicted to weaken.
6. Delayed retrieval verifies that at least some learning lasted.
7. The learner can share a safe, useful path with a peer.
8. Retained learners pay for costly and advanced value.
9. Quality, cost, abuse, privacy, and reliability are operated through measurable mechanisms.
10. The team knows exactly which learner segment, channel, and intervention deserve Year-2 investment.