import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Send HTTP-only cookies on every request
  headers: { 'Content-Type': 'application/json' },
});

// Auto-attach access token from localStorage as fallback
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

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

// ─── User Endpoints ───────────────────────────────────────────

export const usersApi = {
  getMe: () => apiClient.get('/users/me'),
  getStats: (userId: string) => apiClient.get(`/users/${userId}/stats`),
  updateMe: (data: Record<string, any>) => apiClient.patch('/users/me', data),
};
