// ─────────────────────────────────────────────────────────────────────────────
// Socket Client — Singleton
// Manages a single socket.io-client connection to the API notifications
// namespace. Connect once on login, reuse across the entire app.
// ─────────────────────────────────────────────────────────────────────────────

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

const API_WS_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace('/api', '');

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null; // SSR guard

  const token = localStorage.getItem('access_token');
  if (!token) return null;

  if (socket?.connected) return socket;

  // Disconnect stale socket if exists
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(`${API_WS_URL}/notifications`, {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('[WS] Connected to notifications gateway');
  });

  socket.on('disconnect', (reason) => {
    console.log('[WS] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[WS] Connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
