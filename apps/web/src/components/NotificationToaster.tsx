'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Notification Toaster
// Globally-mounted component that listens for real-time WebSocket events
// and renders animated toast notifications.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';

interface Toast {
  id: string;
  type: 'level_up' | 'streak_warning' | 'mastery_override' | 'info';
  title: string;
  message: string;
  emoji: string;
}

const TOAST_DURATION = 5500; // ms

const TYPE_STYLES: Record<Toast['type'], { border: string; bg: string; glow: string; titleColor: string }> = {
  level_up: {
    bg: 'rgba(13,10,35,0.95)',
    border: '#8b5cf6',
    glow: 'rgba(139,92,246,0.4)',
    titleColor: '#c4b5fd',
  },
  streak_warning: {
    bg: 'rgba(13,10,35,0.95)',
    border: '#f59e0b',
    glow: 'rgba(245,158,11,0.35)',
    titleColor: '#fcd34d',
  },
  mastery_override: {
    bg: 'rgba(13,10,35,0.95)',
    border: '#6366f1',
    glow: 'rgba(99,102,241,0.35)',
    titleColor: '#a5b4fc',
  },
  info: {
    bg: 'rgba(13,10,35,0.95)',
    border: '#10b981',
    glow: 'rgba(16,185,129,0.35)',
    titleColor: '#6ee7b7',
  },
};

export default function NotificationToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_DURATION);
  }, []);

  useEffect(() => {
    // Only connect if logged in
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) return;

    const socket = getSocket();
    if (!socket) return;

    const handleLevelUp = (data: { conceptName: string; prevLevel: string; newLevel: string; xpEarned: number }) => {
      addToast({
        type: 'level_up',
        emoji: '🏆',
        title: 'Mastery Level Up!',
        message: `${data.conceptName}: ${data.prevLevel} → ${data.newLevel} (+${data.xpEarned} XP)`,
      });
    };

    const handleStreakWarning = (data: { currentStreak: number; hasStreakFreeze: boolean; message: string }) => {
      addToast({
        type: 'streak_warning',
        emoji: '🔥',
        title: `${data.currentStreak}-Day Streak at Risk!`,
        message: data.message,
      });
    };

    const handleMasteryOverride = (data: { conceptName: string; newMastery: number; adminName: string }) => {
      addToast({
        type: 'mastery_override',
        emoji: '⚙️',
        title: 'Mastery Updated by Admin',
        message: `${data.conceptName} set to ${Math.round(data.newMastery * 100)}% by ${data.adminName}`,
      });
    };

    socket.on('level_up', handleLevelUp);
    socket.on('streak_warning', handleStreakWarning);
    socket.on('mastery_override', handleMasteryOverride);

    return () => {
      socket.off('level_up', handleLevelUp);
      socket.off('streak_warning', handleStreakWarning);
      socket.off('mastery_override', handleMasteryOverride);
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(110%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeOutRight {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(110%); }
        }
        .ws-toast { animation: slideInRight 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
      `}</style>
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
        display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end',
        pointerEvents: 'none',
      }}>
        {toasts.map(toast => {
          const s = TYPE_STYLES[toast.type];
          return (
            <div
              key={toast.id}
              className="ws-toast"
              style={{
                background: s.bg,
                border: `1px solid ${s.border}`,
                boxShadow: `0 8px 32px ${s.glow}, 0 2px 8px rgba(0,0,0,0.6)`,
                borderRadius: 16,
                padding: '16px 20px',
                maxWidth: 340,
                backdropFilter: 'blur(20px)',
                pointerEvents: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Icon */}
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: `${s.border}18`,
                  border: `1px solid ${s.border}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {toast.emoji}
                </div>
                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: s.titleColor, fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
                    {toast.title}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.4 }}>
                    {toast.message}
                  </div>
                </div>
                {/* Progress bar */}
              </div>
              {/* Shrinking timer bar */}
              <div style={{ marginTop: 12, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', background: s.border, borderRadius: 2,
                  animation: `shrink ${TOAST_DURATION}ms linear forwards`,
                  transformOrigin: 'left',
                }} />
              </div>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
    </>
  );
}
