import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { AppRole } from './types';

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: JSX.Element;
  allowedRoles?: AppRole[];
}) {
  const { accessToken, role } = useAuth();

  if (!accessToken) return <Navigate to="/login" replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) return <Navigate to="/login" replace />;

  return children;
}
