import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  withCredentials: import.meta.env.VITE_AUTH_MODE === 'cookie',
});

let isRefreshing = false;
let pendingRequests: Array<(token: string | null) => void> = [];

function onRefreshed(token: string | null) {
  pendingRequests.forEach((cb) => cb(token));
  pendingRequests = [];
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['x-tenant-id'] = localStorage.getItem('tenantId') || 'public';
  const csrfToken = localStorage.getItem('csrfToken');
  if (csrfToken) config.headers['x-csrf-token'] = csrfToken;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as any;
    if (error?.response?.status !== 401 || originalRequest?._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingRequests.push((token) => {
          if (!token) return reject(error);
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(api(originalRequest));
        });
      });
    }

    isRefreshing = true;
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      const cookieMode = import.meta.env.VITE_AUTH_MODE === 'cookie';
      if (!cookieMode && !refreshToken) throw error;

      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/auth/refresh`,
        cookieMode ? {} : { refreshToken },
        {
          headers: {
            'x-tenant-id': localStorage.getItem('tenantId') || 'public',
            ...(localStorage.getItem('csrfToken')
              ? { 'x-csrf-token': localStorage.getItem('csrfToken') as string }
              : {}),
          },
          withCredentials: cookieMode,
        },
      );

      localStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
      if (data.csrfToken) localStorage.setItem('csrfToken', data.csrfToken);
      onRefreshed(data.accessToken);
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(originalRequest);
    } catch (refreshErr) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      onRefreshed(null);
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
