import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Send HTTP-only cookies on every request
  headers: { 'Content-Type': 'application/json' },
});

// Auto-attach access token from localStorage on every request
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// ─── 401 Auto-Refresh Interceptor ─────────────────────────────
// When any request returns 401, try to silently refresh the JWT.
// If the refresh succeeds, retry the original request once.
// If it fails, clear local state and redirect to /login.

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // Only intercept 401s that haven't already been retried
    if (error.response?.status !== 401 || original._retried) {
      return Promise.reject(error);
    }
    original._retried = true;

    // Don't intercept auth endpoints themselves (avoid infinite loops)
    if (original.url?.includes('/auth/')) {
      return Promise.reject(error);
    }

    if (typeof window === 'undefined') return Promise.reject(error);

    const user = JSON.parse(localStorage.getItem('user') ?? 'null');
    const refreshToken = localStorage.getItem('refresh_token');

    if (!user?.id || !refreshToken) {
      // No refresh token — send to login
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.replace('/login');
      return Promise.reject(error);
    }

    // Queue concurrent requests while refresh is in flight
    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((newToken) => {
          original.headers.Authorization = `Bearer ${newToken}`;
          resolve(apiClient(original));
        });
      });
    }

    isRefreshing = true;
    try {
      const { data } = await apiClient.post('/auth/refresh', {
        userId: user.id,
        refreshToken,
      });

      const newToken = data.accessToken;
      localStorage.setItem('access_token', newToken);
      if (data.refreshToken) {
        localStorage.setItem('refresh_token', data.refreshToken);
      }

      // Drain the queue
      refreshQueue.forEach((cb) => cb(newToken));
      refreshQueue = [];

      // Retry original request
      original.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(original);
    } catch {
      // Refresh failed — clear session and redirect
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      window.location.replace('/login');
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);


// ─── Auth Endpoints ───────────────────────────────────────────

export const authApi = {
  /**
   * Send Firebase ID token to backend → receive app JWT
   */
  verifyPhone: (idToken: string, name?: string) =>
    apiClient.post('/auth/phone/verify', { idToken, name }),

  register: (email: string, password: string, name: string) =>
    apiClient.post('/auth/register', { email, password, name }),

  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),

  refresh: (userId: string, refreshToken: string) =>
    apiClient.post('/auth/refresh', { userId, refreshToken }),

  logout: () => apiClient.post('/auth/logout'),

  me: () => apiClient.get('/auth/me'),
};

// ─── User Types ───────────────────────────────────────────────

export interface LeaderboardUser {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  totalXP: number;
  currentLevel: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardUser[];
  currentUserRank: number | null;
}

export interface UserProfileData {
  id: string;
  name: string;
  avatar: string | null;
  email: string | null;
  profile: {
    totalXP: number;
    currentLevel: number;
    preferredDomain: 'DSA' | 'SYSTEM_DESIGN';
    dailyGoalMins: number;
    timezone: string;
    bio: string | null;
    institution: string | null;
    targetExam: string | null;
  } | null;
}

// ─── User Endpoints ───────────────────────────────────────────

export const usersApi = {
  getMe: () => apiClient.get<UserProfileData>('/users/me'),
  getStats: (userId: string) => apiClient.get(`/users/${userId}/stats`),
  updateMe: (data: Record<string, any>) => apiClient.patch<UserProfileData>('/users/me', data),
  getLeaderboard: (domain?: 'DSA' | 'SYSTEM_DESIGN') =>
    apiClient.get<LeaderboardResponse>('/users/leaderboard', domain ? { params: { domain } } : undefined),
  useStreakFreeze: () =>
    apiClient.post<{ freezesLeft: number; message: string }>('/users/streak-freeze/use'),
};

// ─── Knowledge Graph Endpoints ────────────────────────────────

export const graphApi = {
  /**
   * Fetch all concept nodes and edges.
   * @param domain 'DSA' | 'SYSTEM_DESIGN' — omit for all
   */
  getGraph: (domain?: 'DSA' | 'SYSTEM_DESIGN') =>
    apiClient.get<{ nodes: ConceptNode[]; edges: ConceptEdge[] }>(
      '/graph',
      domain ? { params: { domain } } : undefined,
    ),

  getConcept: (id: string) =>
    apiClient.get<ConceptDetail>(`/graph/concepts/${id}`),

  getLearningPath: (targetId: string) =>
    apiClient.get<ConceptNode[]>(`/graph/path/${targetId}`),

  getTopics: (domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA') =>
    apiClient.get(`/graph/topics`, { params: { domain } }),

  getStatus: () => apiClient.get('/graph/status'),
};

// ─── Graph Types ──────────────────────────────────────────────

export interface ConceptNode {
  id: string;
  name: string;
  domain: 'DSA' | 'SYSTEM_DESIGN';
  category: string;
  difficulty: number;
  xpReward: number;
  estimatedMinutes: number;
  description?: string;
  tags?: string[];
  isFoundation: boolean;
  leetcodeTag?: string | null;
}

export interface ConceptEdge {
  from: string;
  to: string;
  type: 'LEADS_TO' | 'RELATED_TO' | 'REQUIRES' | 'BELONGS_TO';
}

export interface ConceptDetail extends ConceptNode {
  topic?: string;
  prerequisites: Array<{ id: string; name: string; difficulty: number }>;
  unlocks: Array<{ id: string; name: string; difficulty: number }>;
}

// ─── Questions Types ───────────────────────────────────────────

export type QuestionType = 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'CODE_SNIPPET';
export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface Question {
  id: string;
  conceptId: string;
  conceptName: string;
  domain: string;
  content: string;
  questionType: QuestionType;
  difficulty: QuestionDifficulty;
  options?: string[];
  hints: string[];
  codeSnippet?: string;
  language?: string;
  tags: string[];
}

export interface AttemptResult {
  attemptId: string;
  isCorrect: boolean;
  score: number;
  correctAnswer: string;
  explanation: string;
  xpEarned: number;
  timeTakenMs: number;
  /** Streak XP multiplier (1.0 = no bonus) */
  xpMultiplier: number;
  /** Mastery level before this attempt (0-4) — undefined for anonymous */
  prevMasteryLevel?: number;
  /** Mastery level after this attempt (0-4) — if > prevMasteryLevel, trigger level-up animation */
  newMasteryLevel?: number;
  /** Sprint 4: Achievements unlocked by this attempt */
  newAchievements?: string[];
  /** Sprint 4: Heuristic difficulty suggestion */
  suggestedDifficulty?: string;
}

export interface GenerateQuestionsPayload {
  conceptId: string;
  conceptName: string;
  domain: string;
  difficulty?: QuestionDifficulty;
  count?: number;
  questionTypes?: QuestionType[];
}

export interface MasteryData {
  conceptId: string;
  masteryLevel: number;   // 0–4
  masteryScore: number;   // 0.0–1.0
  totalAttempts: number;
  correctAttempts: number;
}

// ─── Questions API ─────────────────────────────────────────────

export const questionsApi = {
  /**
   * Fetch stored questions for a concept (no LLM call)
   */
  getQuestions: (params: {
    conceptId?: string;
    difficulty?: QuestionDifficulty;
    domain?: string;
    limit?: number;
  }) =>
    apiClient.get<Question[]>('/questions', { params }),
    
  /**
   * Auto-generate a practice session based on weakest concepts and due reviews
   */
  getSmartSession: (params?: { domain?: string; limit?: number }) =>
    apiClient.get<Question[]>('/questions/smart-session', { params }),

  /**
   * Generate fresh questions via Groq LLM, saves to DB
   */
  generate: (payload: GenerateQuestionsPayload) =>
    apiClient.post<Question[]>('/questions/generate', payload),

  /**
   * Submit an answer and get immediate feedback
   */
  submitAttempt: (payload: {
    questionId: string;
    answer: string;
    timeTakenMs: number;
    hintsUsed?: number;
    sessionId?: string;
    /** FSRS grade: 1=Again, 2=Hard, 3=Good, 4=Easy (captured after result revealed) */
    confidenceRating?: number;
  }) => apiClient.post<AttemptResult>('/questions/attempt', payload),

  /**
   * Get my recent attempt history
   */
  getMyAttempts: (limit = 20) =>
    apiClient.get('/questions/attempts/me', { params: { limit } }),

  /**
   * Get mastery data for a list of concept IDs (requires auth)
   */
  getMastery: (conceptIds: string[]) =>
    apiClient.get<Record<string, MasteryData>>('/questions/mastery', {
      params: { conceptIds: conceptIds.join(',') },
    }),

  /**
   * Flag a question for admin review (quality_positive / quality_negative)
   */
  flagQuestion: (id: string, reason: string) =>
    apiClient.post(`/questions/${id}/flag`, { reason }),

  /**
   * Ask the AI Tutor why an answer is wrong (stateless, per-question chat)
   */
  askTutor: (questionId: string, userMessage: string, correctAnswer: string) =>
    apiClient.post<{ reply: string }>(`/questions/${questionId}/tutor`, {
      userMessage,
      correctAnswer,
    }),
};

// ─── Tracker Types ─────────────────────────────────────────────

export interface DashboardStats {
  totalXP: number;
  currentLevel: number;
  streak: {
    current: number;
    longest: number;
    freezes: number;
    lastActiveDate: string | null;
  };
  mastery: {
    totalConcepts: number;
    masteredCount: number;
    dsaMastered: number;
    sdMastered: number;
  };
  accuracy: number | null;
  totalAttempts: number;
  dueConceptCount: number;
}


export interface Recommendation {
  conceptId: string;
  conceptName: string;
  type: 'LEARN_NEW' | 'REVISE' | 'PRACTICE';
  reason: string;
  priority: number;
}

export interface MasteryOverviewItem {
  conceptId: string;
  conceptName: string;
  domain: string;
  masteryLevel: number;
  masteryScore: number;
  retentionScore: number;
  memoryStrength: number;
  fsrsDifficulty: number;
  nextRevisionDue: string | null;
  revisionCount: number;
  totalAttempts: number;
  correctAttempts: number;
  lastAttemptAt: string | null;
  isDue: boolean;
}

export interface DailyPlan {
  totalEstimatedMins: number;
  dailyGoalMins: number;
  multiplier: number;
  streak: number;
  revisions: Array<{
    conceptId: string;
    conceptName: string;
    retentionScore: number;
    nextRevisionDue: string;
    estimatedMins: number;
  }>;
  learnNew: { conceptId: string; conceptName: string; estimatedMins: number } | null;
  practice: { conceptId: string; conceptName: string; masteryScore: number; estimatedMins: number } | null;
}

export interface LearningInsights {
  totalAttempts: number;
  optimalHours: string | null;
  optimalHourAccuracy: number | null;
  bestDay: string | null;
  hourlyBreakdown: Array<{ hour: number; label: string; accuracy: number; count: number }>;
  message?: string;
}

// ─── New Analytics Types (Sprint 4 Extended) ────────────────────

export interface HeatmapDay {
  date: string;   // ISO 'YYYY-MM-DD'
  count: number;
}

export interface ForecastDay {
  date: string;
  dueCount: number;
}

export interface FadingSoonItem {
  conceptId: string;
  conceptName: string;
  currentRetention: number;
  hoursUntilFade: number;
  fadingAt: string;
  masteryLevel: number;
}

export interface Achievement {
  type: string;
  icon: string;
  label: string;
  desc: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  unlocked: boolean;
  unlockedAt: string | null;
  metadata: Record<string, any> | null;
}

export interface WeeklyDigest {
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number | null;
  avgTimeSec: number | null;
  studyDays: number;
  currentStreak: number;
  improvedConceptsCount: number;
  improvedConcepts: Array<{ name: string; level: number }>;
  dailyBreakdown: Array<{ date: string; count: number }>;
}

// ─── Tracker API ────────────────────────────────────────────────

export const trackerApi = {
  /** Live dashboard stats — XP, streak (+ multiplier), mastery counts, accuracy */
  getStats: () => apiClient.get<DashboardStats>('/tracker/stats'),

  /** Current streak info + XP multiplier */
  getStreak: () => apiClient.get('/tracker/streak'),

  /** Personalised recommendations (REVISE / LEARN_NEW / PRACTICE) */
  getRecommendations: (domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA') =>
    apiClient.get<Recommendation[]>('/tracker/recommendations', { params: { domain } }),

  /** Full mastery overview with live FSRS retention scores */
  getMasteryOverview: (domain?: 'DSA' | 'SYSTEM_DESIGN') =>
    apiClient.get<MasteryOverviewItem[]>('/tracker/mastery', {
      params: domain ? { domain } : undefined,
    }),

  /** Today's personalised study plan */
  getDailyPlan: (domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA') =>
    apiClient.get<DailyPlan>('/tracker/plan', { params: { domain } }),

  /** Concepts due for review (Smart Review Session) */
  getDueConcepts: (domain?: 'DSA' | 'SYSTEM_DESIGN') =>
    apiClient.get<MasteryOverviewItem[]>('/tracker/due-concepts', {
      params: domain ? { domain } : undefined,
    }),

  /** Learning insights — optimal study hours, best day-of-week */
  getInsights: () => apiClient.get<LearningInsights>('/tracker/insights'),

  /**
   * Rate confidence after seeing the result (FSRS grade 1-4).
   * Call this AFTER result is revealed — do not await (fire-and-forget).
   * 1=Again, 2=Hard, 3=Good, 4=Easy
   */
  rateConfidence: (attemptId: string, grade: 1 | 2 | 3 | 4) =>
    apiClient.post('/tracker/rate-confidence', { attemptId, grade }),

  /** GitHub-style 52-week activity heatmap data */
  getHeatmap: () => apiClient.get<HeatmapDay[]>('/tracker/heatmap'),

  /** 30-day FSRS review load forecast */
  getForecast: () => apiClient.get<ForecastDay[]>('/tracker/forecast'),

  /** Concepts predicted to drop below 70% retention in next N hours */
  getFadingSoon: (domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA', windowHours = 72) =>
    apiClient.get<FadingSoonItem[]>('/tracker/fading-soon', { params: { domain, windowHours } }),

  /** Weekly digest — last 7 days stats */
  getWeeklyDigest: () => apiClient.get<WeeklyDigest>('/tracker/weekly'),

  /** All achievements with unlock status */
  getAchievements: () => apiClient.get<Achievement[]>('/tracker/achievements'),

  /** Seed FSRS with self-assessment rating (1-5) before first practice */
  seedAssessment: (conceptId: string, conceptName: string, domain: 'DSA' | 'SYSTEM_DESIGN', rating: number) =>
    apiClient.post('/tracker/seed-assessment', { conceptId, conceptName, domain, rating }),

  /** Download personalised PDF progress report — triggers browser file save */
  downloadReport: async (): Promise<void> => {
    const res = await apiClient.get('/tracker/report/pdf', { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `alos-progress-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin API — Sprint 6 (ADMIN / TEACHER only)
// ─────────────────────────────────────────────────────────────────────────────
export const adminApi = {
  // Analytics
  getAnalytics: () => apiClient.get('/admin/analytics'),
  getDauTrend: () => apiClient.get('/admin/analytics/dau-trend'),
  getTopConcepts: (limit = 10) => apiClient.get('/admin/analytics/top-concepts', { params: { limit } }),

  // Users
  listUsers: (page = 1, limit = 20, search?: string) =>
    apiClient.get('/admin/users', { params: { page, limit, search } }),
  updateUserRole: (id: string, role: string) =>
    apiClient.patch(`/admin/users/${id}/role`, { role }),
  toggleUserActive: (id: string, isActive: boolean) =>
    apiClient.patch(`/admin/users/${id}/active`, { isActive }),

  // Questions
  listQuestions: (page = 1, limit = 20, domain?: string, difficulty?: string, isFlagged?: boolean) =>
    apiClient.get('/admin/questions', { params: { page, limit, domain, difficulty, isFlagged } }),
  updateQuestion: (id: string, data: Record<string, any>) =>
    apiClient.patch(`/admin/questions/${id}`, data),
  deleteQuestion: (id: string) =>
    apiClient.delete(`/admin/questions/${id}`),
  bulkUpdateQuestions: (ids: string[], data: Record<string, any>) =>
    Promise.all(ids.map(id => apiClient.patch(`/admin/questions/${id}`, data))),

  // Mastery Override
  overrideMastery: (userId: string, conceptId: string, masteryScore: number) =>
    apiClient.patch(`/admin/mastery/${userId}/${conceptId}`, { masteryScore }),
  getUserMastery: (userId: string, page = 1, limit = 20) =>
    apiClient.get('/tracker/mastery', { params: { userId, page, limit } }),

  // Audit Logs
  getAuditLogs: (page = 1, limit = 50) =>
    apiClient.get('/admin/audit-logs', { params: { page, limit } }),

  // Per-student analytics
  getUserAnalytics: (userId: string) =>
    apiClient.get(`/admin/users/${userId}/analytics`),
};

// Flag a question (available to all authenticated users)
export const flagQuestion = (questionId: string, reason: string) =>
  apiClient.post(`/questions/${questionId}/flag`, { reason });

// Knowledge Graph admin operations
export const graphAdminApi = {
  getGraph: (domain?: string) => apiClient.get('/knowledge-graph/graph', { params: { domain } }),
  addEdge: (from: string, to: string, type = 'REQUIRES') =>
    apiClient.post('/knowledge-graph/edges', { fromConceptId: from, toConceptId: to, type }),
  removeEdge: (from: string, to: string) =>
    apiClient.delete('/knowledge-graph/edges', { data: { fromConceptId: from, toConceptId: to } }),
};
