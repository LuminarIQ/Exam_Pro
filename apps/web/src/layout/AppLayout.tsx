import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const allItems = [
  { to: '/student/dashboard', label: 'Student Dashboard', roles: ['STUDENT'] },
  { to: '/student/diagnostic', label: 'Diagnostic', roles: ['STUDENT'] },
  { to: '/student/flashcards', label: 'Flashcards', roles: ['STUDENT'] },
  { to: '/teacher/review-queue', label: 'Review Queue', roles: ['TEACHER', 'ADMIN'] },
  { to: '/admin', label: 'Admin', roles: ['ADMIN'] },
];

export function AppLayout() {
  const { role, logout } = useAuth();
  const nav = allItems.filter((i) => role && i.roles.includes(role));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex max-w-7xl">
        <aside className="sticky top-0 h-screen w-64 bg-ink p-5 text-white">
          <h1 className="text-xl font-semibold">Adaptive Tutor</h1>
          <p className="mt-2 text-sm text-slate-300">Role: {role}</p>
          <nav className="mt-6 flex flex-col gap-2">
            {nav.map((item) => (
              <Link key={item.to} to={item.to} className="rounded px-3 py-2 hover:bg-slate-700">
                {item.label}
              </Link>
            ))}
          </nav>
          <button className="mt-6 rounded bg-slate-700 px-3 py-2" onClick={logout}>
            Logout
          </button>
        </aside>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
