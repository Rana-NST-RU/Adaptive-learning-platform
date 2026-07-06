'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { questionsApi, graphApi, trackerApi } from '@/lib/api-client';
import type { Question, AttemptResult, QuestionDifficulty, MasteryData } from '@/lib/api-client';
import { playCorrect, playWrong, playLevelUp, playAchievement, isSoundEnabled, toggleSound } from '@/lib/sound-effects';

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionPhase = 'concept-picker' | 'loading' | 'session' | 'summary';

interface ConceptOption {
  id: string;
  name: string;
  category: string;
  difficulty: number;
  domain: string;
}

interface SessionStats {
  total: number;
  correct: number;
  xpEarned: number;
  avgTime: number;
  results: AttemptResult[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DIFF_COLORS: Record<QuestionDifficulty, string> = {
  EASY: '#10b981',
  MEDIUM: '#f59e0b',
  HARD: '#ef4444',
};

const DIFF_LABELS: Record<QuestionDifficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
};

const MASTERY_LABELS = ['Not Started', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
const MASTERY_COLORS = ['#475569', '#6366f1', '#f59e0b', '#10b981', '#f97316'];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PracticePage() {
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<SessionPhase>('concept-picker');
  const [concepts, setConcepts] = useState<ConceptOption[]>([]);
  const [conceptsLoading, setConceptsLoading] = useState(true);
  const [mastery, setMastery] = useState<Record<string, MasteryData>>({});
  const [selectedConcept, setSelectedConcept] = useState<ConceptOption | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<'DSA' | 'SYSTEM_DESIGN'>('DSA');
  const [selectedDiff, setSelectedDiff] = useState<QuestionDifficulty>('MEDIUM');
  const [questionCount, setQuestionCount] = useState(5);
  const [loadingMessage, setLoadingMessage] = useState('Generating AI questions…');

  // Review mode: queue of due concepts to cycle through
  const [reviewQueue, setReviewQueue] = useState<ConceptOption[]>([]);
  const [reviewQueueIndex, setReviewQueueIndex] = useState(0);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [reviewModeLoading, setReviewModeLoading] = useState(false);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [stats, setStats] = useState<SessionStats>({ total: 0, correct: 0, xpEarned: 0, avgTime: 0, results: [] });
  const [hintsShown, setHintsShown] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [tfAnswer, setTfAnswer] = useState<string | null>(null);
  const [shortAnswer, setShortAnswer] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [wrongQuestions, setWrongQuestions] = useState<Question[]>([]); // #1 retry
  const [xpAnim, setXpAnim] = useState<{ visible: boolean; xp: number; multiplier?: number }>({ visible: false, xp: 0 });
  // Sprint 4 refinements
  const [confidenceGiven, setConfidenceGiven] = useState<number | null>(null); // FSRS grade 1-4
  const [levelUpAnim, setLevelUpAnim] = useState<{ visible: boolean; level: number; conceptName: string } | null>(null);
  const [achievementPopups, setAchievementPopups] = useState<string[]>([]);
  const [autoSuggestion, setAutoSuggestion] = useState<string | null>(null);
  const [selfAssessed, setSelfAssessed] = useState<string | null>(null); // conceptId that was assessed
  const [selfAssessRating, setSelfAssessRating] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') return isSoundEnabled();
    return true;
  });
  const startTimeRef = useRef<number>(Date.now());

  // #3 — Restore session from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('alos_practice_session');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.questions?.length && s.phase === 'session') {
          setQuestions(s.questions);
          setCurrentIndex(s.currentIndex ?? 0);
          setStats(s.stats ?? { total: 0, correct: 0, xpEarned: 0, avgTime: 0, results: [] });
          setSelectedDiff(s.diff ?? 'MEDIUM');
          if (s.concept) setSelectedConcept(s.concept);
          setPhase('session');
          startTimeRef.current = Date.now();
        }
      }
    } catch {}
  }, []);

  // #3 — Save session to localStorage whenever key state changes
  useEffect(() => {
    if (phase === 'session' && questions.length > 0) {
      try {
        localStorage.setItem('alos_practice_session', JSON.stringify({
          phase, questions, currentIndex, stats,
          diff: selectedDiff, concept: selectedConcept,
        }));
      } catch {}
    } else if (phase === 'summary' || phase === 'concept-picker') {
      localStorage.removeItem('alos_practice_session');
    }
  }, [phase, currentIndex, stats, questions, selectedDiff, selectedConcept]);

  // Load concepts + mastery + handle ?mode=review and ?concept=
  useEffect(() => {
    const mode = searchParams.get('mode');
    const conceptParam = searchParams.get('concept');

    setConceptsLoading(true);
    graphApi.getGraph(selectedDomain)
      .then(async (res) => {
        const nodes: ConceptOption[] = res.data.nodes.map((n: any) => ({
          id: n.id, name: n.name, category: n.category,
          difficulty: n.difficulty, domain: n.domain,
        }));
        setConcepts(nodes);

        // #4 — fetch mastery for all concepts
        if (nodes.length > 0) {
          questionsApi.getMastery(nodes.map(n => n.id))
            .then(r => setMastery(r.data))
            .catch(() => {});
        }

        // ?mode=review — fetch due concepts and build review queue
        if (mode === 'review') {
          setIsReviewMode(true);
          setReviewModeLoading(true);
          try {
            const dueRes = await trackerApi.getDueConcepts(selectedDomain);
            const dueConcepts: ConceptOption[] = (dueRes.data as any[])
              .map((d: any) => nodes.find(n => n.id === d.conceptId))
              .filter(Boolean) as ConceptOption[];
            if (dueConcepts.length > 0) {
              setReviewQueue(dueConcepts);
              setReviewQueueIndex(0);
              setSelectedConcept(dueConcepts[0]);
              setQuestionCount(3); // 3 questions per concept in review mode
            } else {
              setSessionError('No concepts are currently due for review. Great job keeping up!');
            }
          } catch {
            setSessionError('Could not load review queue. Please try again.');
          } finally {
            setReviewModeLoading(false);
          }
        }

        // ?concept=ID — pre-select a concept
        if (conceptParam && !mode) {
          const found = nodes.find(n => n.id === conceptParam);
          if (found) setSelectedConcept(found);
        }
      })
      .catch(() => {})
      .finally(() => setConceptsLoading(false));
  }, [selectedDomain]);

  const filteredConcepts = concepts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ─── Start Session ─────────────────────────────────────────────────────────

  const startSession = useCallback(async () => {
    if (!selectedConcept) return;
    setSessionError(null);
    setPhase('loading');
    try {
      // #7 — check cache first, show different loading message
      const existingRes = await questionsApi.getQuestions({
        conceptId: selectedConcept.id,
        difficulty: selectedDiff,
        limit: questionCount,
      });
      let qs = existingRes.data;

      if (qs.length >= questionCount) {
        // All questions from cache
        setLoadingMessage('Loading saved questions…');
      } else {
        // Need to generate
        setLoadingMessage('Generating AI questions with Groq…');
        const genRes = await questionsApi.generate({
          conceptId: selectedConcept.id,
          conceptName: selectedConcept.name,
          domain: selectedDomain,
          difficulty: selectedDiff,
          count: questionCount - qs.length,
          questionTypes: ['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER', 'CODE_SNIPPET'],
        });
        qs = [...qs, ...genRes.data];
      }

      setQuestions(qs.slice(0, questionCount));
      setCurrentIndex(0);
      setResult(null);
      setStats({ total: 0, correct: 0, xpEarned: 0, avgTime: 0, results: [] });
      setHintsShown(0);
      setSelectedOption(null);
      setTfAnswer(null);
      setShortAnswer('');
      startTimeRef.current = Date.now();
      setPhase('session');
    } catch (err: any) {
      console.error('[Practice] startSession error:', err?.response?.data ?? err);
      setPhase('concept-picker');
      const status = err?.response?.status;
      if (status === 401) {
        // #3 — inline banner instead of alert
        setSessionError('Your session has expired. Please log in again to save progress.');
      } else {
        setSessionError(
          err?.response?.data?.message
            ? `Error: ${err.response.data.message}`
            : 'Failed to load questions. Please try again.'
        );
      }
    }
  }, [selectedConcept, selectedDiff, selectedDomain, questionCount]);

  // ─── Submit Answer ─────────────────────────────────────────────────────────

  const submitAnswer = useCallback(async () => {
    if (!questions[currentIndex]) return;
    const q = questions[currentIndex];
    let answer = '';
    if (q.questionType === 'MCQ') answer = selectedOption ?? '';
    else if (q.questionType === 'TRUE_FALSE') answer = tfAnswer ?? '';
    else answer = shortAnswer;
    if (!answer) return;
    const timeTakenMs = Date.now() - startTimeRef.current;
    try {
      const res = await questionsApi.submitAttempt({ questionId: q.id, answer, timeTakenMs, hintsUsed: hintsShown });
      setResult(res.data);
      setConfidenceGiven(null); // reset for new question
      // #1 — track wrong answers for retry
      if (!res.data.isCorrect) setWrongQuestions(prev => [...prev, q]);
      // Sprint 4: XP animation with streak multiplier
      if (res.data.xpEarned > 0) {
        setXpAnim({ visible: true, xp: res.data.xpEarned, multiplier: res.data.xpMultiplier });
        setTimeout(() => setXpAnim({ visible: false, xp: 0 }), 2200);
      }
      // Sprint 4: Level-up detection
      if (
        res.data.newMasteryLevel !== undefined &&
        res.data.prevMasteryLevel !== undefined &&
        res.data.newMasteryLevel > res.data.prevMasteryLevel
      ) {
        const LEVEL_NAMES = ['Not Started', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
        setLevelUpAnim({ visible: true, level: res.data.newMasteryLevel, conceptName: q.conceptName });
        playLevelUp();
        setTimeout(() => setLevelUpAnim(null), 3500);
      }
      // Sound effect on answer
      if (res.data.isCorrect) playCorrect();
      else playWrong();
      // Achievement popups
      if (res.data.newAchievements?.length) {
        playAchievement();
        setAchievementPopups(res.data.newAchievements);
        setTimeout(() => setAchievementPopups([]), 4000);
      }
      // Auto-difficulty suggestion
      if (res.data.suggestedDifficulty && res.data.suggestedDifficulty !== selectedDiff) {
        setAutoSuggestion(res.data.suggestedDifficulty);
        setTimeout(() => setAutoSuggestion(null), 5000);
      }
      setStats(prev => ({
        total: prev.total + 1,
        correct: prev.correct + (res.data.isCorrect ? 1 : 0),
        xpEarned: prev.xpEarned + res.data.xpEarned,
        avgTime: Math.round((prev.avgTime * prev.total + timeTakenMs) / (prev.total + 1)),
        results: [...prev.results, res.data],
      }));
    } catch {
      setSessionError('Failed to submit answer. Please try again.');
    }
  }, [questions, currentIndex, selectedOption, tfAnswer, shortAnswer, hintsShown]);

  const nextQuestion = useCallback((confidence?: number) => {
    // If user has rated confidence and there's a pending attemptId, send it
    const attemptId = result?.attemptId;
    if (confidence && attemptId && !attemptId.startsWith('anonymous-')) {
      trackerApi.rateConfidence(attemptId, confidence as 1 | 2 | 3 | 4).catch(() => {});
    }
    if (currentIndex + 1 >= questions.length) {
      setPhase('summary');
    } else {
      setCurrentIndex(i => i + 1);
      setResult(null);
      setConfidenceGiven(null);
      setSelectedOption(null);
      setTfAnswer(null);
      setShortAnswer('');
      setHintsShown(0);
      startTimeRef.current = Date.now();
    }
  }, [currentIndex, questions.length, result]);

  // #1 — Start retry session with wrong answers only
  const startRetrySession = useCallback(() => {
    if (wrongQuestions.length === 0) return;
    setQuestions(wrongQuestions);
    setWrongQuestions([]);
    setCurrentIndex(0);
    setResult(null);
    setStats({ total: 0, correct: 0, xpEarned: 0, avgTime: 0, results: [] });
    setHintsShown(0);
    setSelectedOption(null);
    setTfAnswer(null);
    setShortAnswer('');
    startTimeRef.current = Date.now();
    setPhase('session');
  }, [wrongQuestions]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', padding: '24px' }}>

      {/* Review Mode Progress Banner */}
      {isReviewMode && reviewQueue.length > 0 && (
        <div style={{
          marginBottom: 20, padding: '12px 18px', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(245,158,11,0.06))',
          border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 20 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5', marginBottom: 6 }}>
              Review Session · Concept {Math.min(reviewQueueIndex + 1, reviewQueue.length)} of {reviewQueue.length}
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, transition: 'width 0.4s',
                background: 'linear-gradient(90deg, #ef4444, #f59e0b)',
                width: `${((reviewQueueIndex) / reviewQueue.length) * 100}%`,
              }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right', flexShrink: 0 }}>
            Now: <strong style={{ color: '#e2e8f0' }}>{reviewQueue[reviewQueueIndex]?.name}</strong>
          </div>
        </div>
      )}

      {/* Review mode loading */}
      {reviewModeLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 12,
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)', marginBottom: 20 }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ color: '#a5b4fc', fontSize: 14 }}>Building your personalised review queue…</span>
        </div>
      )}

      {/* #3 — Inline error banner */}
      {sessionError && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 12, padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ color: '#fca5a5', fontSize: 14 }}>{sessionError}</span>
          </div>
          <button
            onClick={() => setSessionError(null)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >×</button>
        </div>
      )}

      {phase === 'concept-picker' && (
        <ConceptPicker
          concepts={filteredConcepts}
          conceptsLoading={conceptsLoading}
          mastery={mastery}
          selectedConcept={selectedConcept}
          selectedDomain={selectedDomain}
          selectedDiff={selectedDiff}
          questionCount={questionCount}
          searchQuery={searchQuery}
          onSelectConcept={setSelectedConcept}
          onSelectDomain={setSelectedDomain}
          onSelectDiff={setSelectedDiff}
          onSetCount={setQuestionCount}
          onSearch={setSearchQuery}
          onStart={startSession}
        />
      )}

      {phase === 'loading' && <LoadingScreen concept={selectedConcept?.name ?? ''} message={loadingMessage} />}

      {phase === 'session' && questions[currentIndex] && (
        <SessionView
          question={questions[currentIndex]}
          questionIndex={currentIndex}
          totalQuestions={questions.length}
          result={result}
          hintsShown={hintsShown}
          selectedOption={selectedOption}
          tfAnswer={tfAnswer}
          shortAnswer={shortAnswer}
          xpAnim={xpAnim}
          confidenceGiven={confidenceGiven}
          onSelectOption={setSelectedOption}
          onSetTf={setTfAnswer}
          onSetShortAnswer={setShortAnswer}
          onRevealHint={() => setHintsShown(h => Math.min(h + 1, (questions[currentIndex]?.hints?.length ?? 0)))}
          onSubmit={submitAnswer}
          onRateConfidence={(g: number) => setConfidenceGiven(g)}
          onNext={nextQuestion}
        />
      )}

      {phase === 'summary' && (
        <SummaryScreen
          stats={stats}
          concept={selectedConcept?.name ?? ''}
          wrongCount={wrongQuestions.length}
          isReviewMode={isReviewMode}
          reviewQueueIndex={reviewQueueIndex}
          reviewQueueTotal={reviewQueue.length}
          onRestart={() => { setSelectedConcept(null); setWrongQuestions([]); setPhase('concept-picker'); }}
          onRepeat={startSession}
          onRetryWrong={startRetrySession}
          onNextReview={() => {
            const nextIdx = reviewQueueIndex + 1;
            if (nextIdx < reviewQueue.length) {
              setReviewQueueIndex(nextIdx);
              setSelectedConcept(reviewQueue[nextIdx]);
              setWrongQuestions([]);
              setPhase('concept-picker');
              // Auto-start after a brief moment for state to settle
              setTimeout(() => startSession(), 100);
            } else {
              // All done
              setIsReviewMode(false);
              setReviewQueue([]);
              setReviewQueueIndex(0);
              setPhase('concept-picker');
            }
          }}
        />
      )}

      {/* Sprint 4: Level-up overlay */}
      {levelUpAnim?.visible && (
        <LevelUpOverlay
          level={levelUpAnim.level}
          conceptName={levelUpAnim.conceptName}
          onDone={() => setLevelUpAnim(null)}
        />
      )}

      {/* Achievement popups */}
      {achievementPopups.length > 0 && (
        <div style={{ position: 'fixed', top: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 999, pointerEvents: 'none' }}>
          {achievementPopups.map((type, i) => (
            <div key={type + i} style={{
              padding: '12px 18px', borderRadius: 14, minWidth: 220,
              background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(168,85,247,0.15))',
              border: '1px solid rgba(245,158,11,0.4)',
              boxShadow: '0 0 24px rgba(245,158,11,0.3)',
              animation: 'slideInRight 0.3s ease',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 22 }}>🏆</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>Achievement Unlocked!</div>
                <div style={{ fontSize: 11, color: '#e2e8f0' }}>{type.replace(/_/g, ' ')}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-difficulty suggestion */}
      {autoSuggestion && (
        <div style={{
          position: 'fixed', bottom: 32, right: 24, zIndex: 998,
          padding: '12px 18px', borderRadius: 14, maxWidth: 260,
          background: autoSuggestion === 'HARD' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
          border: `1px solid ${autoSuggestion === 'HARD' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          animation: 'slideInRight 0.3s ease',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: autoSuggestion === 'HARD' ? '#fca5a5' : '#6ee7b7', marginBottom: 3 }}>
            💡 {autoSuggestion === 'HARD' ? 'Ready for a challenge?' : 'Let\'s slow down'}
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>
            Based on your accuracy, try <strong style={{ color: '#e2e8f0' }}>{autoSuggestion}</strong> difficulty next time.
          </div>
        </div>
      )}

      {/* Sound toggle */}
      <button
        onClick={() => { toggleSound(); setSoundEnabled(s => !s); }}
        title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
        style={{
          position: 'fixed', bottom: 24, left: 24, zIndex: 997,
          width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(15,23,42,0.8)', cursor: 'pointer', fontSize: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)',
        }}
      >
        {soundEnabled ? '🔊' : '🔇'}
      </button>

      <style>{`
        @keyframes slideInRight { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}

// ─── Concept Picker ───────────────────────────────────────────────────────────

function ConceptPicker({
  concepts, conceptsLoading, mastery, selectedConcept, selectedDomain, selectedDiff, questionCount,
  searchQuery, onSelectConcept, onSelectDomain, onSelectDiff, onSetCount, onSearch, onStart,
}: any) {
  const diffOptions: QuestionDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
            ⚡ Practice Session
          </h1>
          <p style={{ color: '#94a3b8', marginTop: 8, fontSize: 15 }}>
            Choose a concept and difficulty, then let AI generate personalized questions for you.
          </p>
        </div>
        <Link href="/dashboard/practice/history" style={{
          padding: '8px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          color: '#94a3b8', fontSize: 13, fontWeight: 600, textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          transition: 'all 0.2s',
        }}>
          📋 History
        </Link>
      </div>

      {/* Domain + Difficulty + Count row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {/* Domain */}
        <div style={{ display: 'flex', gap: 8 }}>
          {(['DSA', 'SYSTEM_DESIGN'] as const).map(d => (
            <button key={d} onClick={() => onSelectDomain(d)} style={{
              padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
              background: selectedDomain === d ? '#6366f1' : 'rgba(255,255,255,0.06)',
              color: selectedDomain === d ? '#fff' : '#94a3b8',
            }}>
              {d === 'DSA' ? 'DSA' : 'System Design'}
            </button>
          ))}
        </div>

        {/* Difficulty */}
        <div style={{ display: 'flex', gap: 8 }}>
          {diffOptions.map(d => (
            <button key={d} onClick={() => onSelectDiff(d)} style={{
              padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
              background: selectedDiff === d ? DIFF_COLORS[d] + '33' : 'rgba(255,255,255,0.06)',
              color: selectedDiff === d ? DIFF_COLORS[d] : '#94a3b8',
              boxShadow: selectedDiff === d ? `0 0 0 1px ${DIFF_COLORS[d]}55` : 'none',
            }}>
              {DIFF_LABELS[d]}
            </button>
          ))}
        </div>

        {/* Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>Questions:</span>
          {[3, 5, 10].map(n => (
            <button key={n} onClick={() => onSetCount(n)} style={{
              width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 14, transition: 'all 0.2s',
              background: questionCount === n ? '#6366f1' : 'rgba(255,255,255,0.06)',
              color: questionCount === n ? '#fff' : '#94a3b8',
            }}>{n}</button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 16 }}>🔍</span>
        <input
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search concepts..."
          style={{
            width: '100%', padding: '12px 16px 12px 42px', borderRadius: 12,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#f1f5f9', fontSize: 15, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* #6 — Skeleton OR #5 — Empty state OR concept grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 12, marginBottom: 28, maxHeight: 380, overflowY: 'auto', paddingRight: 4,
      }}>
        {conceptsLoading ? (
          // #6 Skeleton loaders
          Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{
              padding: '14px 16px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
              animation: 'shimmer 1.5s infinite',
            }}>
              <div style={{ height: 14, borderRadius: 6, background: 'rgba(255,255,255,0.08)', marginBottom: 10, width: '70%' }} />
              <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.05)', width: '40%' }} />
            </div>
          ))
        ) : concepts.length === 0 ? (
          // #5 Empty state
          <div style={{
            gridColumn: '1 / -1', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: '48px 24px',
            background: 'rgba(255,255,255,0.03)', borderRadius: 16,
            border: '1px dashed rgba(255,255,255,0.1)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🌐</div>
            <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 16, marginBottom: 8 }}>
              {searchQuery ? 'No concepts match your search' : 'No concepts found'}
            </div>
            <div style={{ color: '#64748b', fontSize: 14, textAlign: 'center', maxWidth: 300 }}>
              {searchQuery
                ? 'Try a different search term or clear the search.'
                : 'The knowledge graph is empty. Seed the graph first via the Knowledge Graph page.'}
            </div>
            {searchQuery && (
              <button
                onClick={() => onSearch('')}
                style={{
                  marginTop: 16, padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: 'rgba(99,102,241,0.2)', color: '#a5b4fc',
                  cursor: 'pointer', fontWeight: 600, fontSize: 14,
                }}
              >Clear search</button>
            )}
          </div>
        ) : (
          concepts.map((c: ConceptOption) => {
            const isSelected = selectedConcept?.id === c.id;
            const m = mastery[c.id];
            const lvl = m?.masteryLevel ?? 0;
            return (
              <button key={c.id} onClick={() => onSelectConcept(c)} style={{
                padding: '14px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.2s',
                background: isSelected
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.2))'
                  : 'rgba(255,255,255,0.04)',
                boxShadow: isSelected ? '0 0 0 2px #6366f1, 0 4px 20px rgba(99,102,241,0.2)' : '0 0 0 1px rgba(255,255,255,0.06)',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
              }}>
                <div style={{ fontWeight: 600, color: isSelected ? '#a5b4fc' : '#e2e8f0', fontSize: 14, marginBottom: 6 }}>
                  {c.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 6 }}>
                    {c.category}
                  </span>
                  {/* #4 — Mastery badge */}
                  {lvl > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                      background: MASTERY_COLORS[lvl] + '22', color: MASTERY_COLORS[lvl],
                      border: `1px solid ${MASTERY_COLORS[lvl]}44`,
                    }}>
                      {MASTERY_LABELS[lvl]}
                    </span>
                  )}
                </div>
                {/* Mastery bar */}
                {m && m.totalAttempts > 0 && (
                  <div style={{ marginTop: 8, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2, transition: 'width 0.4s',
                      width: `${Math.round(m.masteryScore * 100)}%`,
                      background: MASTERY_COLORS[lvl],
                    }} />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Self-Assessment Slider (shown when concept has no prior attempts) */}
      {selectedConcept && !mastery[selectedConcept.id]?.totalAttempts && (
        <SelfAssessmentSlider concept={selectedConcept} onRate={() => {}} />
      )}

      {/* Start button */}
      <button
        onClick={onStart}
        disabled={!selectedConcept}
        style={{
          width: '100%', padding: '16px', borderRadius: 14, border: 'none',
          cursor: selectedConcept ? 'pointer' : 'not-allowed',
          background: selectedConcept
            ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
            : 'rgba(255,255,255,0.06)',
          color: selectedConcept ? '#fff' : '#475569',
          fontSize: 16, fontWeight: 700, transition: 'all 0.3s',
          boxShadow: selectedConcept ? '0 8px 32px rgba(99,102,241,0.4)' : 'none',
        }}
      >
        {selectedConcept
          ? `⚡ Start ${questionCount} questions on "${selectedConcept.name}"`
          : 'Select a concept to begin'}
      </button>

      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}


// ─── Self-Assessment Slider ───────────────────────────────────────────────────

const SELF_ASSESS_LABELS = ['No idea 😰', 'Vague idea 🤔', 'Somewhat sure 🙂', 'Fairly confident 😊', 'Very confident 🌟'];

function SelfAssessmentSlider({ concept, onRate }: { concept: { id: string; name: string; domain: string }; onRate: (r: number) => void }) {
  const [rating, setRating] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const handleRate = (r: number) => {
    setRating(r);
    // Fire-and-forget: seed FSRS algorithm
    trackerApi.seedAssessment(concept.id, concept.name, concept.domain as any, r).catch(() => {});
    setSaved(true);
    onRate(r);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{
      marginBottom: 16, padding: '16px 20px', borderRadius: 14,
      background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc', marginBottom: 12 }}>
        🧠 Quick Self-Assessment — How well do you know <em style={{ color: '#e2e8f0' }}>{concept.name}</em>?
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
        This helps FSRS personalise your learning schedule. You can skip it.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(r => (
          <button key={r} onClick={() => handleRate(r)} style={{
            flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
            background: rating === r ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${rating === r ? '#6366f1' : 'rgba(255,255,255,0.06)'}`,
            color: rating === r ? '#a5b4fc' : '#64748b', fontSize: 11, fontWeight: 600,
            transition: 'all 0.15s',
          }}>
            {r}
          </button>
        ))}
      </div>
      {rating && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#6366f1', fontWeight: 600 }}>
          {saved ? '✓ Got it! FSRS calibrated.' : SELF_ASSESS_LABELS[rating - 1]}
        </div>
      )}
    </div>
  );
}

// ─── Loading Screen ───────────────────────────────────────────────────────────

function LoadingScreen({ concept, message }: { concept: string; message: string }) {
  const isCached = message.includes('saved');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 24 }}>
      <div style={{ fontSize: 48, animation: isCached ? 'none' : 'spin 1s linear infinite' }}>
        {isCached ? '📚' : '⚙️'}
      </div>
      <div style={{ textAlign: 'center' }}>
        {/* #7 — specific loading message */}
        <div style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>{message}</div>
        <div style={{ color: '#94a3b8', fontSize: 15 }}>
          {isCached ? 'Found saved questions for ' : 'Preparing personalized questions on '}
          <strong style={{ color: '#a5b4fc' }}>{concept}</strong>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Syntax Highlighter ───────────────────────────────────────────────────────

const KEYWORDS: Record<string, string[]> = {
  python: ['def','class','return','if','elif','else','for','while','import','from','as','try','except','with','in','not','and','or','True','False','None','lambda','yield','pass','break','continue','raise','is','self','print'],
  javascript: ['function','return','if','else','for','while','const','let','var','class','new','this','import','export','default','from','try','catch','throw','async','await','typeof','instanceof','true','false','null','undefined','of','in'],
  typescript: ['function','return','if','else','for','while','const','let','var','class','new','this','import','export','default','from','try','catch','throw','async','await','typeof','instanceof','true','false','null','undefined','interface','type','enum','extends','implements','readonly','any','string','number','boolean','void'],
  java: ['public','private','protected','static','void','int','String','class','new','return','if','else','for','while','try','catch','throws','import','package','boolean','null','true','false','this','super','final','abstract','extends','implements','interface'],
  cpp: ['int','void','return','class','struct','if','else','for','while','include','namespace','using','new','delete','public','private','protected','bool','true','false','nullptr','const','auto','template','typename','virtual','override'],
};

function tokenizeLine(line: string, lang: string): { text: string; color: string }[] {
  const keywords = new Set(KEYWORDS[lang] ?? KEYWORDS.javascript);
  const tokens: { text: string; color: string }[] = [];
  let i = 0;
  // Comment detection
  const commentStart = lang === 'python' ? '#' : '//';
  const commentIdx = line.indexOf(commentStart);
  const codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
  const commentPart = commentIdx >= 0 ? line.slice(commentIdx) : '';

  const wordRe = /[a-zA-Z_][a-zA-Z0-9_]*/g;
  const numRe = /\b\d+(\.\d+)?\b/g;
  const strRe = /(["'`])((?:\\.|[^\\])*?)\1/g;

  // Build token list from code part
  let last = 0;
  const allMatches: { start: number; end: number; text: string; color: string }[] = [];

  let m;
  // Strings first (highest priority)
  strRe.lastIndex = 0;
  while ((m = strRe.exec(codePart))) {
    allMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0], color: '#86efac' });
  }
  // Numbers
  numRe.lastIndex = 0;
  while ((m = numRe.exec(codePart))) {
    if (!allMatches.some(t => m!.index >= t.start && m!.index < t.end))
      allMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0], color: '#fdba74' });
  }
  // Keywords / identifiers
  wordRe.lastIndex = 0;
  while ((m = wordRe.exec(codePart))) {
    if (!allMatches.some(t => m!.index >= t.start && m!.index < t.end))
      allMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0],
        color: keywords.has(m[0]) ? '#c084fc' : '#e2e8f0' });
  }
  allMatches.sort((a, b) => a.start - b.start);

  last = 0;
  for (const t of allMatches) {
    if (t.start > last) tokens.push({ text: codePart.slice(last, t.start), color: '#94a3b8' });
    tokens.push({ text: t.text, color: t.color });
    last = t.end;
  }
  if (last < codePart.length) tokens.push({ text: codePart.slice(last), color: '#94a3b8' });
  if (commentPart) tokens.push({ text: commentPart, color: '#475569' });
  return tokens;
}

function SyntaxHighlighter({ code, lang = 'python' }: { code: string; lang?: string }) {
  const lines = code.split('\n');
  return (
    <div style={{ fontFamily: '"Fira Code","Cascadia Code","JetBrains Mono",Menlo,monospace', fontSize: 13, lineHeight: 1.7 }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'flex', minHeight: '1.7em' }}>
          <span style={{ color: '#334155', userSelect: 'none', minWidth: 28, textAlign: 'right', paddingRight: 16, fontSize: 11, flexShrink: 0, lineHeight: 1.7 }}>
            {i + 1}
          </span>
          <span>
            {tokenizeLine(line, lang).map((t, j) => (
              <span key={j} style={{ color: t.color }}>{t.text}</span>
            ))}
            {line === '' && <span> </span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Session View ─────────────────────────────────────────────────────────────

function SessionView({
  question, questionIndex, totalQuestions, result, hintsShown,
  selectedOption, tfAnswer, shortAnswer, xpAnim, confidenceGiven,
  onSelectOption, onSetTf, onSetShortAnswer, onRevealHint, onSubmit, onNext, onRateConfidence,
}: any) {
  const q: Question = question;
  const answered = result !== null;
  const progress = (questionIndex / totalQuestions) * 100;

  // #2 — Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in textarea/input
      if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (answered) {
        if (e.key === 'Enter' || e.key === 'ArrowRight') onNext(confidenceGiven ?? undefined);
        // Number keys 1-4 to rate confidence when result is shown
        if (['1','2','3','4'].includes(e.key)) { onRateConfidence(parseInt(e.key)); }
        return;
      }
      if (q.questionType === 'MCQ' && q.options) {
        const idx = parseInt(e.key, 10);
        if (idx >= 1 && idx <= q.options.length) {
          onSelectOption(q.options[idx - 1].charAt(0));
        }
        if (e.key === 'Enter' && selectedOption) onSubmit();
      }
      if (q.questionType === 'TRUE_FALSE') {
        if (e.key === 't' || e.key === 'T') { onSetTf('true'); }
        if (e.key === 'f' || e.key === 'F') { onSetTf('false'); }
        if (e.key === 'Enter' && tfAnswer) onSubmit();
      }
      if (e.key === 'h' || e.key === 'H') onRevealHint();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [answered, q, selectedOption, tfAnswer, onSelectOption, onSetTf, onSubmit, onNext, onRevealHint]);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative' }}>
      {/* Sprint 4: XP Animation with streak multiplier */}
      {xpAnim?.visible && (
        <div style={{
          position: 'fixed', top: '20%', right: '5%', zIndex: 1000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          animation: 'xpFloat 2.2s ease forwards', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#a5b4fc', textShadow: '0 0 20px rgba(99,102,241,0.8)' }}>
            +{xpAnim.xp} XP
          </div>
          {xpAnim.multiplier && xpAnim.multiplier > 1.0 && (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fb923c', background: 'rgba(249,115,22,0.15)', padding: '2px 10px', borderRadius: 20 }}>
              🔥 ×{xpAnim.multiplier.toFixed(1)} streak bonus!
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>Question {questionIndex + 1} of {totalQuestions}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#475569', fontSize: 11 }}>Press 1-4 · H=hint · Enter=next</span>
            <span style={{ color: '#94a3b8', fontSize: 13, background: 'rgba(255,255,255,0.05)', padding: '2px 10px', borderRadius: 20 }}>
              {q.questionType.replace('_', ' ')} · <span style={{ color: DIFF_COLORS[q.difficulty] }}>{DIFF_LABELS[q.difficulty]}</span>
            </span>
          </div>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 4, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Question card */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '32px', marginBottom: 20,
      }}>
        {/* #4 — CODE_SNIPPET with real syntax highlighting */}
        {q.codeSnippet && (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
              fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              <span>{'</>'}</span>
              <span>{q.language ?? 'code'}</span>
            </div>
            <div style={{
              background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 12, padding: '16px 20px', overflowX: 'auto',
            }}>
              <SyntaxHighlighter code={q.codeSnippet} lang={q.language ?? 'python'} />
            </div>
          </div>
        )}

        <p style={{ fontSize: 19, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.5, margin: '0 0 28px' }}>
          {q.content}
        </p>

        {/* MCQ Options */}
        {q.questionType === 'MCQ' && q.options && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {q.options.map((opt: string, idx: number) => {
              const letter = opt.charAt(0);
              const isSelected = selectedOption === letter;
              const isCorrect = answered && result?.correctAnswer === letter;
              const isWrong = answered && isSelected && !result?.isCorrect;
              return (
                <button key={opt} onClick={() => !answered && onSelectOption(letter)} disabled={answered}
                  style={{
                    padding: '14px 18px', borderRadius: 12, border: 'none',
                    cursor: answered ? 'default' : 'pointer', textAlign: 'left',
                    fontWeight: 500, fontSize: 15, transition: 'all 0.2s',
                    background: isCorrect ? 'rgba(16,185,129,0.2)' : isWrong ? 'rgba(239,68,68,0.2)' : isSelected ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                    color: isCorrect ? '#10b981' : isWrong ? '#ef4444' : isSelected ? '#a5b4fc' : '#cbd5e1',
                    boxShadow: isCorrect ? '0 0 0 1px #10b98155' : isWrong ? '0 0 0 1px #ef444455' : isSelected ? '0 0 0 1px #6366f155' : '0 0 0 1px rgba(255,255,255,0.06)',
                  }}>
                  <span style={{ color: '#475569', marginRight: 10, fontSize: 12 }}>{idx + 1}</span>
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {/* True / False */}
        {q.questionType === 'TRUE_FALSE' && (
          <div style={{ display: 'flex', gap: 16 }}>
            {['true', 'false'].map(val => {
              const isSelected = tfAnswer === val;
              const isCorrect = answered && result?.correctAnswer === val;
              const isWrong = answered && isSelected && !result?.isCorrect;
              return (
                <button key={val} onClick={() => !answered && onSetTf(val)} disabled={answered}
                  style={{
                    flex: 1, padding: '20px', borderRadius: 14, border: 'none',
                    cursor: answered ? 'default' : 'pointer', fontWeight: 700, fontSize: 18, transition: 'all 0.2s',
                    background: isCorrect ? 'rgba(16,185,129,0.2)' : isWrong ? 'rgba(239,68,68,0.2)' : isSelected ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                    color: isCorrect ? '#10b981' : isWrong ? '#ef4444' : isSelected ? '#a5b4fc' : '#94a3b8',
                    boxShadow: isCorrect ? '0 0 0 2px #10b981' : isWrong ? '0 0 0 2px #ef4444' : isSelected ? '0 0 0 2px #6366f1' : '0 0 0 1px rgba(255,255,255,0.08)',
                  }}>
                  {val === 'true' ? '✅ True' : '❌ False'}
                  <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>{val === 'true' ? 'Press T' : 'Press F'}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Short Answer / Code Snippet answer */}
        {(q.questionType === 'SHORT_ANSWER' || q.questionType === 'CODE_SNIPPET') && (
          <textarea
            value={shortAnswer}
            onChange={e => !answered && onSetShortAnswer(e.target.value)}
            disabled={answered}
            rows={q.questionType === 'CODE_SNIPPET' ? 6 : 4}
            placeholder={q.questionType === 'CODE_SNIPPET' ? 'Write your code fix here...' : 'Type your answer...'}
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', fontSize: 14,
              fontFamily: q.questionType === 'CODE_SNIPPET' ? '"Fira Code", monospace' : 'inherit',
              resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6,
            }}
          />
        )}
      </div>

      {/* Hints */}
      {!answered && q.hints?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {Array.from({ length: hintsShown }).map((_: unknown, i: number) => (
            <div key={i} style={{
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 8, color: '#fcd34d', fontSize: 14,
            }}>
              💡 <strong>Hint {i + 1}:</strong> {q.hints[i]}
            </div>
          ))}
          {hintsShown < q.hints.length && (
            <button onClick={onRevealHint} style={{
              background: 'transparent', border: '1px solid rgba(245,158,11,0.3)',
              color: '#f59e0b', padding: '8px 18px', borderRadius: 20, cursor: 'pointer', fontSize: 13,
            }}>
              💡 Reveal hint ({hintsShown + 1}/{q.hints.length}) · −10% score  <kbd style={{ fontSize: 10, opacity: 0.6, marginLeft: 6, background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>H</kbd>
            </button>
          )}
        </div>
      )}

      {/* Feedback panel with score display */}
      {answered && (
        <div style={{
          background: result!.isCorrect ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${result!.isCorrect ? '#10b98140' : '#ef444440'}`,
          borderRadius: 16, padding: '20px 24px', marginBottom: 20,
          animation: 'fadeIn 0.3s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28 }}>{result!.isCorrect ? '🎉' : '❌'}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: result!.isCorrect ? '#10b981' : '#ef4444' }}>
                  {result!.isCorrect ? 'Correct!' : 'Incorrect'}
                </div>
                {!result!.isCorrect && (
                  <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
                    Correct answer: <strong style={{ color: '#e2e8f0' }}>{result!.correctAnswer}</strong>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: '5px 12px', color: '#94a3b8', fontSize: 13, fontWeight: 600,
              }}>
                Score: <span style={{ color: '#f1f5f9' }}>{Math.round(result!.score * 100)}%</span>
              </div>
              {result!.xpEarned > 0 && (
                <div style={{
                  background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 10, padding: '5px 12px', color: '#a5b4fc', fontWeight: 700, fontSize: 14,
                }}>
                  +{result!.xpEarned} XP
                </div>
              )}
            </div>
          </div>
          <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: '#e2e8f0' }}>Explanation: </strong>{result!.explanation}
          </p>
        </div>
      )}

      {/* Sprint 4: Confidence Rating Panel (shown after result revealed) */}
      {answered && (
        <div style={{
          padding: '16px 20px', borderRadius: 14, marginBottom: 12,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          animation: 'fadeIn 0.3s ease',
        }}>
          <p style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, marginBottom: 10, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            How confident were you? <span style={{ opacity: 0.5 }}>(1-4 to rate)</span>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { grade: 1, label: 'Again', sub: 'Didn\'t recall', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
              { grade: 2, label: 'Hard', sub: 'Recalled with effort', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
              { grade: 3, label: 'Good', sub: 'Recalled correctly', color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
              { grade: 4, label: 'Easy', sub: 'Effortless recall', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
            ].map(({ grade, label, sub, color, bg }) => (
              <button
                key={grade}
                onClick={() => onRateConfidence(grade)}
                style={{
                  padding: '10px 8px', borderRadius: 10, border: `1px solid ${confidenceGiven === grade ? color : 'rgba(255,255,255,0.07)'}`,
                  background: confidenceGiven === grade ? bg : 'transparent',
                  cursor: 'pointer', transition: 'all 0.15s',
                  transform: confidenceGiven === grade ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: confidenceGiven === grade ? color : '#94a3b8' }}>{label}</div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{sub}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12 }}>
        {!answered && (
          <button
            onClick={onSubmit}
            disabled={!selectedOption && !tfAnswer && !shortAnswer}
            style={{
              flex: 1, padding: '14px', borderRadius: 12, border: 'none',
              cursor: (selectedOption || tfAnswer || shortAnswer) ? 'pointer' : 'not-allowed',
              background: (selectedOption || tfAnswer || shortAnswer) ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.06)',
              color: (selectedOption || tfAnswer || shortAnswer) ? '#fff' : '#475569',
              fontWeight: 700, fontSize: 16, transition: 'all 0.2s',
            }}>
            Submit Answer  <kbd style={{ fontSize: 12, opacity: 0.6, marginLeft: 6, background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 4 }}>↵</kbd>
          </button>
        )}
        {answered && (
          <button onClick={() => onNext(confidenceGiven ?? undefined)} style={{
            flex: 1, padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 700, fontSize: 16,
            boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          }}>
            {questionIndex + 1 >= totalQuestions ? 'View Summary 🏆' : 'Next Question →'}
            <kbd style={{ fontSize: 12, opacity: 0.6, marginLeft: 8, background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 4 }}>→</kbd>
          </button>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes xpFloat { 0% { opacity: 0; transform: translateY(0) scale(0.8); } 20% { opacity: 1; transform: translateY(-10px) scale(1.1); } 80% { opacity: 1; transform: translateY(-40px) scale(1); } 100% { opacity: 0; transform: translateY(-70px) scale(0.9); } }
      `}</style>
    </div>
  );
}

// ─── Summary Screen ───────────────────────────────────────────────────────────

function SummaryScreen({ stats, concept, wrongCount, onRestart, onRepeat, onRetryWrong, isReviewMode, reviewQueueIndex, reviewQueueTotal, onNextReview }: any) {
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const grade = accuracy >= 90 ? 'S' : accuracy >= 75 ? 'A' : accuracy >= 60 ? 'B' : accuracy >= 40 ? 'C' : 'D';
  const gradeColor = ({ S: '#f59e0b', A: '#10b981', B: '#6366f1', C: '#f97316', D: '#ef4444' } as any)[grade];
  const avgScore = stats.results.length > 0
    ? Math.round((stats.results.reduce((s: number, r: AttemptResult) => s + r.score, 0) / stats.results.length) * 100)
    : 0;
  const hasMoreInQueue = isReviewMode && reviewQueueIndex < reviewQueueTotal - 1;
  const reviewComplete = isReviewMode && reviewQueueIndex >= reviewQueueTotal - 1;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 72, marginBottom: 16, animation: 'bounceIn 0.6s ease' }}>
        {reviewComplete ? '🎉' : accuracy >= 80 ? '🏆' : accuracy >= 60 ? '🎯' : '📚'}
      </div>

      <h2 style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>
        {reviewComplete ? 'Review Complete!' : 'Session Complete!'}
      </h2>
      <p style={{ color: '#94a3b8', marginBottom: reviewComplete ? 8 : 32, fontSize: 15 }}>{concept}</p>

      {/* Review mode progress indicator */}
      {isReviewMode && (
        <div style={{ marginBottom: 24, fontSize: 13, color: '#64748b' }}>
          {reviewComplete
            ? `✅ All ${reviewQueueTotal} due concepts reviewed!`
            : `Concept ${reviewQueueIndex + 1} of ${reviewQueueTotal} done`}
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Grade', value: grade, color: gradeColor, big: true },
          { label: 'Accuracy', value: `${accuracy}%`, color: '#f1f5f9', big: true },
          { label: 'Correct', value: `${stats.correct} / ${stats.total}`, color: '#10b981' },
          { label: 'XP Earned', value: `+${stats.xpEarned}`, color: '#a5b4fc' },
          { label: 'Avg Score', value: `${avgScore}%`, color: '#f59e0b' },
          { label: 'Avg Time', value: `${(stats.avgTime / 1000).toFixed(1)}s`, color: '#94a3b8' },
        ].map((s, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16, padding: '20px',
          }}>
            <div style={{ fontSize: s.big ? 36 : 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* #1 — Retry wrong answers callout */}
      {wrongCount > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 14, padding: '16px 20px', marginBottom: 20, textAlign: 'left',
        }}>
          <div style={{ fontWeight: 700, color: '#fca5a5', marginBottom: 4 }}>❌ {wrongCount} incorrect answer{wrongCount > 1 ? 's' : ''}</div>
          <div style={{ color: '#94a3b8', fontSize: 13 }}>Want to drill just the ones you missed?</div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {wrongCount > 0 && !hasMoreInQueue && (
          <button onClick={onRetryWrong} style={{
            flex: 1, minWidth: 140, padding: '14px', borderRadius: 12,
            border: '1px solid rgba(239,68,68,0.4)',
            background: 'rgba(239,68,68,0.1)', color: '#fca5a5',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>🔄 Retry {wrongCount} Mistake{wrongCount > 1 ? 's' : ''}</button>
        )}
        {!hasMoreInQueue && (
          <button onClick={onRepeat} style={{
            flex: 1, minWidth: 140, padding: '14px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.3)',
            background: 'transparent', color: '#a5b4fc', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>🔁 Repeat Session</button>
        )}
        {hasMoreInQueue ? (
          <button onClick={onNextReview} style={{
            flex: 2, minWidth: 200, padding: '16px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #ef4444, #f59e0b)',
            color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(239,68,68,0.4)',
            animation: 'pulseReview 2s infinite',
          }}>Next Concept → ({reviewQueueIndex + 2} of {reviewQueueTotal})</button>
        ) : (
          <button onClick={onRestart} style={{
            flex: 1, minWidth: 140, padding: '14px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          }}>{reviewComplete ? '🏠 Back to Dashboard' : '✨ New Concept'}</button>
        )}
      </div>

      <style>{`
        @keyframes bounceIn { 0% { transform: scale(0.3); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes pulseReview { 0%,100% { box-shadow: 0 4px 20px rgba(239,68,68,0.4); } 50% { box-shadow: 0 4px 30px rgba(239,68,68,0.7); } }
      `}</style>
    </div>
  );
}

// ─── Level-Up Overlay (Sprint 4) ──────────────────────────────────────────────

const LEVEL_NAMES = ['Not Started', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
const LEVEL_COLORS = ['#475569', '#6366f1', '#8b5cf6', '#f59e0b', '#10b981'];
const LEVEL_ICONS = ['⚪', '🔵', '🟣', '🟡', '🌟'];

function LevelUpOverlay({ level, conceptName, onDone }: { level: number; conceptName: string; onDone: () => void }) {
  const color = LEVEL_COLORS[level] ?? '#6366f1';
  const icon = LEVEL_ICONS[level] ?? '✨';
  const name = LEVEL_NAMES[level] ?? 'Expert';

  return (
    <div
      onClick={onDone}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(2,6,23,0.92)', backdropFilter: 'blur(12px)',
        animation: 'fadeIn 0.3s ease',
        cursor: 'pointer',
      }}
    >
      <div style={{
        textAlign: 'center',
        animation: 'levelUpPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
      }}>
        {/* Radial glow burst */}
        <div style={{
          width: 200, height: 200, borderRadius: '50%', margin: '0 auto 28px',
          background: `radial-gradient(circle, ${color}33 0%, transparent 70%)`,
          boxShadow: `0 0 60px ${color}55, 0 0 120px ${color}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 72, animation: 'rotate 8s linear infinite',
        }}>
          {icon}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
          LEVEL UP!
        </div>
        <div style={{ fontSize: 48, fontWeight: 900, color, marginBottom: 8, textShadow: `0 0 30px ${color}80` }}>
          {name}
        </div>
        <div style={{ fontSize: 15, color: '#94a3b8', marginBottom: 4 }}>
          You&apos;ve reached <strong style={{ color: '#e2e8f0' }}>{name}</strong> in
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 28 }}>
          {conceptName}
        </div>
        <div style={{ fontSize: 13, color: '#475569' }}>click anywhere to continue</div>
      </div>
      <style>{`
        @keyframes levelUpPop {
          0% { transform: scale(0.5) translateY(30px); opacity: 0; }
          80% { transform: scale(1.05) translateY(-5px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
