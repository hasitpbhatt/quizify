# Creates GitHub issues from the roadmap implementation plan.
# Run from repo root: pwsh .github/scripts/create-roadmap-issues.ps1

$ErrorActionPreference = "Stop"
$created = @()

function New-GhIssue {
    param(
        [string]$Title,
        [string]$Body,
        [string[]]$Labels
    )
    $labelArgs = $Labels | ForEach-Object { "--label", $_ }
    $issue = gh issue create --title $Title --body $Body @labelArgs
    $num = ($issue -replace '.*/', '')
    Write-Host "Created #$num : $Title"
    return [int]$num
}

# ── Phase 0 Stories ──────────────────────────────────────────────

$s0_gateway = New-GhIssue `
    -Title "[Story] Phase 0: Secure API gateway for beta exposure" `
    -Body @"
## Summary
Harden ``/api/chat`` and ``/api/fetch`` so the beta can be exposed without critical abuse paths.

## Exit gate
No critical endpoint abuse path; generation can be traced and costed.

## Scope
- Server-owned model allowlist and task token caps (stop client model choice)
- Anonymous session tokens, rate limits (IP + session), monthly spend ceiling / budget alerts
- SSRF controls, redirect/MIME/byte/timeout limits on fetch
- Readable server-side extraction (stop returning raw HTML as trust path)

## Key files
- ``functions/api/chat.ts``
- ``functions/api/fetch.ts``
- ``src/lib/llm/providers.ts``

## References
- [docs/roadmap.md](docs/roadmap.md) Phase 0, Sprint 1
- Roadmap §8.6 API security
"@ `
    -Labels @("story", "phase-0", "priority-critical")

$s0_analytics = New-GhIssue `
    -Title "[Story] Phase 0: Instrument product analytics funnel" `
    -Body @"
## Summary
Replace the local 3-event ring buffer with full funnel, cost, latency, and provenance telemetry.

## Exit gate
Team can measure one complete learning loop and attribute cost per request.

## Scope
- Implement event taxonomy from roadmap §7.5
- Wire events from welcome → generate → first graded answer → resume
- Correlation IDs browser → gateway → model
- Record tokens, latency, cache hit, result status (never raw source text)
- PostHog (or equivalent) sink behind consent; keep local buffer for debug

## Key files
- ``src/lib/analytics/events.ts``
- ``src/app/App.tsx``
- ``functions/api/chat.ts``

## References
- [docs/roadmap.md](docs/roadmap.md) §7.5 Required event taxonomy
"@ `
    -Labels @("story", "phase-0", "priority-high")

$s0_eval = New-GhIssue `
    -Title "[Story] Phase 0: Evaluation baseline and prompt governance" `
    -Body @"
## Summary
Establish versioned prompts/schemas and a frozen evaluation corpus before changing generation behavior.

## Exit gate
Prompt/model changes can be compared on a holdout set; cost/latency baselines documented.

## Scope
- Version every prompt and output schema
- Scaffold 10–30 source eval corpus with rubrics (factuality, citation, answerability)
- Document current cost/latency baselines
- Do not change prompts until baseline is frozen

## References
- [docs/roadmap.md](docs/roadmap.md) §9.2 Evaluation corpus, §9.3 Prompt governance
"@ `
    -Labels @("story", "phase-0", "priority-high")

# Phase 0 Tasks
New-GhIssue -Title "[Task] Harden /api/chat: allowlist, quotas, rate limits, spend ceiling" -Body "Part of #$s0_gateway`n`n- Reject unknown/oversized bodies`n- Server-owned model allowlist + task token caps`n- Anonymous session tokens + rate limits`n- Timeouts, structured errors, budget alerts" -Labels @("task", "phase-0", "priority-critical") | Out-Null

New-GhIssue -Title "[Task] Harden /api/fetch: SSRF, extraction limits, readable content" -Body "Part of #$s0_gateway`n`n- http(s) only; block private/link-local/metadata IPs on every redirect`n- MIME/byte/timeout caps`n- Readable extraction server-side" -Labels @("task", "phase-0", "priority-critical") | Out-Null

New-GhIssue -Title "[Task] Gateway security acceptance tests" -Body "Part of #$s0_gateway`n`n- Security tests for chat and fetch before implementation ships`n- Cover SSRF, rate limits, body validation, model allowlist" -Labels @("task", "phase-0", "priority-high") | Out-Null

New-GhIssue -Title "[Task] Implement full analytics event taxonomy (roadmap §7.5)" -Body "Part of #$s0_analytics`n`nImplement all required events: landing_viewed through feedback_submitted per roadmap §7.5." -Labels @("task", "phase-0", "priority-high") | Out-Null

New-GhIssue -Title "[Task] Add correlation IDs and token cost attribution" -Body "Part of #$s0_analytics`n`n- Correlation ID from browser through gateway to model call`n- Include job ID, model route, prompt version, latency, token usage on generation/grading events" -Labels @("task", "phase-0", "priority-high") | Out-Null

New-GhIssue -Title "[Task] Integrate PostHog (or equivalent) analytics sink" -Body "Part of #$s0_analytics`n`n- Consent controls`n- Exclude raw learner source text`n- Keep local ring buffer for offline debug" -Labels @("task", "phase-0", "priority-medium") | Out-Null

New-GhIssue -Title "[Task] Wire activation funnel events in App flow" -Body "Part of #$s0_analytics`n`nWire: source_import_started → generation_first_value → answer_submitted → lesson_resumed" -Labels @("task", "phase-0", "priority-high") | Out-Null

New-GhIssue -Title "[Task] Version prompts/schemas and scaffold eval corpus" -Body "Part of #$s0_eval`n`n- 10–30 representative sources across subject families`n- Human review rubrics`n- Separate dev and holdout sets" -Labels @("task", "phase-0", "priority-high") | Out-Null

New-GhIssue -Title "[Task] Document cost/latency baselines before prompt changes" -Body "Part of #$s0_eval`n`nRecord extraction cost, generation cost, p50/p95 first-value latency on current build." -Labels @("task", "phase-0", "priority-medium") | Out-Null

New-GhIssue -Title "[Task] Phase 0: Student observations and design partner recruitment" -Body @"
## Summary
Observe 15–20 students preparing for real exams; recruit 50–100 design partners from 2–3 content-heavy courses.

## Exit gate
At least 10 target users understand the promise without explanation.

## References
- [docs/roadmap.md](docs/roadmap.md) Phase 0, §12.1
"@ -Labels @("task", "phase-0", "research") | Out-Null

New-GhIssue -Title "[Task] Phase 0: Naming sprint and rebrand prep" -Body @"
## Summary
Two-week naming sprint: territories → shortlist → student test → trademark clearance. Do not spend on visual identity until positioning resonates.

## References
- [docs/roadmap.md](docs/roadmap.md) §3 Brand replacement plan
"@ -Labels @("task", "phase-0", "research") | Out-Null

# ── Phase 1 Stories ──────────────────────────────────────────────

$s1_intake = New-GhIssue `
    -Title "[Story] Phase 1: Multi-format source intake" `
    -Body @"
## Summary
Replace URL/topic-only intake with PDF, paste text, URL, and topic inputs plus extraction preview.

## Exit gate
≥90% of supported clean sources produce a usable preview; unsupported sources fail clearly.

## Scope
- Input order: PDF upload, paste text, URL, topic (topic labeled less grounded)
- Extraction preview, confidence, editable exclusions
- Source hash for cache reuse
- Local structures: sources / source_versions / source_chunks (IDB first)

## Key files
- ``src/features/welcome/WelcomeModal.tsx``
- ``src/lib/fetchSourceContent.ts``

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 2, §5.2 Source intake
"@ `
    -Labels @("story", "phase-1", "priority-high")

$s1_citations = New-GhIssue `
    -Title "[Story] Phase 1: Citations and trust layer" `
    -Body @"
## Summary
Ground every explanation and question in the learner's source with visible evidence.

## Exit gate
Citation coverage and validity meet initial threshold on evaluation set.

## Scope
- Passage-level refs on concepts and quiz items (extend ``sourceReference``)
- UI: show evidence, generated-fallback labeling, report a problem
- Deterministic checks: citation, answerability, duplication around pipeline

## Key files
- ``src/shared/types.ts``
- ``src/lib/pipeline.ts``

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 3, §5.2, §9.1
"@ `
    -Labels @("story", "phase-1", "priority-high")

$s1_diagnostic = New-GhIssue `
    -Title "[Story] Phase 1: Diagnostic-first five-minute learning path" `
    -Body @"
## Summary
Replace full 11–20 question journey with diagnostic-first path: one concept → one retrieval → remediate → continue.

## Exit gate
Median time to first practice <90s; ≥50% of accepted generations reach first graded answer.

## Scope
- Reorder pipeline around first useful output
- Stream first practiceable item while rest generates
- Partial-result recovery and idempotency
- Cache normalized sources and safe generated artifacts
- Five-minute completion with continue/schedule/finish choices

## Key files
- ``src/lib/pipeline.ts``
- ``src/app/App.tsx``

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 4, §5.4–5.6
"@ `
    -Labels @("story", "phase-1", "priority-high")

$s1_activation = New-GhIssue `
    -Title "[Story] Phase 1: Activation hardening" `
    -Body @"
## Summary
Improve first-loop completion: remediation, mobile recovery, TTS honesty, E2E coverage.

## Exit gate
First-loop completion improves; mobile/desktop completion gap shrinking.

## Scope
- Incorrect-answer remediation with changed retrieval
- Mobile retry/skip recovery parity with desktop
- Ship ``/api/tts`` or remove server TTS claims (Web Speech fallback)
- E2E for first graded answer against mocked function contract

## Key files
- ``src/features/canvas/MobileFocusView.tsx``
- ``src/features/canvas/CanvasPage.tsx``
- ``src/lib/llm/tts.ts``

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 5
"@ `
    -Labels @("story", "phase-1", "priority-high", "accessibility")

# Phase 1 Tasks
New-GhIssue -Title "[Task] PDF upload intake with extraction preview" -Body "Part of #$s1_intake" -Labels @("task", "phase-1", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Paste text intake with extraction preview" -Body "Part of #$s1_intake" -Labels @("task", "phase-1", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Source preview with editable exclusions and confidence" -Body "Part of #$s1_intake" -Labels @("task", "phase-1", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Source hash and normalized source/chunk structures" -Body "Part of #$s1_intake`n`nIntroduce sources, source_versions, source_chunks in IDB." -Labels @("task", "phase-1", "priority-medium") | Out-Null

New-GhIssue -Title "[Task] Passage-level citation schema and pipeline population" -Body "Part of #$s1_citations`n`nPopulate sourceReference and question-level refs from outline/content prompts." -Labels @("task", "phase-1", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Show evidence UI and generated-fallback labeling" -Body "Part of #$s1_citations" -Labels @("task", "phase-1", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Report a problem flow for generated content" -Body "Part of #$s1_citations" -Labels @("task", "phase-1", "priority-medium") | Out-Null
New-GhIssue -Title "[Task] Pipeline quality checks: citation, answerability, duplication" -Body "Part of #$s1_citations`n`nDeterministic validations around ``src/lib/pipeline.ts``." -Labels @("task", "phase-1", "priority-high") | Out-Null

New-GhIssue -Title "[Task] Reorder pipeline for diagnostic-first flow" -Body "Part of #$s1_diagnostic`n`nOne concept → one retrieval → grade → remediate → continue choice." -Labels @("task", "phase-1", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Stream first practiceable item during background generation" -Body "Part of #$s1_diagnostic" -Labels @("task", "phase-1", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Partial-result recovery and generation idempotency" -Body "Part of #$s1_diagnostic" -Labels @("task", "phase-1", "priority-medium") | Out-Null
New-GhIssue -Title "[Task] Cache normalized sources and generated artifacts" -Body "Part of #$s1_diagnostic" -Labels @("task", "phase-1", "priority-medium") | Out-Null

New-GhIssue -Title "[Task] Incorrect-answer remediation with changed retrieval" -Body "Part of #$s1_activation`n`nShow source passage, explain once, ask changed question. No same-item loops." -Labels @("task", "phase-1", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Mobile retry/skip recovery parity with desktop" -Body "Part of #$s1_activation`n`nPort CanvasPage recovery panel to MobileFocusView or shared shell." -Labels @("task", "phase-1", "priority-high", "accessibility") | Out-Null
New-GhIssue -Title "[Task] TTS: ship /api/tts or declaim server TTS" -Body "Part of #$s1_activation`n`n``functions/api/tts.ts`` missing; either implement or rely on Web Speech only." -Labels @("task", "phase-1", "priority-medium") | Out-Null
New-GhIssue -Title "[Task] E2E test for first graded answer (mocked functions)" -Body "Part of #$s1_activation" -Labels @("task", "phase-1", "priority-high") | Out-Null

# ── Phase 2 Stories ──────────────────────────────────────────────

$s2_planning = New-GhIssue `
    -Title "[Story] Phase 2: Exam goal setup and study planning" `
    -Body @"
## Summary
Ask exam date, confidence, and available study time; generate a short plan instead of an undifferentiated lesson.

## Exit gate
Learners leave first session with at least one future due review (plan created).

## References
- [docs/roadmap.md](docs/roadmap.md) Phase 2, §5.3 Goal setup
"@ `
    -Labels @("story", "phase-2", "priority-high")

$s2_scheduler = New-GhIssue `
    -Title "[Story] Phase 2: Spaced review scheduler and Today inbox" `
    -Body @"
## Summary
Fix scheduler so completed concepts re-enter spaced review; make Today the default home.

## Exit gate
Day-7 return and due-review completion meet targets; completed concepts reliably re-enter review.

## Scope
- Fix ``learningProgress.ts`` — completed concepts must return for review
- Transparent baseline intervals (1d → 3d → 7d → 14d → 30d)
- Today inbox: due reviews, urgency grouping, review cap, snooze
- Durable-recall dashboard (not streaks)

## Key files
- ``src/shared/learningProgress.ts``
- ``src/app/ProgressScreen.tsx``

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 8–9, §6.3
"@ `
    -Labels @("story", "phase-2", "priority-high")

$s2_auth = New-GhIssue `
    -Title "[Story] Phase 2: Magic-link auth and local-first cloud sync" `
    -Body @"
## Summary
Add Supabase magic-link identity with local-first sync and explicit conflict rules.

## Exit gate
No lost attempts in sync test matrix; anonymous work migrates without duplication.

## Scope
- Repository interfaces so local/cloud storage don't leak through UI
- Magic-link auth, anonymous-to-account linking
- Append-only attempt sync, versioned metadata, tombstones
- Preserve sessionStore/pipeline race protections

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 6–7, §8.2–8.4
"@ `
    -Labels @("story", "phase-2", "priority-high")

$s2_reminders = New-GhIssue `
    -Title "[Story] Phase 2: Opt-in reminders and learning dashboard" `
    -Body @"
## Summary
Email reminders after intrinsic return is measured; dashboard centered on due work and durable recall.

## Exit gate
Day-7 return reaches target or shows clear improving trend.

## Scope
- Notification preferences, timezone, quiet hours
- Durable recalls this week, weak concepts, exam readiness range
- Never streak-first design

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 10, §5.7–5.8
"@ `
    -Labels @("story", "phase-2", "priority-medium")

# Phase 2 Tasks
New-GhIssue -Title "[Task] Fix learningProgress: completed concepts re-enter spaced review" -Body "Part of #$s2_scheduler`n`nRemove skip of completed concepts in getNextLearningAction; implement baseline intervals." -Labels @("task", "phase-2", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Today review inbox with cap, snooze, and urgency grouping" -Body "Part of #$s2_scheduler`n`nMake Today the default signed-in home." -Labels @("task", "phase-2", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Durable recall dashboard (not streaks)" -Body "Part of #$s2_scheduler" -Labels @("task", "phase-2", "priority-medium") | Out-Null
New-GhIssue -Title "[Task] Exam date, confidence, and study-time goal setup" -Body "Part of #$s2_planning" -Labels @("task", "phase-2", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Supabase magic-link authentication" -Body "Part of #$s2_auth" -Labels @("task", "phase-2", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Repository interfaces for local and cloud storage" -Body "Part of #$s2_auth" -Labels @("task", "phase-2", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Local-first sync queue with conflict rules" -Body "Part of #$s2_auth`n`nAppend-only attempts, tombstones, idempotent ops, two-device tests." -Labels @("task", "phase-2", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Anonymous-to-account migration" -Body "Part of #$s2_auth" -Labels @("task", "phase-2", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Opt-in email reminders and notification preferences" -Body "Part of #$s2_reminders" -Labels @("task", "phase-2", "priority-medium") | Out-Null

# ── Phase 3 Stories ──────────────────────────────────────────────

$s3_model = New-GhIssue `
    -Title "[Story] Phase 3: Concept-level knowledge model" `
    -Body @"
## Summary
Tie every question and assessment to concept-level evidence: attempts, hints, confidence, delayed outcomes.

## Exit gate
Policy decisions reproducible from recorded evidence.

## References
- [docs/roadmap.md](docs/roadmap.md) Phase 3, §6.1–6.2
"@ `
    -Labels @("story", "phase-3", "priority-high")

$s3_adaptive = New-GhIssue `
    -Title "[Story] Phase 3: Adaptive activity selection policy" `
    -Body @"
## Summary
Select next activity from evidence: encoding failure → explanation; repeated failure → easier retrieval; mastery → transfer; stable success → wider spacing.

## Exit gate
Adaptive cohorts outperform static on 7-day recall OR claim is removed.

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 11–12, §6.4
"@ `
    -Labels @("story", "phase-3", "priority-high")

$s3_exam = New-GhIssue `
    -Title "[Story] Phase 3: Exam mode and targeted recovery plan" `
    -Body @"
## Summary
Generate exam-style sessions from weak concepts; end with recovery plan, not only a score.

## Exit gate
Exam mode produces actionable weakness info without inflating mastery from immediate retesting.

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 13
"@ `
    -Labels @("story", "phase-3", "priority-medium")

$s3_quality = New-GhIssue `
    -Title "[Story] Phase 3: Internal quality console and adaptive validation" `
    -Body @"
## Summary
Build quality console for prompt/model comparisons; run adaptive vs static experiment on 7-day recall.

## Exit gate
Quality regression detectable and rollbackable within one working day; adaptive path validated or claim dropped.

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 14–15
"@ `
    -Labels @("story", "phase-3", "priority-high")

# Phase 3 Tasks
New-GhIssue -Title "[Task] Attempt evidence schema (latency, hints, confidence, delayed context)" -Body "Part of #$s3_model" -Labels @("task", "phase-3", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Mastery state: stability, retrievability, next due, misconception tags" -Body "Part of #$s3_model" -Labels @("task", "phase-3", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Adaptive policy rules for encoding/retrieval/transfer/spacing" -Body "Part of #$s3_adaptive" -Labels @("task", "phase-3", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Item variant generation and reuse controls" -Body "Part of #$s3_adaptive" -Labels @("task", "phase-3", "priority-medium") | Out-Null
New-GhIssue -Title "[Task] Prerequisite remediation when application fails" -Body "Part of #$s3_adaptive" -Labels @("task", "phase-3", "priority-medium") | Out-Null
New-GhIssue -Title "[Task] Exam mode session assembly from weak concepts" -Body "Part of #$s3_exam" -Labels @("task", "phase-3", "priority-medium") | Out-Null
New-GhIssue -Title "[Task] Internal quality console (prompt/model/regression dashboard)" -Body "Part of #$s3_quality" -Labels @("task", "phase-3", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Adaptive vs static baseline experiment (7-day recall)" -Body "Part of #$s3_quality" -Labels @("task", "phase-3", "priority-high") | Out-Null

# ── Phase 4 Stories ──────────────────────────────────────────────

$s4_share = New-GhIssue `
    -Title "[Story] Phase 4: Read-only share links and clone for my exam" `
    -Body @"
## Summary
Private-by-default sharing of generated artifacts; recipients preview without account; clone creates independent plan.

## Exit gate
No private source leakage; ≥8% share-view-to-activation.

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 16–17, §5.9
"@ `
    -Labels @("story", "phase-4", "priority-high")

$s4_groups = New-GhIssue `
    -Title "[Story] Phase 4: Private course groups and collaborative corrections" `
    -Body @"
## Summary
Invitation-only course groups with shared paths and corrections; individual mastery stays private. No feed or chat.

## Exit gate
Groups increase activation/retention enough to justify complexity; otherwise revert to simple share links.

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 18
"@ `
    -Labels @("story", "phase-4", "priority-medium")

$s4_public = New-GhIssue `
    -Title "[Story] Phase 4: Source-permitted public study pages" `
    -Body @"
## Summary
Publish selected source-safe, corrected study paths for search distribution.

## Exit gate
Public artifacts attract qualified learners and remain operationally safe.

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 19
"@ `
    -Labels @("story", "phase-4", "priority-medium")

# Phase 4 Tasks
New-GhIssue -Title "[Task] Share link creation with source-safety inspection" -Body "Part of #$s4_share" -Labels @("task", "phase-4", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Anonymous share preview and clone for my exam" -Body "Part of #$s4_share" -Labels @("task", "phase-4", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Clone lineage, deduplicated artifact reuse, referral attribution" -Body "Part of #$s4_share" -Labels @("task", "phase-4", "priority-medium") | Out-Null
New-GhIssue -Title "[Task] Private course groups with roles and moderation" -Body "Part of #$s4_groups" -Labels @("task", "phase-4", "priority-medium") | Out-Null
New-GhIssue -Title "[Task] Public study pages with takedown and indexing controls" -Body "Part of #$s4_public" -Labels @("task", "phase-4", "priority-medium") | Out-Null

# ── Phase 5 Stories ──────────────────────────────────────────────

$s5_entitlements = New-GhIssue `
    -Title "[Story] Phase 5: Usage ledger and server-side entitlements" `
    -Body @"
## Summary
Server-verified quotas, usage ledger, export/deletion. Free tier: ~3 imports/mo + unlimited reviews of existing concepts.

## Exit gate
Entitlements cannot be bypassed from client; learners understand free vs paid.

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 20, §13
"@ `
    -Labels @("story", "phase-5", "priority-high")

$s5_billing = New-GhIssue `
    -Title "[Story] Phase 5: Stripe billing and subscription lifecycle" `
    -Body @"
## Summary
Stripe Checkout, Customer Portal, signed webhooks, idempotency. Due reviews stay accessible through cancellation.

## Exit gate
Billing state consistent under duplicate/delayed/failed webhooks.

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 21
"@ `
    -Labels @("story", "phase-5", "priority-high")

$s5_paywall = New-GhIssue `
    -Title "[Story] Phase 5: Paywall experiments and pricing research" `
    -Body @"
## Summary
Test ~3 free imports, Pro at `$5.99–$9.99`/mo and `$39–$59`/yr. Never paywall due reviews.

## Exit gate
Paid conversion encouraging without damaging activation or review retention.

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 22, §13
"@ `
    -Labels @("story", "phase-5", "priority-medium")

$s5_economics = New-GhIssue `
    -Title "[Story] Phase 5: Unit economics optimization" `
    -Body @"
## Summary
Route tasks to lowest-cost passing model; improve cache hits; target lesson cost <`$0.20`, gross margin >75%.

## Exit gate
Target lesson cost and gross margin reached at maintained quality.

## References
- [docs/roadmap.md](docs/roadmap.md) Sprint 23
"@ `
    -Labels @("story", "phase-5", "priority-high")

# Phase 5 Tasks
New-GhIssue -Title "[Task] Usage ledger and server-side quota enforcement" -Body "Part of #$s5_entitlements" -Labels @("task", "phase-5", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Data export and deletion workflows" -Body "Part of #$s5_entitlements" -Labels @("task", "phase-5", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Stripe Checkout and Customer Portal integration" -Body "Part of #$s5_billing" -Labels @("task", "phase-5", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Webhook idempotency and entitlement reconciliation tests" -Body "Part of #$s5_billing" -Labels @("task", "phase-5", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Paywall UI at generation boundary (never on due reviews)" -Body "Part of #$s5_paywall" -Labels @("task", "phase-5", "priority-medium") | Out-Null
New-GhIssue -Title "[Task] Model routing to lowest-cost passing model per task" -Body "Part of #$s5_economics" -Labels @("task", "phase-5", "priority-high") | Out-Null
New-GhIssue -Title "[Task] Source and artifact cache optimization" -Body "Part of #$s5_economics" -Labels @("task", "phase-5", "priority-medium") | Out-Null

# ── Cross-cutting ────────────────────────────────────────────────

New-GhIssue `
    -Title "[Task] Expand test matrix per roadmap definition of done" `
    -Body @"
## Summary
As roadmap systems land, add tests beyond current ``npm test`` baseline.

## Checklist
- [ ] API contract tests against deployed preview functions
- [ ] Gateway security tests (chat + fetch)
- [ ] Sync conflict tests
- [ ] Accessibility automation + manual checks
- [ ] Generation quality evaluation runner
- [ ] Billing webhook/idempotency tests
- [ ] E2E: anonymous activation, account linking, review, sharing, subscription

## References
- [docs/roadmap.md](docs/roadmap.md) §20 Definition of done
"@ `
    -Labels @("task", "priority-medium", "consistency") | Out-Null

Write-Host "`nDone. View issues: https://github.com/hasitpbhatt/quizify/issues"
