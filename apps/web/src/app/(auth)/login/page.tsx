'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import { authApi } from '@/lib/api-client';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type Tab = 'phone' | 'email' | 'google';
type PhoneStep = 'input' | 'otp';

// ─────────────────────────────────────────────────────────────
// Star background component
// ─────────────────────────────────────────────────────────────
function StarField() {
  const stars = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    duration: Math.random() * 4 + 3,
    delay: Math.random() * 5,
  }));

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            opacity: 0.3,
            animation: `twinkle ${star.duration}s ${star.delay}s ease-in-out infinite`,
          }}
        />
      ))}
      {/* Nebula blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-purple-900/20 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-blue-900/15 blur-3xl" />
      <div className="absolute top-3/4 left-1/2 w-64 h-64 rounded-full bg-indigo-900/20 blur-3xl" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OTP Input Component
// ─────────────────────────────────────────────────────────────
interface OtpInputProps {
  value: string[];
  onChange: (otp: string[]) => void;
}

function OtpInput({ value, onChange }: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, digit: string) => {
    if (!/^\d*$/.test(digit)) return;
    const newOtp = [...value];
    newOtp[index] = digit.slice(-1);
    onChange(newOtp);
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      const newOtp = [...value];
      pasted.split('').forEach((d, i) => { newOtp[i] = d; });
      onChange(newOtp);
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  return (
    <div className="flex gap-3 justify-center">
      {value.map((digit, i) => (
        <motion.input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          placeholder="·"
          className="otp-input"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: i * 0.05 }}
          whileFocus={{ scale: 1.05 }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Countdown Timer
// ─────────────────────────────────────────────────────────────
function Countdown({
  seconds,
  onResend,
}: {
  seconds: number;
  onResend: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
    if (seconds <= 0) return;
    const timer = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) { clearInterval(timer); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <div className="text-center text-sm">
      {remaining > 0 ? (
        <span className="text-slate-400">
          Resend OTP in{' '}
          <span className="text-violet-400 font-mono font-semibold">
            {mm}:{ss}
          </span>
        </span>
      ) : (
        <button
          onClick={onResend}
          className="text-violet-400 hover:text-violet-300 font-medium transition-colors underline-offset-2 hover:underline"
        >
          Resend OTP
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Login Page
// ─────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('phone');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('input');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdownKey, setCountdownKey] = useState(0);
  const confirmResult = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const recaptchaWidgetId = useRef<number | null>(null);

  const clearError = () => setError('');

  // Initialize reCAPTCHA ONCE on mount — never recreate it
  useEffect(() => {
    if (recaptchaVerifier.current) return;

    // Always wipe the container first — React Strict Mode runs effects twice
    // in dev, leaving a stale Google reCAPTCHA widget in the DOM
    const container = document.getElementById('recaptcha-container');
    if (container) container.innerHTML = '';

    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        if (recaptchaWidgetId.current !== null) {
          (window as any).grecaptcha?.reset(recaptchaWidgetId.current);
        }
      },
    });

    verifier.render().then((widgetId) => {
      recaptchaWidgetId.current = widgetId;
    }).catch(() => {});

    recaptchaVerifier.current = verifier;

    return () => {
      verifier.clear();
      recaptchaVerifier.current = null;
      recaptchaWidgetId.current = null;
      // Also wipe DOM so next mount starts clean
      const el = document.getElementById('recaptcha-container');
      if (el) el.innerHTML = '';
    };
  }, []);

  // ─── Phone OTP ─────────────────────────────────────────────

  const sendOtp = async () => {
    clearError();
    // Strip everything except digits and leading +
    const raw = phone.trim().replace(/\s/g, '');
    const formatted = raw.startsWith('+') ? raw : `+91${raw}`;

    if (!/^\+\d{10,15}$/.test(formatted)) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }

    if (!recaptchaVerifier.current) {
      setError('reCAPTCHA not ready. Please refresh the page.');
      return;
    }

    // Reset the existing widget before each attempt — prevents 'already rendered' error
    if (recaptchaWidgetId.current !== null) {
      (window as any).grecaptcha?.reset(recaptchaWidgetId.current);
    }

    setLoading(true);
    try {
      const result = await signInWithPhoneNumber(auth, formatted, recaptchaVerifier.current);
      confirmResult.current = result;
      setPhoneStep('otp');
      setCountdownKey((k) => k + 1);
    } catch (err: any) {
      console.error('OTP send error:', err);
      // Reset widget on failure so user can retry
      if (recaptchaWidgetId.current !== null) {
        (window as any).grecaptcha?.reset(recaptchaWidgetId.current);
      }
      setError(
        err.code === 'auth/too-many-requests'
          ? 'Too many attempts. Try again in a few minutes.'
          : err.code === 'auth/invalid-phone-number'
          ? 'Invalid phone number format.'
          : err.code === 'auth/captcha-check-failed'
          ? 'reCAPTCHA failed. Please refresh and try again.'
          : err.code === 'auth/quota-exceeded'
          ? 'SMS quota exceeded. Try again later.'
          : `Failed to send OTP: ${err.message || 'Please try again.'}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    clearError();
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Enter all 6 digits of the OTP');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Verify OTP with Firebase
      let credential;
      try {
        credential = await confirmResult.current!.confirm(code);
      } catch (firebaseErr: any) {
        console.error('Firebase verify error:', firebaseErr.code, firebaseErr.message);
        setError(
          firebaseErr.code === 'auth/invalid-verification-code'
            ? 'Wrong OTP. Please check the 6-digit code.'
            : firebaseErr.code === 'auth/code-expired' || firebaseErr.code === 'auth/session-expired'
            ? 'OTP expired. Please click "Change number" and send a new one.'
            : `Firebase error: ${firebaseErr.message}`,
        );
        setOtp(['', '', '', '', '', '']);
        setLoading(false);
        return;
      }

      // Step 2: Get Firebase ID Token
      const idToken = await credential.user.getIdToken();

      // Step 3: Send to our NestJS backend → get app JWT
      try {
        const { data } = await authApi.verifyPhone(idToken);
        if (data.accessToken) {
          localStorage.setItem('access_token', data.accessToken);
          localStorage.setItem('user', JSON.stringify(data.user));
        }
        router.push('/dashboard');
      } catch (apiErr: any) {
        console.error('Backend verify error:', apiErr);
        setError(
          `Backend error: ${apiErr.response?.data?.message || apiErr.message || 'API unreachable. Is the backend running on port 3001?'}`,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    setOtp(['', '', '', '', '', '']);
    setPhoneStep('input');
    await sendOtp();
  };

  // ─── Google OAuth ───────────────────────────────────────────

  const loginWithGoogle = async () => {
    clearError();
    setLoading(true);
    try {
      // For Google, we redirect through the backend's OAuth flow
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;
    } catch (err) {
      setError('Google login failed. Please try again.');
      setLoading(false);
    }
  };

  // ─── Email Login ────────────────────────────────────────────

  const loginWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const { data } = await authApi.login(email, password);
      if (data.accessToken) {
        localStorage.setItem('access_token', data.accessToken);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'Invalid email or password.',
      );
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#060614] p-4">
      <StarField />

      {/* Invisible reCAPTCHA anchor */}
      <div id="recaptcha-container" />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo & Brand */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 mb-4 animate-pulse-glow"
          >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </motion.div>
          <h1 className="text-3xl font-bold gradient-text glow-text">ALOS</h1>
          <p className="text-slate-400 text-sm mt-1">Adaptive Learning OS</p>
        </div>

        {/* Card */}
        <div className="glass rounded-3xl p-8 glow-purple">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">
            Welcome back 👋
          </h2>

          {/* Tab Switcher */}
          <div className="flex bg-white/5 rounded-xl p-1 mb-6 gap-1">
            {(['phone', 'email', 'google'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setPhoneStep('input'); clearError(); }}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium capitalize transition-all duration-200 ${
                  activeTab === tab
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'google' ? '🔵 Google' : tab === 'phone' ? '📱 Phone' : '✉️ Email'}
              </button>
            ))}
          </div>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm"
              >
                ⚠️ {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── PHONE TAB ── */}
          <AnimatePresence mode="wait">
            {activeTab === 'phone' && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <AnimatePresence mode="wait">
                  {phoneStep === 'input' ? (
                    <motion.div
                      key="phone-input"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Phone Number
                        </label>
                        <div className="flex gap-2">
                          <div className="flex items-center gap-2 px-3 rounded-xl border text-sm text-slate-300 whitespace-nowrap" style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.10)' }}>
                            🇮🇳 +91
                          </div>
                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                            onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
                            placeholder="10-digit mobile number"
                            maxLength={10}
                            autoComplete="off"
                            style={{
                              background: 'rgba(255,255,255,0.06)',
                              borderColor: 'rgba(255,255,255,0.10)',
                              color: '#e2e8f0',
                              WebkitTextFillColor: '#e2e8f0',
                            }}
                            className="flex-1 px-4 py-3 rounded-xl border text-sm placeholder:text-slate-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                          />
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                          An OTP will be sent via SMS. Standard rates may apply.
                        </p>
                      </div>

                      <button
                        onClick={sendOtp}
                        disabled={loading || phone.length < 10}
                        className="btn-gradient w-full py-3.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
                      >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          {loading ? (
                            <>
                              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                              </svg>
                              Sending OTP...
                            </>
                          ) : (
                            <>📤 Send OTP</>
                          )}
                        </span>
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="otp-verify"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="space-y-5"
                    >
                      <div className="text-center">
                        <p className="text-slate-300 text-sm">
                          OTP sent to{' '}
                          <span className="text-violet-300 font-semibold">
                            +91 {phone}
                          </span>
                        </p>
                        <button
                          onClick={() => { setPhoneStep('input'); setOtp(['', '', '', '', '', '']); clearError(); }}
                          className="text-xs text-slate-500 hover:text-slate-300 mt-1 transition-colors"
                        >
                          ← Change number
                        </button>
                      </div>

                      <OtpInput value={otp} onChange={setOtp} />

                      <Countdown
                        key={countdownKey}
                        seconds={300}
                        onResend={resendOtp}
                      />

                      <button
                        onClick={verifyOtp}
                        disabled={loading || otp.join('').length !== 6}
                        className="btn-gradient w-full py-3.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          {loading ? (
                            <>
                              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                              </svg>
                              Verifying...
                            </>
                          ) : (
                            <>✅ Verify & Login</>
                          )}
                        </span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* ── EMAIL TAB ── */}
            {activeTab === 'email' && (
              <motion.form
                key="email"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                onSubmit={loginWithEmail}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      borderColor: 'rgba(255,255,255,0.10)',
                      color: '#e2e8f0',
                      WebkitTextFillColor: '#e2e8f0',
                    }}
                    className="w-full px-4 py-3 rounded-xl border text-sm placeholder:text-slate-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      borderColor: 'rgba(255,255,255,0.10)',
                      color: '#e2e8f0',
                      WebkitTextFillColor: '#e2e8f0',
                    }}
                    className="w-full px-4 py-3 rounded-xl border text-sm placeholder:text-slate-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gradient w-full py-3.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
                >
                  <span className="relative z-10">
                    {loading ? 'Logging in...' : '🔐 Login with Email'}
                  </span>
                </button>
                <p className="text-center text-sm text-slate-400">
                  No account?{' '}
                  <Link href="/register" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
                    Create one
                  </Link>
                </p>
              </motion.form>
            )}

            {/* ── GOOGLE TAB ── */}
            {activeTab === 'google' && (
              <motion.div
                key="google"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <p className="text-slate-400 text-sm text-center leading-relaxed">
                  Click below to sign in with your Google account. Your data is
                  secured by Google&apos;s OAuth 2.0 protocol.
                </p>
                <button
                  onClick={loginWithGoogle}
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 bg-white text-gray-800 hover:bg-gray-50 transition-all disabled:opacity-50 shadow-lg hover:shadow-xl"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  {loading ? 'Redirecting...' : 'Continue with Google'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-6">
          By signing in, you agree to our{' '}
          <span className="text-slate-400">Terms of Service</span> and{' '}
          <span className="text-slate-400">Privacy Policy</span>
        </p>
      </motion.div>
    </div>
  );
}
