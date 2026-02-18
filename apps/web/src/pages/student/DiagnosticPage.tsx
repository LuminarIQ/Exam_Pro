import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api/client';
import { useQuery } from '@tanstack/react-query';

function extractApiError(err: any) {
  const payload = err?.response?.data;
  const message =
    payload?.error?.message ??
    payload?.message ??
    err?.message ??
    'Unable to start diagnostic test.';
  if (Array.isArray(message)) return message.join(', ');
  if (typeof message === 'object') return JSON.stringify(message);
  return String(message);
}

export function DiagnosticPage() {
  const [attempt, setAttempt] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, { selectedOptionId: string; startedAt: number }>>({});
  const [summary, setSummary] = useState<any>(null);
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const summaryRef = useRef<HTMLDivElement | null>(null);

  const taxonomy = useQuery({
    queryKey: ['taxonomy'],
    queryFn: async () => (await api.get('/taxonomy')).data,
  });

  useEffect(() => {
    if (!selectedSubjectId && taxonomy.data?.length) {
      setSelectedSubjectId(taxonomy.data[0].id);
    }
  }, [taxonomy.data, selectedSubjectId]);

  const selectedSubject = useMemo(() => {
    return (taxonomy.data || []).find((s: any) => s.id === selectedSubjectId) || null;
  }, [taxonomy.data, selectedSubjectId]);

  const topicIds = useMemo(() => {
    if (!selectedSubject) return [];
    const ids: string[] = [];
    selectedSubject.chapters.forEach((c: any) => c.topics.forEach((t: any) => ids.push(t.id)));
    return Array.from(new Set(ids));
  }, [selectedSubject]);

  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const activeAttemptId = localStorage.getItem('activeAttemptId');
    if (!activeAttemptId) return;
    api
      .get(`/attempts/${activeAttemptId}`)
      .then(({ data }) => {
        if (data.status === 'SUBMITTED') {
          localStorage.removeItem('activeAttemptId');
          return;
        }
        const initial: any = {};
        data.questions.forEach((q: any) => {
          initial[q.id] = {
            selectedOptionId: q.answer?.selectedOptionId || '',
            startedAt: Date.now() - (q.answer?.timeSpentSec || 0) * 1000,
          };
        });
        setAttempt({ attemptId: data.id, questions: data.questions });
        setAnswers(initial);
      })
      .catch(() => {
        localStorage.removeItem('activeAttemptId');
      });
  }, []);

  async function start() {
    if (!topicIds.length) {
      setError('No topics available yet. Ask admin to create taxonomy and publish questions.');
      return;
    }

    try {
      setLoading(true);
      const questionCount = 10;
      const { data } = await api.post('/attempts/diagnostic/start', { topicIds, questionCount });
      const initial: any = {};
      data.questions.forEach((q: any) => {
        initial[q.id] = { selectedOptionId: '', startedAt: Date.now() };
      });
      setAttempt(data);
      setAnswers(initial);
      setSummary(null);
      setError('');
      localStorage.setItem('activeAttemptId', data.attemptId);
    } catch (e: any) {
      setError(extractApiError(e));
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!attempt) return;
    const unanswered = attempt.questions.find((q: any) => !answers[q.id]?.selectedOptionId);
    if (unanswered) {
      setError('Please answer all questions before submitting.');
      return;
    }
    const payload = {
      answers: attempt.questions.map((q: any) => ({
        questionId: q.id,
        selectedOptionId: answers[q.id]?.selectedOptionId,
        timeSpentSec: Math.max(1, Math.floor((Date.now() - answers[q.id].startedAt) / 1000)),
      })),
    };
    try {
      setSubmitting(true);
      const { data } = await api.post(`/attempts/${attempt.attemptId}/submit`, payload);
      setSummary(data);
      localStorage.removeItem('activeAttemptId');
      setError('');
      setTimeout(() => {
        summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } catch (e: any) {
      setError(extractApiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!attempt) {
    return (
      <div className="rounded bg-white p-4 shadow">
        <h2 className="text-2xl font-semibold">Diagnostic Test</h2>
        <p className="mt-2 text-sm text-slate-600">Choose a subject. Diagnostic will use all topics under it.</p>
        <div className="mt-3">
          <label className="mb-1 block text-sm font-medium">Subject</label>
          <select
            className="w-full rounded border p-2"
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            disabled={taxonomy.isLoading}
          >
            {(taxonomy.data || []).map((subject: any) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Topics in selected subject: {topicIds.length}. Questions per attempt: 10
          </p>
        </div>
        {error && <p className="mt-2 rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
        <button
          className="mt-4 rounded bg-brand px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          onClick={start}
          disabled={loading || taxonomy.isLoading || !selectedSubjectId}
        >
          {loading ? 'Starting...' : 'Start Diagnostic'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Diagnostic Attempt</h2>
      {error && <div className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>}
      {attempt.questions.map((q: any, idx: number) => (
        <div key={q.id} className="rounded bg-white p-4 shadow">
          <p className="font-medium">{idx + 1}. {q.stem}</p>
          <p className="text-xs text-slate-500">
            Expected time: {q.expectedSolveTimeSec}s | Elapsed: {Math.floor((clock - answers[q.id].startedAt) / 1000)}s
          </p>
          <div className="mt-2 grid gap-2">
            {q.options.map((opt: any) => (
              <label key={opt.id} className="flex items-center gap-2 rounded border p-2">
                <input
                  type="radio"
                  name={q.id}
                  value={opt.id}
                  checked={answers[q.id]?.selectedOptionId === opt.id}
                  onChange={() => setAnswers({ ...answers, [q.id]: { ...answers[q.id], selectedOptionId: opt.id } })}
                />
                {opt.text}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        className="rounded bg-brand px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-400"
        onClick={submit}
        disabled={submitting}
      >
        {submitting ? 'Submitting...' : 'Submit Attempt'}
      </button>

      {summary && (
        <div ref={summaryRef} className="rounded bg-white p-4 shadow">
          <h3 className="text-lg font-medium">Summary</h3>
          <p>Score: {(summary.totalScore * 100).toFixed(1)}%</p>
          <p>Correct: {summary.correctCount}/{summary.totalQuestions}</p>
          <p className="mt-2 font-medium">Recommended topics:</p>
          <ul className="list-disc pl-5">
            {summary.nextRecommendedTopics.map((t: any) => <li key={t.topicId}>{t.topicName}</li>)}
          </ul>
          {summary.aiAnalysis && (
            <div className="mt-3 rounded bg-slate-50 p-3">
              <p className="font-medium">AI Diagnostic Insight</p>
              <p className="text-sm text-slate-700">{summary.aiAnalysis.summary}</p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {(summary.aiAnalysis.interventions || []).map((line: string, idx: number) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
              {!!summary.aiAnalysis.references?.length && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-slate-800">Reference Material</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {summary.aiAnalysis.references.map((ref: any, idx: number) => (
                      <li key={`${ref.url}-${idx}`}>
                        <a
                          href={ref.url}
                          target={ref.url.startsWith('http') ? '_blank' : undefined}
                          rel={ref.url.startsWith('http') ? 'noreferrer' : undefined}
                          className="text-blue-700 underline"
                        >
                          [{ref.type}] {ref.title}
                        </a>
                        <span className="ml-2 text-slate-500">({ref.topic})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
