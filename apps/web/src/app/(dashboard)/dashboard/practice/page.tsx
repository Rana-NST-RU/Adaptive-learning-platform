'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { questionsApi, graphApi } from '@/lib/api-client';
import type { Question, AttemptResult, QuestionDifficulty, MasteryData } from '@/lib/api-client';

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
  const [phase, setPhase] = useState<SessionPhase>('concept-picker');
  const [concepts, setConcepts] = useState<ConceptOption[]>([]);
  const [conceptsLoading, setConceptsLoading] = useState(true);
  const [mastery, setMastery] = useState<Record<string, MasteryData>>({});
  const [selectedConcept, setSelectedConcept] = useState<ConceptOption | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<'DSA' | 'SYSTEM_DESIGN'>('DSA');
  const [selectedDiff, setSelectedDiff] = useState<QuestionDifficulty>('MEDIUM');
  const [questionCount, setQuestionCount] = useState(5);
  const [loadingMessage, setLoadingMessage] = useState('Generating AI questions…');

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [stats, setStats] = useState<SessionStats>({ total: 0, correct: 0, xpEarned: 0, avgTime: 0, results: [] });
  const [hintsShown, setHintsShown] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [tfAnswer, setTfAnswer] = useState<string | null>(null);
  const [shortAnswer, setShortAnswer] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null); // #3 inline error
  const startTimeRef = useRef<number>(Date.now());

  // Load concepts + mastery
  useEffect(() => {
    setConceptsLoading(true);
    graphApi.getGraph(selectedDomain)
      .then((res) => {
        const nodes: ConceptOption[] = res.data.nodes.map((n: any) => ({
          id: n.id, name: n.name, category: n.category,
          difficulty: n.difficulty, domain: n.domain,
        }));
        setConcepts(nodes);

        // #4 — fetch mastery for all concepts
        if (nodes.length > 0) {
          questionsApi.getMastery(nodes.map(n => n.id))
            .then(r => setMastery(r.data))
            .catch(() => {}); // silently fail if not logged in
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

  const nextQuestion = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setPhase('summary');
    } else {
      setCurrentIndex(i => i + 1);
      setResult(null);
      setSelectedOption(null);
      setTfAnswer(null);
      setShortAnswer('');
      setHintsShown(0);
      startTimeRef.current = Date.now();
    }
  }, [currentIndex, questions.length]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', padding: '24px' }}>
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
          onSelectOption={setSelectedOption}
          onSetTf={setTfAnswer}
          onSetShortAnswer={setShortAnswer}
          onRevealHint={() => setHintsShown(h => Math.min(h + 1, (questions[currentIndex]?.hints?.length ?? 0)))}
          onSubmit={submitAnswer}
          onNext={nextQuestion}
        />
      )}

      {phase === 'summary' && (
        <SummaryScreen
          stats={stats}
          concept={selectedConcept?.name ?? ''}
          onRestart={() => { setSelectedConcept(null); setPhase('concept-picker'); }}
          onRepeat={startSession}
        />
      )}
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
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
          ⚡ Practice Session
        </h1>
        <p style={{ color: '#94a3b8', marginTop: 8, fontSize: 15 }}>
          Choose a concept and difficulty, then let AI generate personalized questions for you.
        </p>
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

// ─── Session View ─────────────────────────────────────────────────────────────

function SessionView({
  question, questionIndex, totalQuestions, result, hintsShown,
  selectedOption, tfAnswer, shortAnswer,
  onSelectOption, onSetTf, onSetShortAnswer, onRevealHint, onSubmit, onNext,
}: any) {
  const q: Question = question;
  const answered = result !== null;
  const progress = (questionIndex / totalQuestions) * 100;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Progress */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>Question {questionIndex + 1} of {totalQuestions}</span>
          <span style={{ color: '#94a3b8', fontSize: 13, background: 'rgba(255,255,255,0.05)', padding: '2px 10px', borderRadius: 20 }}>
            {q.questionType.replace('_', ' ')} · <span style={{ color: DIFF_COLORS[q.difficulty] }}>{DIFF_LABELS[q.difficulty]}</span>
          </span>
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
        {/* #1 — CODE_SNIPPET with syntax-highlighted pre block */}
        {q.codeSnippet && (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
              fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              <span>{'</>'}</span>
              <span>{q.language ?? 'code'}</span>
            </div>
            <pre style={{
              background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 12, padding: 20, overflowX: 'auto', fontSize: 13,
              color: '#e2e8f0', fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", Menlo, monospace',
              lineHeight: 1.7, margin: 0, whiteSpace: 'pre',
            }}>
              <code style={{ color: '#c4b5fd' }}>{q.codeSnippet}</code>
            </pre>
          </div>
        )}

        <p style={{ fontSize: 19, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.5, margin: '0 0 28px' }}>
          {q.content}
        </p>

        {/* MCQ Options */}
        {q.questionType === 'MCQ' && q.options && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {q.options.map((opt: string) => {
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
              💡 Reveal hint ({hintsShown + 1}/{q.hints.length}) · −10% score
            </button>
          )}
        </div>
      )}

      {/* #2 — Feedback panel with score display */}
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
            {/* #2 — Score + XP badges */}
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
            Submit Answer
          </button>
        )}
        {answered && (
          <button onClick={onNext} style={{
            flex: 1, padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 700, fontSize: 16,
            boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          }}>
            {questionIndex + 1 >= totalQuestions ? 'View Summary 🏆' : 'Next Question →'}
          </button>
        )}
      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

// ─── Summary Screen ───────────────────────────────────────────────────────────

function SummaryScreen({ stats, concept, onRestart, onRepeat }: any) {
  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const grade = accuracy >= 90 ? 'S' : accuracy >= 75 ? 'A' : accuracy >= 60 ? 'B' : accuracy >= 40 ? 'C' : 'D';
  const gradeColor = ({ S: '#f59e0b', A: '#10b981', B: '#6366f1', C: '#f97316', D: '#ef4444' } as any)[grade];
  const avgScore = stats.results.length > 0
    ? Math.round((stats.results.reduce((s: number, r: AttemptResult) => s + r.score, 0) / stats.results.length) * 100)
    : 0;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 72, marginBottom: 16, animation: 'bounceIn 0.6s ease' }}>
        {accuracy >= 80 ? '🏆' : accuracy >= 60 ? '🎯' : '📚'}
      </div>

      <h2 style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 6 }}>Session Complete!</h2>
      <p style={{ color: '#94a3b8', marginBottom: 32, fontSize: 15 }}>{concept}</p>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Grade', value: grade, color: gradeColor, big: true },
          { label: 'Accuracy', value: `${accuracy}%`, color: '#f1f5f9', big: true },
          { label: 'Correct', value: `${stats.correct} / ${stats.total}`, color: '#10b981' },
          { label: 'XP Earned', value: `+${stats.xpEarned}`, color: '#a5b4fc' },
          // #2 — avg score in summary
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

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onRepeat} style={{
          flex: 1, padding: '14px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.3)',
          background: 'transparent', color: '#a5b4fc', fontWeight: 700, fontSize: 15, cursor: 'pointer',
        }}>🔁 Repeat Session</button>
        <button onClick={onRestart} style={{
          flex: 1, padding: '14px', borderRadius: 12, border: 'none',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
        }}>✨ New Concept</button>
      </div>

      <style>{`@keyframes bounceIn { 0% { transform: scale(0.3); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
