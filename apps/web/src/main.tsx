import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { StudentDashboardPage } from './pages/student/StudentDashboardPage';
import { DiagnosticPage } from './pages/student/DiagnosticPage';
import { FlashcardsPage } from './pages/student/FlashcardsPage';
import { TeacherReviewQueuePage } from './pages/teacher/TeacherReviewQueuePage';
import { AdminPage } from './pages/admin/AdminPage';
import './styles/index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route
                path="/student/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['STUDENT']}>
                    <StudentDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/diagnostic"
                element={
                  <ProtectedRoute allowedRoles={['STUDENT']}>
                    <DiagnosticPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/student/flashcards"
                element={
                  <ProtectedRoute allowedRoles={['STUDENT']}>
                    <FlashcardsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/teacher/review-queue"
                element={
                  <ProtectedRoute allowedRoles={['TEACHER', 'ADMIN']}>
                    <TeacherReviewQueuePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminPage />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
