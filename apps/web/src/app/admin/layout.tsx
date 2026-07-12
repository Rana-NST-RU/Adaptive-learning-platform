'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api-client';

const NAV = [
  { href: '/admin', label: 'Overview', icon: '📊' },
  { href: '/admin/users', label: 'Users', icon: '👥' },
  { href: '/admin/questions', label: 'Questions', icon: '❓' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📈' },
  { href: '/admin/knowledge-graph', label: 'KG Editor', icon: '🕸️' },
  { href: '/admin/audit-log', label: 'Audit Log', icon: '🗓️' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [adminName, setAdminName] = useState('Admin');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const verify = async () => {
      try {
        const stored = localStorage.getItem('user');
        if (stored) {
          const u = JSON.parse(stored);
          setAdminName(u.name || 'Admin');
        }
        const { data } = await authApi.me();
        if (!data?.user) { router.push('/login'); return; }
        const role = data.user.role;
        if (role !== 'ADMIN' && role !== 'TEACHER') {
          router.push('/dashboard');
          return;
        }
        setAdminName(data.user.name || 'Admin');
      } catch {
        router.push('/login');
      } finally {
        setChecking(false);
      }
    };
    verify();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (checking) {
    return (
      <div style={{
        minHeight: '100vh', background: '#060614',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid #6366f1', borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060614', display: 'flex' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240, flexShrink: 0, position: 'fixed', top: 0, left: 0,
        height: '100vh', zIndex: 30,
        background: 'rgba(255,255,255,0.03)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(20px)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{
          padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #dc2626, #9333ea)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>🛡️</div>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 15 }}>ALOS Admin</div>
            <div style={{ color: '#64748b', fontSize: 11 }}>Control Panel</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map(item => {
            const isActive = item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10, textDecoration: 'none',
                color: isActive ? '#a5b4fc' : '#64748b',
                background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                borderLeft: isActive ? '2px solid #6366f1' : '2px solid transparent',
                fontWeight: isActive ? 700 : 400,
                fontSize: 13, transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: Back to Student View + Logout */}
        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Link href="/dashboard" style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            borderRadius: 8, textDecoration: 'none', color: '#6366f1', fontSize: 12,
            marginBottom: 4,
          }}>← Student View</Link>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #dc2626, #9333ea)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: '#fff', fontWeight: 700,
            }}>{adminName[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminName}</div>
              <div style={{ color: '#ef4444', fontSize: 10 }}>Administrator</div>
            </div>
            <button onClick={handleLogout} title="Logout" style={{
              background: 'none', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 14,
            }}>⏏</button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: 240, flex: 1, minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  );
}
