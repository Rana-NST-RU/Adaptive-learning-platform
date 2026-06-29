# Sprint 4 — World-Class Refinement Proposals

## The Goal: Beat Anki, Duolingo & Brilliant

> What makes those systems elite? Personalized scheduling + visual feedback + emotional engagement.
> Every proposal below is chosen to deliver one of those three.

---

## 🏆 Tier 1 — Must-Have (Highest Impact)

### 1. FSRS Algorithm Upgrade ★★★★★
**What:** Replace our simplified Ebbinghaus with **FSRS-4.5** — the current state-of-the-art algorithm
used by Anki, Obsidian Spaced Repetition, and RemNote.

**Why it matters:** FSRS separately models:
- `stability` — how long a memory lasts (days)
- `difficulty` — how hard this concept is *for this user specifically*
- `retrievability` — P(recall) at time t = e^(-t / (9 × stability))

With vanilla Ebbinghaus, every user gets the same forgetting curve. With FSRS, the algorithm
*personalises difficulty* per concept per user over time. A concept you keep getting wrong will
have its interval shrink, while concepts you ace will be spaced out months apart.

**Backend changes:** Update `updateRetention()` with 4-parameter FSRS:
```
w = [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61]
D(difficulty), S(stability), R(retrievability) tracked per ConceptMastery
```
**DB changes:** Add `fsrsDifficulty Float` to `ConceptMastery` schema (new migration, additive).

---

### 2. Confidence Rating After Each Answer ★★★★★
**What:** After submitting an answer, show a "How confident were you?" 1–4 scale:
- 1 = Complete blackout — didn't know at all
- 2 = Wrong but familiar
- 3 = Correct but difficult
- 4 = Correct and easy

**Why it matters:** This is literally how SM-2/FSRS works — the *quality of recall* (not just right/wrong)
determines the next interval. A correct answer with low confidence should have a shorter interval than
a confident correct answer. Currently we only track binary isCorrect.

**Impact:** This makes the forgetting curve 3× more accurate per user.

**Changes:**
- `PracticePage.tsx`: Show 4-button confidence panel in the result phase (after showing explanation)
- `QuestionAttempt` schema: Add `confidenceRating Int?` field
- `submitAttempt` API: Accept optional `confidenceRating` param
- `updateRetention()`: Feed confidenceRating into FSRS ease factor calculation

---

### 3. "Today's Plan" Smart Session Widget ★★★★★
**What:** A prominent dashboard widget (and dedicated route `/dashboard/today`) that generates an
optimised daily study plan:

```
📅 Today's Plan  (est. 22 min)
├── 🔁 Review 4 due concepts        (~12 min)
│    Arrays, Binary Trees, Recursion, Big-O
├── ⚡ Learn 1 new concept           (~8 min)
│    → Dynamic Programming (prerequisites met)
└── 🎯 Practice 1 weak concept     (~5 min)
     → Linked Lists (accuracy: 48%)

[▶ Start Today's Plan]  [Customize →]
```

**Why it matters:** Duolingo's #1 retention driver is "you have a lesson today". A single
personalized CTA beats a list of recommendations. Users don't need to decide — just click Start.

**Changes:**
- `TrackerService.getDailyPlan()` — picks N revisions (by urgency) + 1 LEARN_NEW + 1 PRACTICE
  based on `user.dailyGoalMins`, estimates time per question type
- `GET /tracker/plan` endpoint
- Dashboard widget + `/dashboard/today` full page
- `trackerApi.getDailyPlan()` in api-client

---

### 4. Concept Confidence Self-Assessment ★★★★☆
*Related to #2 but UI-focused:* When a concept hits masteryLevel 4 (Expert), show a monthly
"self-assessment" prompt: *"Still feel confident about Binary Search?"* with a thumbs up/down.
A thumbs down immediately re-queues for revision. This prevents the "graduated card" problem in Anki
where perfectly-scored cards still decay without being tested.

---

## 🥈 Tier 2 — High Impact (Visual/UX)

### 5. Mastery Radar Chart ★★★★☆
**What:** A D3-powered spider/radar chart on the Mastery page showing subcategory strengths.

For DSA:
- Arrays & Strings, Linked Lists, Trees & Graphs, Dynamic Programming, Sorting & Searching,
  Bit Manipulation, System Design (sub-scores)

Each axis = average masteryScore of concepts in that category (from Neo4j tags).
A filled polygon shows strengths/weaknesses at a glance. Rotating the chart animates in.

**Changes:**
- Add `tags`/`category` grouping logic in `getMasteryOverview()`
- SVG radar chart component (pure SVG, no heavy library)

---

### 6. Retention Decay Sparklines ★★★★☆
**What:** On each concept card in the Mastery page, show a tiny 7-day SVG sparkline
showing predicted retention decay:

```
Binary Trees  ████░░░░░░  47%  [due in 2h]
              day 1  →  day 7
```

The sparkline is computed as `R(t) = e^(-t / (9 × stability))` for t = 0..7 days.
No API call needed — computed client-side from `memoryStrength` already in the payload.

**Changes:**
- `RetentionSparkline` SVG component in mastery page (pure client-side math, no new API)

---

### 7. Smart Review Session ("Review Now" Button) ★★★★★
**What:** On the Mastery page and dashboard, a **"Review Due Now"** button that launches a
practice session pre-loaded with only the due/fading concepts, sorted by urgency
(lowest retention first), with AI-generated questions targeting those specific concepts.

Flow:
1. User clicks "Review 4 Concepts Due"
2. POST `/tracker/plan/review-session` → returns `[{conceptId, conceptName, difficulty}]` sorted by retention ASC
3. Frontend pre-fills the Practice page with all those concepts in sequence
4. After each concept's questions, moves to the next one automatically

This makes the system feel like it's **actively coaching**, not just showing data.

**Changes:**
- `GET /tracker/due-concepts` — returns concepts where `nextRevisionDue <= now` sorted by retention
- Practice page: Accept `?reviewMode=true&concepts=c1,c2,c3` query params to pre-load a review queue
- Mastery page: "Review All Due (N)" CTA button

---

### 8. Streak XP Multiplier ★★★★☆
**What:** Streaks give an XP bonus, shown in the UI:
- 3+ days = 1.2× multiplier
- 7+ days = 1.5× multiplier
- 14+ days = 1.75× multiplier
- 30+ days = 2.0× multiplier

Shown as a badge: `🔥 +50 XP (×1.5 streak bonus!)` in the post-answer XP animation.

**Changes:**
- `QuestionsService.calculateXP()` — multiply base XP by streak tier
- `TrackerService.getStreakMultiplier(userId)` helper
- Practice page XP animation shows the multiplier

---

## 🥉 Tier 3 — Polish & Delight

### 9. Session Quality Grade ★★★☆☆
**What:** End-of-session summary shows a letter grade (A/B/C/D) based on:
```
Quality = (accuracy × 0.5) + (speed_score × 0.3) + (hints_penalty × 0.2)
```
A = 90%+, B = 75%+, C = 60%+, D = <60%

Shown with a large animated grade badge + breakdown chart. Similar to Duolingo's score screen.

**Changes:** Client-side calculation in `SummaryView` — no new API needed.

---

### 10. Mastery Level-Up Animation ★★★☆☆
**What:** When `masteryLevel` increases (e.g., Intermediate → Advanced), show a
full-screen confetti burst + animated "LEVEL UP: Advanced" card with the concept name.
Tracked by comparing `prevLevel` vs new `masteryLevel` in the `submitAttempt` response.

**Changes:**
- `submitAttempt` API response: add `newMasteryLevel`, `prevMasteryLevel` fields
- Practice page: Detect level-up in `result` and trigger the animation overlay

---

### 11. "Optimal Learning Window" Badge ★★★☆☆
**What:** Analyse `QuestionAttempt.timestamp` patterns → detect user's historically best
accuracy time-of-day → show a badge: *"You retain best at 9–11am 🌅"*

**Changes:**
- `GET /tracker/insights` — aggregates attempts by hour, finds peak accuracy hour range
- Dashboard sidebar stat

---

## Summary Table

| # | Feature | Impact | Effort | Tier |
|---|---|---|---|---|
| 1 | FSRS Algorithm | Algorithm accuracy 3× better | Medium | 🏆 |
| 2 | Confidence Rating | Personalisation | Low | 🏆 |
| 3 | Today's Plan widget | Daily engagement driver | Medium | 🏆 |
| 7 | Smart Review Session | Closes the loop | Medium | 🏆 |
| 5 | Radar Chart | Visual wow factor | Low | 🥈 |
| 6 | Retention Sparklines | Data literacy | Very Low | 🥈 |
| 8 | Streak XP Multiplier | Gamification | Low | 🥈 |
| 9 | Session Quality Grade | Emotional feedback | Very Low | 🥉 |
| 10 | Mastery Level-Up Anim | Delight | Low | 🥉 |
| 11 | Optimal Window Badge | Insight | Low | 🥉 |

## Open Questions
> Which tier should we start with? I recommend: **2 → 7 → 3 → 5 → 6** (max impact, lowest effort first).
