import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';

export function StudentDashboardPage() {
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/attempts/student/dashboard')).data,
  });

  const mastery = data?.mastery || [];
  const trends = data?.trends || [];
  const max = Math.max(1300, ...mastery.map((m: any) => m.rating));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Student Dashboard</h2>
      <section className="rounded bg-white p-4 shadow">
        <h3 className="mb-2 text-lg font-medium">Mastery by Topic</h3>
        <ul className="space-y-2">
          {mastery.map((m: any) => (
            <li key={m.topicId} className="rounded border p-2">
              <div className="flex justify-between text-sm">
                <span>{m.topicName}</span>
                <span>{Math.round(m.rating)}</span>
              </div>
              <div className="mt-1 h-2 rounded bg-slate-200">
                <div className="h-2 rounded bg-brand" style={{ width: `${Math.min(100, (m.rating / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded bg-white p-4 shadow">
        <h3 className="mb-2 text-lg font-medium">Rating Trend (last 30)</h3>
        <svg viewBox="0 0 300 100" className="h-28 w-full rounded bg-slate-50">
          {trends.length > 1 && (
            <polyline
              fill="none"
              stroke="#1f6feb"
              strokeWidth="2"
              points={trends
                .map((t: any, i: number) => `${(i / (trends.length - 1)) * 300},${100 - (t.rating / 1800) * 100}`)
                .join(' ')}
            />
          )}
        </svg>
      </section>
    </div>
  );
}
