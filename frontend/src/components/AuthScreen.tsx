import React, { useState, useEffect } from 'react';
import { apiCall, setToken, setCurrentUser } from '../api';
import { Calendar, Lock, User, AlertCircle, ShieldAlert } from 'lucide-react';
import { getPrimaryButtonClass, getPrimaryButtonStyle } from '../utils/theme';

interface AuthScreenProps {
  onSuccess: (user: { id: string; username: string; role: string; accentColor?: string | null }) => void;
}

export default function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accentColor, setAccentColor] = useState<string | null>(null);

  // Check setup status and read accent color on load
  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await apiCall('/api/auth/setup-status');
        if (res.setupRequired) {
          setIsSetupMode(true);
        }
      } catch (err) {
        console.error('Failed to fetch setup status:', err);
      }
    }
    checkSetup();

    const storedAccent = localStorage.getItem('calbridge_accent_color');
    if (storedAccent) {
      setAccentColor(storedAccent);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isSetupMode && password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      if (isSetupMode) {
        const res = await apiCall('/api/auth/setup', {
          method: 'POST',
          json: { username, password }
        });
        setToken(res.token);
        setCurrentUser(res.user);
        onSuccess(res.user);
      } else {
        const res = await apiCall('/api/auth/login', {
          method: 'POST',
          json: { username, password }
        });
        setToken(res.token);
        setCurrentUser(res.user);
        onSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-radial from-slate-100 via-zinc-50 to-indigo-100 dark:from-slate-900 dark:via-zinc-950 dark:to-black p-4 text-zinc-800 dark:text-white overflow-hidden">
      
      {/* Background Animated blobs */}
      <div className="absolute top-1/4 left-1/4 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-indigo-500/10 dark:bg-indigo-600/20 blur-[120px] animate-pulse duration-[6s] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 h-[350px] w-[350px] translate-x-1/2 rounded-full bg-pink-500/10 dark:bg-pink-600/20 blur-[130px] animate-pulse duration-[8s] pointer-events-none"></div>
      
      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo Card */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-tr from-indigo-500 to-pink-500 shadow-lg shadow-indigo-500/30 mb-3 animate-bounce duration-[3s]">
            <Calendar className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-linear-to-r from-zinc-800 via-slate-700 to-zinc-900 bg-clip-text text-transparent dark:from-indigo-200 dark:via-slate-100 dark:to-pink-200">
            CalBridge
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isSetupMode ? 'Create Global Admin Account' : 'Self-Hosted Calendar & CalDAV Server'}
          </p>
        </div>

        {/* Auth Box */}
        <div className="rounded-3xl border border-zinc-200/80 bg-white/70 dark:border-white/10 dark:bg-white/5 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300">
          {isSetupMode && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-amber-800 dark:text-amber-200/90 text-sm">
              <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400" />
              <div>
                <span className="font-semibold text-amber-700 dark:text-amber-300 block mb-0.5">First-Run Setup</span>
                No users found in database. The first user created will be granted global administrator permissions.
              </div>
            </div>
          )}

          {error && (
            <div className="mb-5 flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-rose-800 dark:text-rose-200 text-sm">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-500 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                Username
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400 dark:text-zinc-500 pointer-events-none">
                  <User className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="e.g. admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-black/25 py-3 pl-10 pr-4 text-sm text-zinc-800 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-hidden focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400 dark:text-zinc-500 pointer-events-none">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-black/25 py-3 pl-10 pr-4 text-sm text-zinc-800 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-hidden focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
            </div>

            {isSetupMode && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400 dark:text-zinc-500 pointer-events-none">
                    <Lock className="h-4 w-4" />
                  </span>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-black/25 py-3 pl-10 pr-4 text-sm text-zinc-800 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-hidden focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={getPrimaryButtonStyle(accentColor)}
              className={`w-full rounded-2xl ${getPrimaryButtonClass(accentColor)} py-3.5 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 active:scale-[0.98] outline-hidden focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black disabled:opacity-50 transition-all`}
            >
              {loading ? 'Processing...' : isSetupMode ? 'Complete Setup & Enter' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Small security note */}
        <p className="text-center text-xs text-zinc-500 mt-6 font-medium">
          CalDAV endpoints are secured via HTTP Basic Auth. Keep your credentials safe.
        </p>
      </div>
    </div>
  );
}
