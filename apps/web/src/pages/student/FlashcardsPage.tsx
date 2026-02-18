import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import api from '../../api/client';

export function FlashcardsPage() {
  const qc = useQueryClient();
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  const dueQuery = useQuery({
    queryKey: ['flashcards-due'],
    queryFn: async () => (await api.get('/flashcards/due')).data,
  });

  const cards = dueQuery.data || [];
  const nextCard = useMemo(() => cards[0], [cards]);

  async function reviewCard(flashcardId: string, quality: number) {
    try {
      setError('');
      await api.post(`/flashcards/${flashcardId}/review`, { quality });
      qc.invalidateQueries({ queryKey: ['flashcards-due'] });
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Unable to submit flashcard review');
    }
  }

  if (dueQuery.isLoading) {
    return <div className="rounded bg-white p-4 shadow">Loading flashcards...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Flashcards</h2>
      {error && <div className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>}
      {!nextCard && <div className="rounded bg-white p-4 shadow text-slate-600">No due flashcards right now.</div>}
      {nextCard && (
        <div className="rounded bg-white p-4 shadow">
          <p className="text-sm text-slate-500">Topic: {nextCard.topic?.name || nextCard.topicId}</p>
          <p className="mt-2 text-lg font-medium">{nextCard.prompt}</p>
          <button
            className="mt-3 rounded bg-slate-800 px-3 py-2 text-white"
            onClick={() => setRevealed({ ...revealed, [nextCard.id]: !revealed[nextCard.id] })}
          >
            {revealed[nextCard.id] ? 'Hide Answer' : 'Reveal Answer'}
          </button>
          {revealed[nextCard.id] && (
            <div className="mt-3 space-y-2 rounded bg-slate-50 p-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Explanation</p>
                <p className="text-sm text-slate-700">
                  {nextCard.explanation ||
                    'Use the prompt context and concept rules to verify why this value is correct.'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Correct Value</p>
                <p className="text-sm font-medium text-slate-900">{nextCard.correctValue || nextCard.answer}</p>
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded bg-rose-600 px-3 py-2 text-white" onClick={() => reviewCard(nextCard.id, 2)}>
              Hard
            </button>
            <button className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => reviewCard(nextCard.id, 4)}>
              Good
            </button>
            <button className="rounded bg-emerald-600 px-3 py-2 text-white" onClick={() => reviewCard(nextCard.id, 5)}>
              Easy
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Retention estimate: {Math.round((nextCard.retentionEstimate || 0) * 100)}%
          </p>
        </div>
      )}
      {!!cards.length && (
        <div className="rounded bg-white p-4 shadow text-sm text-slate-600">Due cards in queue: {cards.length}</div>
      )}
    </div>
  );
}
