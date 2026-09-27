import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('af_access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.data.user))
      .catch(() => {
        localStorage.removeItem('af_access_token');
        localStorage.removeItem('af_refresh_token');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem('af_access_token');
      localStorage.removeItem('af_refresh_token');
      setUser(null);
    });
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('af_access_token', res.data.data.accessToken);
    localStorage.setItem('af_refresh_token', res.data.data.refreshToken);
    setUser(res.data.data.user);
    return res.data.data.user;
  }, []);

  const signup = useCallback(async (payload) => {
    const res = await api.post('/auth/signup', payload);
    localStorage.setItem('af_access_token', res.data.data.accessToken);
    localStorage.setItem('af_refresh_token', res.data.data.refreshToken);
    setUser(res.data.data.user);
    return res.data.data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('af_access_token');
    localStorage.removeItem('af_refresh_token');
    setUser(null);
  }, []);

  const value = useMemo(() => {
    const role = user?.role || null;
    // Normalize: expose user.id everywhere (login returns {id,...}; /auth/me returns a _id doc)
    const normalized = user ? { ...user, id: user.id || user._id } : null;
    return {
      user: normalized,
      loading,
      login,
      signup,
      logout,
      role,
      isAdmin: role === 'admin',
      isManager: role === 'assetManager' || role === 'admin',
      isDeptHead: role === 'departmentHead',
      isEmployee: role === 'employee',
    };
  }, [user, loading, login, signup, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
