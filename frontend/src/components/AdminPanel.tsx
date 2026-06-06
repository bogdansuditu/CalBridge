import React, { useState, useEffect } from 'react';
import { apiCall } from '../api';
import { UserPlus, Trash2, Users, Settings, X, Shield, User } from 'lucide-react';

interface UserData {
  id: string;
  username: string;
  role: string;
  storageLimit: number;
  createdAt: string;
  _count?: {
    calendars: number;
  };
}

interface AdminPanelProps {
  currentUser: { id: string; username: string; role: string };
}

export default function AdminPanel({ currentUser }: AdminPanelProps) {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('USER');
  const [storageLimit, setStorageLimit] = useState(0);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiCall('/api/users');
      setUsers(res.users);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenCreate = () => {
    setEditingUser(null);
    setUsername('');
    setPassword('');
    setRole('USER');
    setStorageLimit(0);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user: UserData) => {
    setEditingUser(user);
    setUsername(user.username);
    setPassword(''); // Leave blank if no change
    setRole(user.role);
    setStorageLimit(user.storageLimit);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload: any = { username, role, storageLimit };
    if (password || !editingUser) {
      payload.password = password;
    }

    try {
      if (editingUser) {
        await apiCall(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          json: payload
        });
      } else {
        await apiCall('/api/users', {
          method: 'POST',
          json: payload
        });
      }
      setIsFormOpen(false);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    }
  };

  const handleDelete = async (userId: string) => {
    if (userId === currentUser.id) {
      alert('You cannot delete your own admin account');
      return;
    }

    if (!confirm('Are you sure you want to delete this user? All their calendars and events will be deleted permanently.')) {
      return;
    }

    try {
      await apiCall(`/api/users/${userId}`, { method: 'DELETE' });
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <Users className="h-6 w-6 text-indigo-500" />
            User Administration
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-0.5">
            Manage user accounts, change storage limits, and create calendar spaces.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 cursor-pointer active:scale-98 transition-all"
        >
          <UserPlus className="h-4 w-4" />
          Add User Account
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-rose-500 text-sm">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* User Table Card */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-xs dark:border-zinc-800/50 dark:bg-zinc-900/50 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-zinc-500">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/80">
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">User</th>
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Role</th>
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Calendars</th>
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Storage Limit</th>
                  <th className="p-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Joined</th>
                  <th className="p-4 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/40">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-tr from-indigo-500/10 to-pink-500/10 text-indigo-500">
                          {user.role === 'ADMIN' ? <Shield className="h-4.5 w-4.5" /> : <User className="h-4.5 w-4.5" />}
                        </div>
                        <div>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200 block text-sm">{user.username}</span>
                          <span className="text-zinc-400 dark:text-zinc-500 text-xs truncate max-w-[150px] block">{user.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                        user.role === 'ADMIN' 
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' 
                          : 'bg-zinc-50 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-sm text-zinc-600 dark:text-zinc-300 font-medium">
                        {user._count?.calendars || 0}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-zinc-600 dark:text-zinc-300">
                      {user.storageLimit === 0 ? (
                        <span className="text-zinc-400 dark:text-zinc-500 italic">Unlimited</span>
                      ) : (
                        <span>{user.storageLimit} calendars</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-zinc-500">
                      {new Date(user.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          title="Edit user settings"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 cursor-pointer"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          disabled={user.id === currentUser.id}
                          title="Delete user account"
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Dialog Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                {editingUser ? 'Edit User Account' : 'Create New User Account'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. bogdan"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Password {editingUser && <span className="text-[10px] text-zinc-400 font-normal lowercase">(leave blank to keep unchanged)</span>}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  placeholder={editingUser ? '••••••••' : 'Password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Account Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden"
                  >
                    <option value="USER">Standard User</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Storage Limit
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 = Unlimited"
                    value={storageLimit}
                    onChange={(e) => setStorageLimit(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/40">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 cursor-pointer"
                >
                  {editingUser ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
