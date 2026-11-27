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
