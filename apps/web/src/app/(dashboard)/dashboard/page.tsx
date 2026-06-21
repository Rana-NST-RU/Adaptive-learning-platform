'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface StatCard {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  icon: string;
  color: string;
}

const stats: StatCard[] = [
  { label: 'Concepts Mastered', value: '0', change: 'Start learning to track', positive: true, icon: '🧠', color: 'from-violet-600 to-purple-700' },
  { label: 'Study Streak', value: '0 days', change: 'Begin your streak today!', positive: true, icon: '🔥', color: 'from-orange-500 to-red-600' },
  { label: 'XP Points', value: '0 XP', change: 'Complete sessions to earn XP', positive: true, icon: '⚡', color: 'from-yellow-500 to-amber-600' },
  { label: 'Accuracy Rate', value: '—', change: 'Practice to see your accuracy', positive: true, icon: '🎯', color: 'from-emerald-500 to-teal-600' },
];

const quickActions = [
  { label: 'Start Learning', desc: 'Resume your personalized learning path', icon: '🗺️', href: '/dashboard/learning-path', color: 'from-violet-600/20 to-indigo-600/20', border: 'border-violet-500/20' },
  { label: 'Practice Now', desc: 'Sharpen your skills with adaptive quizzes', icon: '⚡', href: '/dashboard/practice', color: 'from-yellow-600/20 to-orange-600/20', border: 'border-yellow-500/20' },
  { label: 'Knowledge Graph', desc: 'Explore your concept connections', icon: '🧠', href: '/dashboard/knowledge-graph', color: 'from-emerald-600/20 to-teal-600/20', border: 'border-emerald-500/20' },
  { label: 'View Analytics', desc: 'Track your progress over time', icon: '📊', href: '/dashboard/analytics', color: 'from-blue-600/20 to-cyan-600/20', border: 'border-blue-500/20' },
];

export default function DashboardPage() {
  const [user, setUser] = useState<{ name?: string; phone?: string } | null>(null);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const greeting = () => {
    const h = time.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">
              {greeting()}, {user?.name || 'Learner'} 👋
            </h1>
            <p className="text-slate-400 mt-1">
              {time.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} — Ready to learn something new?
            </p>
          </div>
          <div
            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-slate-400"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <span>🟢</span>
            <span>All systems operational</span>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-10"
      >
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            className="rounded-2xl p-5 relative overflow-hidden group hover:scale-[1.02] transition-transform"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${stat.color} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />
            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} text-lg mb-3`}>
              {stat.icon}
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-slate-400 text-sm mt-0.5">{stat.label}</p>
            <p className={`text-xs mt-2 ${stat.positive ? 'text-emerald-400' : 'text-red-400'}`}>
              {stat.change}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-10"
      >
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {quickActions.map((action, i) => (
            <motion.a
              key={action.label}
              href={action.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              whileHover={{ scale: 1.03, y: -2 }}
              className={`rounded-2xl p-5 bg-gradient-to-br ${action.color} border ${action.border} cursor-pointer group transition-all`}
            >
              <span className="text-3xl block mb-3">{action.icon}</span>
              <h3 className="text-white font-semibold text-sm">{action.label}</h3>
              <p className="text-slate-400 text-xs mt-1 leading-relaxed">{action.desc}</p>
            </motion.a>
          ))}
        </div>
      </motion.div>

      {/* Recent Activity + Getting Started */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Recent Activity */}
        <div
          className="rounded-2xl p-6"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <h2 className="text-base font-semibold text-white mb-4">Recent Activity</h2>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-3xl mb-4">
              📭
            </div>
            <p className="text-slate-400 text-sm">No activity yet</p>
            <p className="text-slate-600 text-xs mt-1">Your learning sessions will appear here</p>
          </div>
        </div>

        {/* Getting Started Checklist */}
        <div
          className="rounded-2xl p-6"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <h2 className="text-base font-semibold text-white mb-4">🚀 Getting Started</h2>
          <div className="space-y-3">
            {[
              { done: true, label: 'Create your account', desc: 'Signed in via phone OTP' },
              { done: false, label: 'Choose your first subject', desc: 'Select a topic to master' },
              { done: false, label: 'Take the placement quiz', desc: 'We\'ll calibrate your level' },
              { done: false, label: 'Complete your first session', desc: 'Start earning XP' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                  item.done
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'border-white/20'
                }`}>
                  {item.done && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className={`text-sm font-medium ${item.done ? 'text-slate-400 line-through' : 'text-white'}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-slate-600">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 bg-white/5 rounded-xl h-2">
            <div className="bg-gradient-to-r from-violet-600 to-indigo-500 h-2 rounded-xl" style={{ width: '25%' }} />
          </div>
          <p className="text-xs text-slate-500 mt-2">1 of 4 completed</p>
        </div>
      </motion.div>
    </div>
  );
}
