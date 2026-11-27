# Research & Comparative Study

> Why the v2 architecture looks the way it does. Each section compares the realistic options and records the decision.
> Evidence quality varies: several cited works are 2025–2026 preprints. Treat specific numbers as indicative and re-check them before relying on them.

## 1. v1 vs v2

| Area | v1 (tag `legacy-v1`) | v2 | Reason |
|---|---|---|---|
| Services | NestJS API + Next.js + Python ML service (mostly empty) | One Next.js app + `packages/engine` | Fewer moving parts; the ML service never materialised |
| Stores | Postgres + Neo4j AuraDB + Redis | Postgres (+ pgvector) | The Neo4j instance was lost; the concept graph is small enough for Postgres |
| LLM | Groq / Llama 3.3 70B, single prompt → questions | Claude agent team with tools, verification, grounding | v1 never verified the questions it generated |
| Learner model | FSRS-4.5 hand-coded, mastery = accuracy | Graph-aware BKT + Elo/IRT + FSRS-6 + affect + ZPD | Separates knowledge, memory and difficulty; supports calibration |
| Adaptivity | Difficulty buckets, review mode | Next-best-action policy + adaptive UX policy + Director re-planning | The whole experience adapts, not just the difficulty label |
| Transparency | none | Open learner model, "why" on every decision, agent activity feed | Trust and metacognition |
| Evals | none | Engine sims, item/tutor/RAG/director suites, online metrics | See EVALS.md |

## 2. Learner modelling

| Option | Strengths | Weaknesses | Verdict |
|---|---|---|---|
| **BKT** | Interpretable per-skill mastery; few parameters; works from day one | Binary skill states; no item difficulty | **Use** for P(known) |
| **Elo / 1PL-IRT** | Learner ability *and* item difficulty update online; ideal for calibrating a growing, LLM-written bank | Single dimension per concept | **Use** for difficulty and item selection |
| **DKT / attention models (SAKT etc.)** | Best predictive accuracy given lots of data | Needs large logs; less interpretable; unstable trajectories | **Later**, once we have data, as a challenger model in evals |
| **LLM as knowledge tracer** | Can read free text | Recent comparisons find specialised KT models more accurate, sub-second vs minutes, and 600–12,000× cheaper; fine-tuned LLMs reach roughly BKT level | **Don't**. LLMs advise; KT models decide |

The consensus across recent LLM-tutor systems is a hybrid: a proper learner model drives decisions, and LLMs handle language. ES-LLMs pairs a BKT learner model with a deterministic, rules-based orchestrator and uses the LLM only for surface realisation. A December 2025 study recommends embedding LLMs in evidence-based learner-modelling frameworks (it reports DKT at AUC 0.83 on next-step prediction).

**Spaced repetition:** SM-2 (fixed ease factors) vs **FSRS** (learned stability/difficulty/retrievability). FSRS-6 with `ts-fsrs` is the current open standard. Its trainable decay (w20) keeps R(S,S) = 0.9.

**Target difficulty:** Pelánek's adaptive-practice work used a 75% target by default. Learners showed a preference for ~65–75%, and an easier condition produced more practice and better learning. Adaptive testing's 50% maximises information, not motivation. → ZPD controller starting at 0.72, moved by affect and the recent success rate.

## 3. Agent orchestration

| Pattern | Example | Pros | Cons | Verdict |
|---|---|---|---|---|
| Single "do-everything" tutor prompt | most chatbot tutors | simple | no verification, state drift, hard to evaluate | No |
| Free-form multi-agent chat (agents talk to each other) | — | flexible | non-deterministic, expensive, hard to debug | No |
| **Specialist agents + centralized learner state + deterministic router** | IntelliCode (centralized versioned learner state); GraphMASAL (Diagnoser / Planner / Tutor with graph path optimisation); ES-LLMs (rules-based orchestrator); ITAS (teaching + lesson-planning agents over a shared knowledge graph) | each agent evaluable in isolation; state is the contract; cheap hot path | more components | **Yes** |
| Many fine-grained agents (≈17 across 5 layers) | Inoubli et al., ITS 2026 | very granular | heavy for a small team | Borrow the ideas (hallucination checks, outcome-level mastery), not the count |

Our 8 agents map onto this pattern: Director ≈ Planner, Diagnostician ≈ Diagnoser, Tutor ≈ Tutor. We add Author/Verifier for content, Architect for curriculum, Coach for metacognition and Librarian for RAG.

## 4. Agent runtime

| Option | Who runs the loop | Fit for us |
|---|---|---|
| Manual Messages-API loop | us | full control, more code |
| **Anthropic SDK Tool Runner** (beta) | SDK, in our process | **Chosen for in-app agents:** short, latency-sensitive, tools are direct DB/engine calls |
| **Claude Managed Agents** (beta) | Anthropic, with hosted sandbox | **Planned for long background jobs** (course build from large documents, nightly cohort analytics): no harness to host, per-session containers |
| Claude Agent SDK | SDK with Claude Code's built-in tools | aimed at coding/filesystem agents; not our shape |
| LangGraph / CrewAI / AutoGen | framework | extra abstraction over the same loop; harder to use provider features (prompt caching, effort, server tools, fallbacks) directly |

## 5. Item generation

| Approach | Notes | Verdict |
|---|---|---|
| Static human bank | highest trust, doesn't scale or personalise | Seed only |
| LLM on the fly, unverified (v1) | scales, but defect rates vary by subject; ELA items in one 2026 review had high defect rates across models | No |
| **Generate → blind-verify → calibrate online** | LLM items can match expert IRT difficulty/discrimination in some settings (2PL study of GPT-4o items; ~1,200-student field study found AI items slightly easier but more discriminating). Verification catches defects, and Elo calibration fixes difficulty from real answers | **Yes** |

**Misconception-driven distractors:** recent work shows LLMs can model misconception-based errors when anchored to a correct solution. Personalised distractors built from a learner's own misconception prototype beat group-level ones. Misconception diagnosis works well as generate → retrieve → rerank against a tutor-defined catalogue. → Each concept carries a misconception catalogue; each distractor is tagged with one, so a wrong MCQ answer is a diagnosis for free, with no LLM call.

## 6. Tutoring style

The Harvard physics RCT (N=194, crossover, *Scientific Reports* 2025) found learning gains with a carefully designed AI tutor roughly double those of an active-learning class. The tutor was built not to hand out solutions, yet was given the full solutions so it would not hallucinate. → Our Tutor holds the key, follows a hint ladder, and is evaluated for answer leakage.

## 7. Learning-science features worth building

| Feature | Evidence | Where |
|---|---|---|
| Retrieval practice with feedback | Classroom meta-analysis: quizzing ≈ g = 0.50 over restudy; retrieval *without* feedback after failure can be useless or harmful | Every item gives feedback; review mode |
| Spacing | FSRS literature | Review scheduling |
| Interleaving | Effect is real but heterogeneous and sometimes reversed | Constrained, mainly in review mode, measured in A/B |
| Desirable difficulties + metacognition | Learners misjudge effective strategies | Coach explains *why* reviews feel hard; calibration feedback |
| Affect-aware intervention | Frustration comes from too much challenge, boredom from too little; boredom predicts later disengagement; affect can be detected from logs alone and even predicted in advance | Affect detector → UX mode + ZPD target |
| Open learner model | Explainability historically comes from KT / model tracing, not LLMs | "Why" panel, mastery map |

## 8. Graph and vector stores

| Need | Option A | Option B | Decision |
|---|---|---|---|
| Concept graph (≤ a few hundred nodes per course) | Neo4j | Postgres adjacency table + recursive CTE | **Postgres**: one store; the Neo4j loss showed the operational risk |
| Vectors | Pinecone / Qdrant | pgvector | **pgvector**: transactional with content; fine at our scale |
| Retrieval | dense only | **hybrid dense + full-text + RRF + graph expansion + contextual chunks** | Hybrid; measured in EVALS §7 |

## 9. Feature backlog from the research (beyond the MVP)

- Learner uploads → per-course RAG and auto-generated course (Architect + Librarian)
- Worked-example → faded-example → independent practice progression for new concepts
- Self-explanation prompts after correct-but-unsure answers
- Confidence-weighted scoring and calibration training
- Teacher view: cohort misconception heatmap, item quality queue, override with audit log
- Study groups with shared sessions (from the v1 roadmap)
- Voice tutor mode; code-execution items via sandboxed runners
- DKT/SAKT challenger model trained on accumulated logs, compared in `evals/engine`
- Managed Agents background jobs for heavy ingestion and nightly analytics

## Sources

- GraphMASAL — graph-based multi-agent system for adaptive learning: https://arxiv.org/abs/2511.11035v1
- IntelliCode — multi-agent LLM tutoring with centralized learner modelling: https://arxiv.org/html/2512.18669
- ES-LLMs — BKT learner model + deterministic orchestrator: https://arxiv.org/abs/2603.23990
- ITAS — teaching and lesson-planning agents over a shared knowledge graph: https://arxiv.org/html/2604.24808v1
- Multi-agent ITS (Inoubli et al.): https://www.lamsade.dauphine.fr/~cazenave/papers/IntelligentTutoringSystems2026.pdf
- Specialised KT models outperform LLMs: https://arxiv.org/abs/2603.02830
- LLMs vs DKT for knowledge tracing / hybrid frameworks: https://arxiv.org/html/2512.23036v1
- LLM knowledge tracing (2024): https://arxiv.org/html/2403.14661v1
- ts-fsrs docs: https://open-spaced-repetition.github.io/ts-fsrs/classes/FSRS.html
- FSRS algorithm notes: https://expertium.github.io/Algorithm.html · benchmark: https://expertium.github.io/Benchmark.html
- Pelánek et al., impact of target success rate: https://www.fi.muni.cz/~xpelanek/publications/aied15.pdf
- Pelánek, Elo in adaptive educational systems: https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf
- Adaptive practice (UMUAI): https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf
- Student-centred evaluation of LLM-generated tests (2PL IRT): https://arxiv.org/abs/2505.06591
- Large-scale field study of AI-generated exams: https://arxiv.org/html/2508.08314v1
- Item-quality review, AIMECON 2026: https://aclanthology.org/2026.aimecon-sessions.29.pdf
- Personalised distractor generation (MCTS): https://arxiv.org/abs/2508.11184
- LLM simulation of student errors for distractors: https://arxiv.org/html/2603.15547v1
- Misconception diagnosis from dialogue (Eedi): https://arxiv.org/html/2602.02414v1
- Harvard AI physics tutor RCT: https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/
- Retrieval practice and learning (review): https://pmc.ncbi.nlm.nih.gov/articles/PMC9781761
- Bjork & Bjork, desirable difficulties: https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf
- Affect & learning in tutors (Baker et al.): https://learninganalytics.upenn.edu/ryanbaker/AIED_SBGH.pdf
- Sensor-free affect detection: https://learninganalytics.upenn.edu/ryanbaker/EDM%20Affect%20Detection%20V22%20final.pdf
- Predicting affect in advance: https://learninganalytics.upenn.edu/ryanbaker/Affect%20Detection%20In%20Advance_Final%20Version.pdf
- LLM learner simulation (Hyp-Mix): https://arxiv.org/abs/2410.02110v2
- Simulating students with LLMs (review): https://arxiv.org/pdf/2511.06078
