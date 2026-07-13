'use client';

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#060614',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#f1f5f9',
        padding: 24,
        textAlign: 'center',
      }}
    >
      {/* Animated icon */}
      <div
        style={{
          width: 96, height: 96, borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))',
          border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 48, marginBottom: 32,
          boxShadow: '0 0 60px rgba(99,102,241,0.15)',
        }}
      >
        📡
      </div>

      <h1
        style={{
          fontSize: 28, fontWeight: 800, margin: '0 0 12px',
          background: 'linear-gradient(135deg, #a5b4fc, #818cf8)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}
      >
        You&apos;re Offline
      </h1>

      <p style={{ color: '#64748b', maxWidth: 380, lineHeight: 1.6, marginBottom: 32 }}>
        No internet connection detected. Some pages you&apos;ve visited recently are available from cache.
        Your progress is saved and will sync when you&apos;re back online.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontSize: 14, fontWeight: 600,
          }}
        >
          Try Again
        </button>
        <a
          href="/dashboard"
          style={{
            padding: '12px 24px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.3)',
            color: '#a5b4fc', fontSize: 14, fontWeight: 600, textDecoration: 'none',
            background: 'rgba(99,102,241,0.08)',
          }}
        >
          Go to Dashboard (cached)
        </a>
      </div>

      {/* Animated pulse ring */}
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 1; }
          80%, 100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
