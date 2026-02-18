import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STUDENT' });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/auth/register', form);
    navigate('/login');
  }

  return (
    <div className="mx-auto mt-16 max-w-md rounded bg-white p-6 shadow">
      <h2 className="text-2xl font-semibold">Register</h2>
      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <input
          placeholder="Name"
          className="w-full rounded border p-2"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Email"
          className="w-full rounded border p-2"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          placeholder="Password"
          type="password"
          className="w-full rounded border p-2"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select
          className="w-full rounded border p-2"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="STUDENT">Student</option>
          <option value="TEACHER">Teacher</option>
        </select>
        <button className="w-full rounded bg-brand py-2 text-white">Register</button>
      </form>
      <Link className="mt-4 block text-sm text-brand" to="/login">
        Back to login
      </Link>
    </div>
  );
}
