import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const [email, setEmail] = useState('student@demo.com');
  const [password, setPassword] = useState('Password123!');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password, captchaToken: captchaToken || undefined });
      login(data.accessToken, data.refreshToken, data.csrfToken);
      const role = JSON.parse(atob(data.accessToken.split('.')[1])).role;
      if (role === 'STUDENT') navigate('/student/dashboard');
      if (role === 'TEACHER') navigate('/teacher/review-queue');
      if (role === 'ADMIN') navigate('/admin');
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || 'Login failed';
      setError(msg);
      if (String(msg).toLowerCase().includes('captcha')) {
        setCaptchaRequired(true);
      }
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-md rounded bg-white p-6 shadow">
      <h2 className="text-2xl font-semibold">Login</h2>
      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <input className="w-full rounded border p-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          className="w-full rounded border p-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {captchaRequired && (
          <input
            className="w-full rounded border p-2"
            placeholder="Captcha token"
            value={captchaToken}
            onChange={(e) => setCaptchaToken(e.target.value)}
          />
        )}
        {error && <p className="text-red-600">{error}</p>}
        <button className="w-full rounded bg-brand py-2 text-white" type="submit">
          Login
        </button>
      </form>
      <Link className="mt-4 block text-sm text-brand" to="/register">
        Need an account? Register
      </Link>
    </div>
  );
}
