# Investability Assessment: Quizify

A composite evaluation from a mock committee of 10 top-tier VC firms (a16z, Sequoia, Insight Partners, General Catalyst, Thrive Capital, Tiger Global, Lightspeed, Accel, NEA, Index Ventures).

**Date:** July 21, 2026
**Score: 4 / 10** (Seed-stage investability)

---

## What Gets Our Attention (the signals)

### Product execution is exceptional for an MVP

- **Design taste**: Notebook view (ruled lines, handwriting font, typewriter animation, TTS narration) shows genuine craft. Most AI learning tools are sterile — this has soul.
- **Engineering depth**: LLM orchestration with retry/backoff, mutex-guarded IndexedDB concurrency, multi-layer error boundaries, abort propagation, concurrent pipeline infrastructure. You solved hard problems.
- **Learning science awareness**: Outline → expand → quiz → summary loop, 4 persona levels, 6 quiz formats (including LLM-graded free text), spaced repetition schema already in types. Someone here understands pedagogy.

### Market timing is strong

- AI + EdTech is the hottest category in 2026. NotebookLM validated the "ingest URL → learn" pattern; you have a differentiated take.
- Multi-modal (read + quiz + audio) is what the next generation of learning tools looks like.

---

## Why We're Not Writing a Check (the dealbreakers)

### 1. No business model (P0 blocker)

The app is entirely free, local, and anonymous:
- No accounts, no auth, no gating
- No pricing, Stripe, or subscription
- "Bring your own API key" caps TAM at developers
- Experimental server proxy with unknown unit economics

Without a revenue model, this is a gift, not a business. We need to see willingness-to-pay validated — even $5/mo × 100 users is worth more than 10k anonymous MAU.

### 2. No distribution strategy

How do users find Quizify? How does it grow?
- No sharing ("share this canvas")
- No embeddable widget for blogs/courses
- No SEO surface (no public content)
- No team/institutional purchase path
- No referral loop

A great product with no distribution plan is a hobby.

### 3. Episodic usage, zero retention

User journey: paste URL → generate → explore → done.
- No spaced repetition reminders (schema exists, unimplemented)
- No daily quiz digests
- No streak / progress mechanics
- No cross-session review dashboard

Without a habit loop, LTV is near-zero. You monetize a one-time transaction or nothing.

### 4. Toxic unit economics (unproven)

Each 10-concept canvas = 1 outline call + 10 concept calls + 1 summary call + grading calls. Estimate ~$0.50–1.00 in LLM API costs per canvas at Mistral/NVIDIA rates.

If you proxy (Quizify Default), you eat this cost. At scale with thousands of daily canvases, gross margin is negative unless pricing is multiples above cost. If users BYO key, adoption is capped at technical users who already have API access.

We need to see: *What's the gross margin at 10k daily canvases?* and *What price makes unit math work?*

### 5. No beachhead audience

"Anyone who wants to learn from a URL" is not a customer segment. Successful EdTech companies own a specific pain point:
- Anki = med students
- Duolingo = casual language learners
- Brilliant = interactive STEM for curious professionals

Who is Quizify's *must-have* user? If you can't answer in one sentence, you can't market.

### 6. Weak competitive moat

NotebookLM, ChatGPT, Claude, Perplexity all do "explain this content." Your differentiators (node canvas, quizzes, notebook view) are real but copyable in weeks. Defensible moats not yet built:
- No user-generated canvas library
- No embedding ecosystem
- No institutional data flywheel
- No network effects

---

## What Would Move the Needle to 7+

| Priority | Action | Impact |
|----------|--------|--------|
| P0 | Ship a paid tier (Free: 3 canvases, Pro: $10/mo unlimited + sync) | Validates WTP, starts revenue |
| P0 | Pick one beachhead (certification prep / CS students / MCAT) | Focused GTM, measurable PMF |
| P1 | Add accounts + cloud sync | Enables retention, email, charging |
| P1 | Build sharing loop (public canvas URLs) | Distribution + SEO |
| P2 | Ship SRS reminders | Creates habit loop |
| P2 | Enable UGC canvas marketplace | Community moat |
| P2 | Reveal team background | VCs invest in people |

---

## Verdict

**4/10** — Impressive product, zero business.

The gap to investable (7+) is commercial execution. The product is good enough. Build a revenue model, find one audience that loves you, and show retention data. Do that and we'll compete to lead your seed.
