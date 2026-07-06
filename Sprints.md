# Adaptive Learning OS (ALOS) — Project Roadmap & Sprint Plan

This document outlines the end-to-end development process for the Adaptive Learning Platform, broken down into logical sprints. It serves as our master plan to keep track of what has been built, what we are currently building, and what comes next.

---

## ✅ Sprint 1: Foundation & Authentication — COMPLETE
**Goal:** Establish the monorepo architecture, database schemas, and a secure, robust authentication system.

- **Infrastructure:** 
  - Set up Next.js (Frontend) and NestJS (Backend) monorepo.
  - Configure PostgreSQL with Prisma ORM.
  - Set up Tailwind CSS, Radix UI, and Framer Motion with a dark/glassmorphism aesthetic.
- **Backend:**
  - `User`, `UserProfile`, and `RefreshToken` Prisma schemas.
  - Firebase Admin integration for Phone OTP.
  - JWT generation and Redis integration for token blacklisting. 
- **Frontend:**
  - Login & Registration UI (Email, Google, Phone OTP).
  - Axios interceptors for handling authentication tokens securely.

---

## ✅ Sprint 2: Knowledge Graph (Neo4j) Integration — COMPLETE
**Goal:** Implement the core structural intelligence of the platform by mapping concepts, prerequisites, and relationships using a graph database.

- **Infrastructure:**
  - Provision Neo4j AuraDB (or local Docker).
  - Set up `neo4j.service.ts` in the NestJS backend.
- **Backend:**
  - Define Cypher queries for creating `Concept` nodes and `REQUIRES`, `LEADS_TO`, `RELATED_TO` relationships.
  - Create the `KnowledgeGraphModule` to sync/mirror relational domain data (like Domain: DSA, System Design) into the graph.
  - Build endpoints to fetch a learning path or concept map.
- **Frontend:**
  - Build a visual interactive Knowledge Graph UI (using libraries like `react-force-graph-2d`).
  - Allow users to click on nodes to see concept details and their current mastery level.

---

## ✅ Sprint 3: LLM Question Generation & Assessment Engine — COMPLETE
**Goal:** Build the engine that serves educational content, tracks user answers, and utilizes AI to generate dynamic questions.

- **Backend:**
  - `Question` and `QuestionAttempt` Prisma schemas.
  - Integrate an LLM provider (OpenAI / Gemini / Anthropic) via a dedicated NestJS service to auto-generate questions based on Neo4j concepts.
  - Build the Assessment API: fetching questions by difficulty, submitting answers, validating correctness, and calculating partial scores.
- **Frontend:**
  - Create the "Learning Session" UI wrapper.
  - Build specialized UI components for different `QuestionType`s (MCQ, Code Snippet, True/False).
  - Implement instantaneous feedback and hint reveals.

---

## ✅ Sprint 4: Adaptive Engine & Mastery Tracking — COMPLETE
**Goal:** Make the platform truly *adaptive* by implementing spaced repetition, forgetting curves, and dynamic recommendations.

> **Delivered:** FSRS-4.5 algorithm, confidence ratings (1–4 grade), Smart Review Session (`?mode=review`), Optimal Learning Window badge, radar chart mastery visualization, retention sparklines, XP streak multiplier (up to 2×), achievement system (10 types), level-up animations, weekly digest, fading-soon alerts.

- **Backend:**
  - `ConceptMastery` and `LearningStreak` schemas.
  - Implement the Ebbinghaus Forgetting Curve algorithm (calculating `retentionScore` and `nextRevisionDue`).
  - Build the **Recommendation Engine**: Combine Neo4j prerequisites + PostgreSQL mastery data to suggest what the user should learn next (Learn New vs. Revise).
- **Frontend:**
  - "Up Next" dashboard widget displaying the prioritized recommendations.
  - Mastery visualization (progress bars, radar charts for domains).
  - End-of-session summary screens (XP earned, streak updates, mastery leveled up).

---

## ✅ Sprint 5: Student Dashboard & Gamification — COMPLETE
**Goal:** Polish the core user loop, adding gamification elements to maximize retention and engagement.

> **Delivered:** Global leaderboard with animated podium (top 50 by XP), Profile settings page (bio, institution, timezone, daily goal), Streak Freeze widget (manual use + auto-consume on missed days), `LearningEvent` analytics event sourcing on every attempt, due-concepts count on dashboard stats, passive streak break detection on every dashboard load.

- **Backend:**
  - Enhance `LearningEvent` event sourcing to track detailed analytics (Time spent per concept, hints used).
  - Leaderboard endpoints (fetching top users by XP in a specific domain).
- **Frontend:**
  - Main Student Dashboard view.
  - Activity heatmaps (similar to GitHub contributions).
  - "Streak freezes" and level-up animations using Framer Motion.
  - User profile settings (updating bio, target exams, timezone).

---

## 🔧 Pre-Sprint 6 Hardening — COMPLETE
> Gap fixes completed before starting the Admin Portal sprint:
> - **Streak break detection:** `checkAndBreakStreak()` fires passively on every `/tracker/stats` call — no cron needed
> - **Due concepts banner:** Dashboard shows `🔔 N concepts due → Start Review Session` linked to `?mode=review`
> - **KG → Practice deep link:** Knowledge Graph "Practice This Concept" button navigates to `/practice?concept=ID`
> - **LearningEvent analytics:** Every `submitAttempt` now creates a `LearningEvent` record with `timeTakenMs`, `hintsUsed`, `xpEarned`, `difficulty`
> - **Sidebar:** All 8 pages (including Leaderboard + Profile) in sidebar with active-state highlighting
> - **Sprints.md:** This file updated to reflect reality

---

## ✅ Sprint 6: Admin/Teacher Portal — COMPLETE
**Goal:** Provide tooling for content moderation and platform oversight.

> **Delivered:**
> - `@Roles()` decorator + `RolesGuard` — RBAC on every `/admin/*` route (ADMIN/TEACHER). Role-mutation routes further restricted to ADMIN only.
> - `AdminModule` backend: platform analytics (DAU/WAU/MAU, global accuracy, avg session time, 14-day trend, top concepts by engagement), paginated user list with search + role/active management, paginated question list with domain/difficulty filters + edit + soft-delete.
> - `/admin` portal (separate layout, auth-gated): Overview dashboard, Users table, Questions moderation, Analytics deep-dive — all with toast notifications and pagination.
> - Student sidebar shows 🛡️ Admin Portal link conditionally for ADMIN/TEACHER users.
> - `authApi.me()` now always called on dashboard load to keep role info fresh.

---

## 🚀 Sprint 7: Polish, Notifications & Deployment
**Goal:** Prepare the platform for production traffic, real-time features, and final optimizations.

- **Backend:**
  - WebSockets (`@nestjs/websockets`) for real-time notifications (e.g., "You lost your streak!").
  - Email/SMS integrations for daily reminders (Cron jobs via `@nestjs/schedule`).
  - Rate limiting (`@nestjs/throttler`), Helmet, and performance optimizations.
- **Frontend:**
  - Responsive design polish for mobile devices.
  - Service Workers for PWA support / offline caching.
- **Infrastructure:**
  - Setup CI/CD pipelines (GitHub Actions).
  - Deploy NestJS to a managed container service (e.g., Google Cloud Run, AWS ECS, or Railway).
  - Deploy Next.js to Vercel.

---

> [!TIP]
> **How to use this document:**
> Whenever we start a new session, we can refer to this roadmap. If you have specific ideas or want to pivot (e.g., focusing heavily on the Neo4j graph before the LLM engine), we can adjust these sprints at any time!
