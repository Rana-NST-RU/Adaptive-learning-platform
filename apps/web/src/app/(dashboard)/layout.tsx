'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api-client';

interface User {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile on mount and resize
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close sidebar on route change on mobile
  const closeOnMobile = useCallback(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => { closeOnMobile(); }, [pathname, closeOnMobile]);

  useEffect(() => {
    const checkAuth = async () => {
      // Always call /auth/me to get fresh role info (role may not be in localStorage)
      try {
        const { data } = await authApi.me();
        if (data && data.user) {
          const freshUser = data.user as User;
          setUser(freshUser);
          // Merge role into localStorage so profile pages can read it
          const stored = localStorage.getItem('user');
          const parsed = stored ? JSON.parse(stored) : {};
          localStorage.setItem('user', JSON.stringify({ ...parsed, ...freshUser }));
          return;
        }
      } catch {
        // Fallback: try localStorage if server is unreachable
        const stored = localStorage.getItem('user');
        if (stored) {
          try { setUser(JSON.parse(stored)); return; } catch {}
        }
      }
      router.push('/login');
    };
    checkAuth();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const navItems = [
    { href: '/dashboard', label: 'Overview', icon: '🏠' },
    { href: '/dashboard/today', label: "Today's Plan", icon: '📅' },
    { href: '/dashboard/practice', label: 'Practice', icon: '⚡' },
    { href: '/dashboard/mastery', label: 'Mastery Map', icon: '🧬' },
    { href: '/dashboard/knowledge-graph', label: 'Knowledge Graph', icon: '🗺️' },
    { href: '/dashboard/achievements', label: 'Achievements', icon: '🏅' },
    { href: '/dashboard/leaderboard', label: 'Leaderboard', icon: '🥇' },
    { href: '/dashboard/profile', label: 'Profile', icon: '👤' },
  ];

  return (
    <div className="min-h-screen bg-[#060614] flex">

      {/* Mobile hamburger button — fixed, only visible when sidebar is closed on mobile */}
      {isMobile && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            position: 'fixed', top: 16, left: 16, zIndex: 50,
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#a5b4fc',
          }}
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Mobile backdrop overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 29,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-30 transition-all duration-300 ${
          isMobile
            ? sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'
            : sidebarOpen ? 'w-64' : 'w-16'
        }`}
        style={{
          background: 'rgba(6,6,20,0.97)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5">
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          {sidebarOpen && (
            <div>
              <h1 className="text-white font-bold text-base leading-none">ALOS</h1>
              <p className="text-slate-500 text-xs mt-0.5">Adaptive Learning OS</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarOpen ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="p-3 space-y-1 flex-1">
          {navItems.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group"
                style={{
                  color: isActive ? '#a5b4fc' : '#64748b',
                  background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                  borderLeft: isActive ? '2px solid #6366f1' : '2px solid transparent',
                  fontWeight: isActive ? 700 : 400,
                }}
              >
                <span className="text-base flex-shrink-0">{item.icon}</span>
                {sidebarOpen && (
                  <span className="text-sm">{item.label}</span>
                )}
              </Link>
            );
          })}

          {/* Admin Portal — only visible for ADMIN / TEACHER */}
          {(user?.role === 'ADMIN' || user?.role === 'TEACHER') && (
            <Link
              href="/admin"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mt-2"
              style={{
                background: 'linear-gradient(135deg, rgba(220,38,38,0.12), rgba(147,51,234,0.12))',
                border: '1px solid rgba(220,38,38,0.25)',
                color: '#f87171',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <span className="text-base flex-shrink-0">🛡️</span>
              {sidebarOpen && <span className="text-sm">Admin Portal</span>}
            </Link>
          )}
        </nav>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {user?.name?.[0] || user?.phone?.[0] || 'U'}
              </span>
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {user?.name || 'User'}
                </p>
                <p className="text-slate-500 text-xs truncate">
                  {user?.phone || user?.email || ''}
                </p>
              </div>
            )}
            {sidebarOpen && (
              <button
                onClick={handleLogout}
                className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
                title="Logout"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 transition-all duration-300 min-h-screen ${
          isMobile ? 'ml-0' : sidebarOpen ? 'ml-64' : 'ml-16'
        }`}
        style={{ paddingTop: isMobile && !sidebarOpen ? 56 : undefined }}
      >
        {children}
      </main>
    </div>
  );
}
