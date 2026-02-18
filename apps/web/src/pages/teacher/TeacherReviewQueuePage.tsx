import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../../api/client';

export function TeacherReviewQueuePage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [rubricByQuestion, setRubricByQuestion] = useState<Record<string, any>>({});
  const [showOnlyFailing, setShowOnlyFailing] = useState(false);

  const { data } = useQuery({
    queryKey: ['review-queue'],
    queryFn: async () => (await api.get('/questions/review-queue')).data,
  });
  const taxonomy = useQuery({
    queryKey: ['taxonomy'],
    queryFn: async () => (await api.get('/taxonomy')).data,
  });

  const allTopics = (taxonomy.data || []).flatMap((subject: any) =>
    subject.chapters.flatMap((chapter: any) =>
      chapter.topics.map((topic: any) => ({ id: topic.id, name: topic.name })),
    ),
  );

  async function validateRubric(questionId: string) {
    const { data } = await api.get(`/questions/${questionId}/rubric-validate`);
    setRubricByQuestion((prev) => ({ ...prev, [questionId]: data }));
    return data;
  }

  async function ensureRubric(questionId: string) {
    if (rubricByQuestion[questionId]) return rubricByQuestion[questionId];
    return validateRubric(questionId);
  }

  async function approve(questionId: string, publish = false) {
    const rubric = await ensureRubric(questionId);
    if (!rubric.valid) {
      alert('Rubric validation failed. Fix the draft before approval.');
      return;
    }
    await api.post('/questions/approve', { questionId, publish });
    qc.invalidateQueries({ queryKey: ['review-queue'] });
    setRubricByQuestion((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }

  async function reject(questionId: string) {
    await api.post('/questions/reject', { questionId, reason: 'Needs improvement' });
    qc.invalidateQueries({ queryKey: ['review-queue'] });
  }

  function startEdit(question: any) {
    setEditingId(question.id);
    setDraft({
      topicIds: question.topicMaps.map((t: any) => t.topicId),
      stem: question.stem,
      explanation: question.explanation || '',
      expectedSolveTimeSec: question.expectedSolveTimeSec,
      options: question.options.map((o: any) => ({ text: o.text, isCorrect: o.isCorrect })),
      source: question.source,
      difficulty: question.difficulty,
    });
  }

  function toggleTopic(topicId: string) {
    if (!draft) return;
    const next = draft.topicIds.includes(topicId)
      ? draft.topicIds.filter((id: string) => id !== topicId)
      : [...draft.topicIds, topicId];
    setDraft({ ...draft, topicIds: next });
  }

  async function saveEdit(questionId: string) {
    if (!draft) return;
    await api.patch(`/questions/${questionId}`, draft);
    setEditingId(null);
    setDraft(null);
    qc.invalidateQueries({ queryKey: ['review-queue'] });
  }

  const rows = (data || []).filter((q: any) => {
    if (!showOnlyFailing) return true;
    const r = rubricByQuestion[q.id];
    return r ? !r.valid : true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Teacher Review Queue</h2>
        <label className="flex items-center gap-2 rounded border bg-white px-3 py-2 text-sm shadow-sm">
          <input
            type="checkbox"
            checked={showOnlyFailing}
            onChange={(e) => setShowOnlyFailing(e.target.checked)}
          />
          Show only rubric-failing drafts
        </label>
      </div>
      {rows.map((q: any) => (
        <div key={q.id} className="rounded bg-white p-4 shadow">
          {editingId === q.id && draft ? (
            <div className="space-y-3">
              <textarea
                className="w-full rounded border p-2"
                value={draft.stem}
                onChange={(e) => setDraft({ ...draft, stem: e.target.value })}
              />
              <textarea
                className="w-full rounded border p-2"
                value={draft.explanation}
                onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                placeholder="Explanation"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="rounded border p-2"
                  type="number"
                  value={draft.difficulty}
                  onChange={(e) => setDraft({ ...draft, difficulty: Number(e.target.value) })}
                />
                <input
                  className="rounded border p-2"
                  type="number"
                  value={draft.expectedSolveTimeSec}
                  onChange={(e) => setDraft({ ...draft, expectedSolveTimeSec: Number(e.target.value) })}
                />
              </div>
              <div className="grid gap-2">
                {draft.options.map((opt: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 rounded border p-2">
                    <input
                      className="w-full rounded border p-1"
                      value={opt.text}
                      onChange={(e) => {
                        const options = [...draft.options];
                        options[idx] = { ...options[idx], text: e.target.value };
                        setDraft({ ...draft, options });
                      }}
                    />
                    <input
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={opt.isCorrect}
                      onChange={() => {
                        const options = draft.options.map((o: any, i: number) => ({
                          ...o,
                          isCorrect: i === idx,
                        }));
                        setDraft({ ...draft, options });
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {allTopics.map((topic: any) => (
                  <label key={topic.id} className="flex items-center gap-2 rounded border p-2">
                    <input
                      type="checkbox"
                      checked={draft.topicIds.includes(topic.id)}
                      onChange={() => toggleTopic(topic.id)}
                    />
                    {topic.name}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="rounded bg-brand px-3 py-1 text-white" onClick={() => saveEdit(q.id)}>
                  Save Draft
                </button>
                <button className="rounded bg-slate-600 px-3 py-1 text-white" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{q.stem}</p>
                  <p className="text-sm text-slate-600">Difficulty {q.difficulty} | Source {q.source}</p>
                </div>
                <div className="shrink-0 rounded border px-2 py-1 text-sm">
                  <p className="text-xs text-slate-500">Rubric score</p>
                  <p className={rubricByQuestion[q.id]?.valid ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                    {rubricByQuestion[q.id] ? rubricByQuestion[q.id].score : '--'}
                  </p>
                </div>
              </div>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {q.options.map((o: any) => (
                  <li key={o.id}>
                    {o.text} {o.isCorrect ? '(correct)' : ''}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded bg-amber-600 px-3 py-1 text-white" onClick={() => validateRubric(q.id)}>
                  Validate Rubric
                </button>
                <button className="rounded bg-slate-700 px-3 py-1 text-white" onClick={() => startEdit(q)}>
                  Edit
                </button>
                <button className="rounded bg-emerald-600 px-3 py-1 text-white" onClick={() => approve(q.id, false)}>
                  Approve
                </button>
                <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={() => approve(q.id, true)}>
                  Approve + Publish
                </button>
                <button className="rounded bg-rose-600 px-3 py-1 text-white" onClick={() => reject(q.id)}>
                  Reject
                </button>
              </div>
              {rubricByQuestion[q.id] && (
                <div className="mt-3 rounded border p-3 text-sm">
                  <p className={rubricByQuestion[q.id].valid ? 'text-emerald-700' : 'text-rose-700'}>
                    Rubric: {rubricByQuestion[q.id].valid ? 'PASS' : 'FAIL'} | Score {rubricByQuestion[q.id].score}
                  </p>
                  {!rubricByQuestion[q.id].valid && (
                    <ul className="mt-1 list-disc pl-5 text-rose-700">
                      {rubricByQuestion[q.id].issues.map((issue: string) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ))}
      {!rows?.length && <p className="text-sm text-slate-600">No draft questions matching filter.</p>}
    </div>
  );
}
