import React, { useState, useEffect } from 'react';
import { apiCall, setCurrentUser } from '../api';
import { X, Check } from 'lucide-react';
import { getPrimaryButtonClass, getPrimaryButtonStyle } from '../utils/theme';

interface UserData {
  id: string;
  username: string;
  role: string;
  accentColor?: string | null;
}

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserData;
  onUpdateUser: (user: UserData) => void;
}

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // purple
  '#f43f5e', // rose
  '#f59e0b', // amber
  '#06b6d4', // cyan
];

export default function UserSettingsModal({ isOpen, onClose, user, onUpdateUser }: UserSettingsModalProps) {
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState('');
  const [accentColor, setAccentColor] = useState<string | null>(user.accentColor || null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sync inputs with user prop on open
  useEffect(() => {
    if (isOpen) {
      setUsername(user.username);
      setPassword('');
      setAccentColor(user.accentColor || null);
      setError(null);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(false);

    const payload: any = { username, accentColor };
    if (password) {
      payload.password = password;
    }

    try {
      const res = await apiCall(`/api/users/${user.id}`, {
        method: 'PUT',
        json: payload,
      });

      const updatedUser = res.user;

      // Update local storage values
      setCurrentUser(updatedUser);
      if (updatedUser.accentColor) {
        localStorage.setItem('calbridge_accent_color', updatedUser.accentColor);
      } else {
        localStorage.removeItem('calbridge_accent_color');
      }

      onUpdateUser(updatedUser);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 animate-slide-up">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
            Edit User Account
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-50/50 dark:bg-rose-950/20 p-3.5 text-rose-500 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Username
            </label>
            <input
              type="text"
              required
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden focus:border-indigo-500"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Password <span className="text-[10px] text-zinc-400 font-normal lowercase">(leave blank to keep unchanged)</span>
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden focus:border-indigo-500"
            />
          </div>

          {/* Accent Color Picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Accent Color
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccentColor(c)}
                  style={{ backgroundColor: c }}
                  className={`h-7 w-7 rounded-full border border-black/10 dark:border-white/10 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 transition-transform ${
                    accentColor === c ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-zinc-950' : ''
                  }`}
                >
                  {accentColor === c && <Check className="h-4 w-4 text-white drop-shadow-sm" />}
                </button>
              ))}
              
              {/* Custom hex color input */}
              <input
                type="color"
                value={accentColor && accentColor.startsWith('#') ? accentColor : '#6366f1'}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-full border border-zinc-200 dark:border-zinc-800 bg-transparent p-0 overflow-hidden"
              />

              {/* Default gradient button */}
              <button
                type="button"
                onClick={() => setAccentColor(null)}
                className={`h-7 w-7 rounded-full bg-linear-to-tr from-indigo-500 to-pink-500 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 transition-transform ${
                  !accentColor ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-zinc-950' : ''
                }`}
                title="Default Gradient"
              >
                {!accentColor && <Check className="h-4 w-4 text-white drop-shadow-sm" />}
              </button>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/40">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={getPrimaryButtonStyle(accentColor)}
              className={`rounded-xl px-5 py-2 text-sm font-semibold transition-all ${getPrimaryButtonClass(accentColor)}`}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
