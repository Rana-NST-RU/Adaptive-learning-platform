# Adaptive Learning Platform v2: agentic edition

An adaptive learning platform where a **deterministic learner model** tracks what each learner knows, remembers, and feels, and a **team of Claude agents** builds curricula, writes and verifies questions, tutors Socratically, diagnoses misconceptions, and re-plans the session. Questions and the whole UX adapt to the learner's current state.

> 🚧 v2 is being rebuilt from scratch. The previous NestJS + Neo4j implementation is preserved at git tag `legacy-v1`.

## Docs

- [Architecture](docs/ARCHITECTURE.md): agent team, agent flows, RAG pipeline, learner model, data model
- [Evals](docs/EVALS.md): how we measure the engine, the agents, retrieval, and learning outcomes
- [Research & comparative study](docs/RESEARCH.md): options considered, decisions, sources

## At a glance

| Layer | Choice |
|---|---|
| App | Next.js 16 (UI + route handlers), TypeScript |
| Learner model | `packages/engine`: graph-aware BKT, Elo/IRT, FSRS-6, affect detection, ZPD control, adaptive UX policy |
| Agents | Anthropic SDK Tool Runner: Director, Curriculum Architect, Diagnostician, Item Author, Item Verifier, Tutor, Coach, Librarian |
| Data | PostgreSQL (+ pgvector) via Drizzle |
| Evals | simulated learners, item/tutor/RAG/director suites |

## Run locally

Requirements: Node ≥ 20.9, PostgreSQL 15+ with the `pgvector` extension available.

```bash
npm install
createdb alp_dev
cp .env.example apps/web/.env.local   # then set AUTH_SECRET (and ANTHROPIC_API_KEY to enable agents)
npm run db:migrate -w @alp/web        # or: npm run db:push
npm run db:seed
npm run dev                           # http://localhost:3000
npm test                              # engine + web tests (incl. simulated-learner study)
npm run agents:author -w @alp/web -- two-pointers 2   # run Item Author → Verifier for one concept (uses real tokens)
```

Without an Anthropic credential the platform runs on the seeded item bank: the learner model and adaptive UX work fully, and agents switch on once a key is configured.

With agents enabled, learners can also **build a course from any goal** (optionally from their own PDFs, notes or a web page) at `/courses/new`: the Librarian indexes the material, the Curriculum Architect designs the concept graph, and the Item Author/Verifier write the first questions. Set `VOYAGE_API_KEY` to add semantic search to the hybrid retrieval.
