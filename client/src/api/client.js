import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('af_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response && error.response.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

/** Extracts the server's error message from the standard envelope. */
export function apiError(err) {
  return err?.response?.data?.error?.message || err?.message || 'Request failed';
}

/** Extracts error details (e.g. currentHolder for allocation conflicts). */
export function apiErrorDetails(err) {
  return err?.response?.data?.error?.details || null;
}

export default api;
