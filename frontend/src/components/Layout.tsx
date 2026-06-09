import React, { useState, useEffect } from 'react';
import { apiCall, removeToken, setCurrentUser } from '../api';
import { 
  Calendar, 
  Users, 
  LogOut, 
  Plus, 
  Check, 
  Globe, 
  Upload, 
  X, 
  Edit, 
  Trash, 
  RefreshCw,
  Settings,
  Sun,
  Moon,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Menu
} from 'lucide-react';
import { getPrimaryButtonClass, getPrimaryButtonStyle } from '../utils/theme';

interface CalendarData {
  id: string;
  name: string;
  color: string;
  isReadOnly: boolean;
  feedUrl: string | null;
  lastSyncedAt: string | null;
  syncToken: number;
}

interface LayoutProps {
  user: { id: string; username: string; role: string; accentColor?: string | null };
  calendars: CalendarData[];
  visibleCalendarIds: Set<string>;
  onToggleCalendar: (id: string) => void;
  onRefreshCalendars: () => void;
  activeTab: 'calendar' | 'admin';
  onChangeTab: (tab: 'calendar' | 'admin') => void;
  onOpenSettings: () => void;
  themeMode: 'light' | 'dark' | 'system';
  onToggleTheme: () => void;
  children: React.ReactNode;
}

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // purple
  '#f43f5e', // rose
  '#f59e0b', // amber
  '#06b6d4', // cyan
];

export default function Layout({
  user,
  calendars,
  visibleCalendarIds,
  onToggleCalendar,
  onRefreshCalendars,
  activeTab,
  onChangeTab,
  onOpenSettings,
  themeMode,
  onToggleTheme,
  children
}: LayoutProps) {
  // Sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showCollapsed = isSidebarCollapsed && !isMobile;

  // Calendar creation/edit states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<CalendarData | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [feedUrl, setFeedUrl] = useState('');
  const [isLocalImport, setIsLocalImport] = useState(false);
  const [importedIcsText, setImportedIcsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sync / Import states
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const handleLogout = () => {
    removeToken();
    setCurrentUser(null);
    window.location.reload();
  };

  const handleOpenCreate = () => {
    setEditingCalendar(null);
    setName('');
    setColor(PRESET_COLORS[0]);
    setIsReadOnly(false);
    setFeedUrl('');
    setIsLocalImport(false);
    setImportedIcsText('');
    setError(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (cal: CalendarData) => {
    setEditingCalendar(cal);
    setName(cal.name);
    setColor(cal.color);
    setIsReadOnly(cal.isReadOnly);
    setFeedUrl(cal.feedUrl || '');
    setError(null);
    setIsFormOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setImportedIcsText(text);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      name,
      color,
      isReadOnly: isReadOnly && !isLocalImport,
      feedUrl: isReadOnly && !isLocalImport ? feedUrl.trim() : null
    };

    try {
      let calendar;
      if (editingCalendar) {
        const res = await apiCall(`/api/calendars/${editingCalendar.id}`, {
          method: 'PUT',
          json: payload
        });
        calendar = res.calendar;
      } else {
        const res = await apiCall('/api/calendars', {
          method: 'POST',
          json: payload
        });
        calendar = res.calendar;
      }

      // Automatically import local events if selected
      if (!editingCalendar && isLocalImport && importedIcsText) {
        try {
          await apiCall(`/api/calendars/${calendar.id}/import`, {
            method: 'POST',
            json: { ics: importedIcsText }
          });
        } catch (importErr: any) {
          setError(`Calendar created, but event import failed: ${importErr.message || importErr}`);
          setSubmitting(false);
          onRefreshCalendars();
          return;
        }
      }

      setIsFormOpen(false);
      onRefreshCalendars();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCalendar = async (id: string) => {
    if (calendars.length <= 1) {
      alert('You must keep at least one calendar.');
      return;
    }
    if (!confirm('Are you sure you want to delete this calendar? All its events will be deleted permanently.')) {
      return;
    }

    try {
      await apiCall(`/api/calendars/${id}`, { method: 'DELETE' });
      onRefreshCalendars();
    } catch (err: any) {
      alert(err.message || 'Failed to delete calendar');
    }
  };

  const handleSyncRemote = async (cal: CalendarData) => {
    setSyncingId(cal.id);
    try {
      await apiCall(`/api/calendars/${cal.id}/sync`, { method: 'POST' });
      onRefreshCalendars();
    } catch (err: any) {
      alert(err.message || 'Failed to sync feed');
    } finally {
      setSyncingId(null);
    }
  };

  // Client-side local .ics file reader and importer
  const handleImportIcs = (calId: string) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingId(calId);
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      try {
        const res = await apiCall(`/api/calendars/${calId}/import`, {
          method: 'POST',
          json: { ics: text }
        });
        alert(`Success! Imported ${res.importedCount} events.`);
        onRefreshCalendars();
      } catch (err: any) {
        alert(err.message || 'Import failed');
      } finally {
        setImportingId(null);
        // Reset file input value
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex h-screen w-screen bg-linear-to-br from-slate-100 via-zinc-100 to-indigo-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-slate-950 text-zinc-800 dark:text-zinc-200 overflow-hidden font-sans relative">
      
      {/* Mobile Menu Backdrop */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Sidebar navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 flex flex-col h-full select-none bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-r border-zinc-200/80 dark:border-zinc-800/50 transition-all duration-300
        md:relative md:inset-auto md:z-auto md:bg-white/40 md:dark:bg-zinc-950/20 shrink-0
        ${showCollapsed ? 'md:w-16' : 'md:w-72'}
        ${isMobileMenuOpen ? 'w-72 translate-x-0' : 'w-72 -translate-x-full md:translate-x-0'}
      `}>
        
        {/* Logo Profile Header */}
        <div className={`p-4 border-b border-zinc-200/50 dark:border-zinc-800/40 flex ${showCollapsed ? 'flex-col gap-4 items-center' : 'items-center justify-between'}`}>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-tr from-indigo-500 to-pink-500 text-white">
              <Calendar className="h-4.5 w-4.5" />
            </div>
            {!showCollapsed && (
              <span className="font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">CalBridge</span>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={handleLogout}
              title="Log Out"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50/5 dark:hover:bg-rose-950/20 cursor-pointer transition-colors"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              title="Close Menu"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* User Badge Info */}
        <div className={`px-4 py-3 border-b border-zinc-200/50 dark:border-zinc-800/40 bg-zinc-50/20 dark:bg-zinc-900/10 flex ${showCollapsed ? 'justify-center' : 'items-center'}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-500 text-xs font-bold uppercase" title={`${user.username} (${user.role})`}>
              {user.username.substring(0, 2)}
            </div>
            {!showCollapsed && (
              <div className="truncate flex-1">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm block leading-none">{user.username}</span>
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block mt-0.5">{user.role}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tab Selectors (Calendar Client vs Admin Dashboard) */}
        <nav className={`p-2 border-b border-zinc-200/50 dark:border-zinc-800/40 space-y-2 flex flex-col items-center`}>
          <button
            onClick={() => onChangeTab('calendar')}
            style={activeTab === 'calendar' ? getPrimaryButtonStyle(user.accentColor) : {}}
            title="Calendar Client"
            className={`flex items-center justify-center rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
              showCollapsed 
                ? 'h-10 w-10 p-0' 
                : 'w-full gap-2.5 px-3 py-2'
            } ${
              activeTab === 'calendar'
                ? getPrimaryButtonClass(user.accentColor)
                : 'text-zinc-500 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/40'
            }`}
          >
            <Calendar className="h-4.5 w-4.5 shrink-0" />
            {!showCollapsed && <span>Calendar Client</span>}
          </button>

          {user.role === 'ADMIN' && (
            <button
              onClick={() => onChangeTab('admin')}
              style={activeTab === 'admin' ? getPrimaryButtonStyle(user.accentColor) : {}}
              title="Users Dashboard"
              className={`flex items-center justify-center rounded-xl text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                showCollapsed 
                  ? 'h-10 w-10 p-0' 
                  : 'w-full gap-2.5 px-3 py-2'
              } ${
                activeTab === 'admin'
                  ? getPrimaryButtonClass(user.accentColor)
                  : 'text-zinc-500 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/40'
              }`}
            >
              <Users className="h-4.5 w-4.5 shrink-0" />
              {!showCollapsed && <span>Users Dashboard</span>}
            </button>
          )}
        </nav>

        {/* Calendar Lists (Only active in Calendar View) */}
        {!showCollapsed && (
          activeTab === 'calendar' ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-6">
              
              {/* Header / Add Button */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">My Calendars</span>
                  <button
                    onClick={handleOpenCreate}
                    title="Create Calendar"
                    className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-600 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Calendars checklist */}
                <div className="space-y-1">
                  {calendars.map((cal) => {
                    const isChecked = visibleCalendarIds.has(cal.id);
                    return (
                      <div 
                        key={cal.id}
                        className="group flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/30 transition-colors"
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0 pr-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => onToggleCalendar(cal.id)}
                            className="rounded-sm border-zinc-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                          />
                          {/* Custom Color Dot */}
                          <div 
                            className="h-3 w-3 shrink-0 rounded-full border border-black/10 dark:border-white/10" 
                            style={{ backgroundColor: cal.color }}
                          />
                          <span className="text-sm font-semibold truncate text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                            {cal.name}
                            {cal.isReadOnly && <span title="Remote ICS subscription"><Globe className="h-3 w-3 text-zinc-400" /></span>}
                          </span>
                        </label>

                        {/* Hover Actions Menu */}
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1.5 shrink-0">
                          {cal.isReadOnly ? (
                            <button
                              onClick={() => handleSyncRemote(cal)}
                              disabled={syncingId === cal.id}
                              title="Sync Remote Feed"
                              className="p-1 text-zinc-400 hover:text-indigo-500 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={`h-3 w-3 ${syncingId === cal.id ? 'animate-spin' : ''}`} />
                            </button>
                          ) : (
                            <div className="relative flex items-center">
                              <label 
                                htmlFor={`import-file-${cal.id}`}
                                className="p-1 text-zinc-400 hover:text-indigo-500 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer block"
                                title="Import Local .ics File"
                              >
                                {importingId === cal.id ? (
                                  <RefreshCw className="h-3 w-3 animate-spin text-indigo-500" />
                                ) : (
                                  <Upload className="h-3 w-3" />
                                )}
                              </label>
                              <input
                                id={`import-file-${cal.id}`}
                                type="file"
                                accept=".ics"
                                disabled={importingId !== null}
                                onChange={handleImportIcs(cal.id)}
                                className="hidden"
                              />
                            </div>
                          )}
                          <button
                            onClick={() => handleOpenEdit(cal)}
                            title="Edit Calendar"
                            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                          >
                            <Edit className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteCalendar(cal.id)}
                            title="Delete Calendar"
                            className="p-1 text-zinc-400 hover:text-rose-600 rounded-md hover:bg-rose-50/50 dark:hover:bg-rose-950/20 cursor-pointer"
                          >
                            <Trash className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider select-none flex-1">
              Admin settings active. Click Calendar Client above to return.
            </div>
          )
        )}

        {/* Sidebar Footer Buttons */}
        <div className={`p-3 border-t border-zinc-200/50 dark:border-zinc-800/40 bg-zinc-50/10 dark:bg-zinc-900/10 flex ${showCollapsed ? 'flex-col items-center gap-3' : 'items-center justify-between gap-2'}`}>
          <button
            onClick={onOpenSettings}
            title="Account Settings"
            className={`${showCollapsed ? 'w-10 h-10' : 'flex-1'} flex items-center justify-center p-2 rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/40 transition-all cursor-pointer`}
          >
            <Settings className="h-5 w-5" />
          </button>
          
          <button
            onClick={onToggleTheme}
            title={`Theme: ${themeMode}`}
            className={`${showCollapsed ? 'w-10 h-10' : 'flex-1'} flex items-center justify-center p-2 rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/40 transition-all cursor-pointer`}
          >
            {themeMode === 'light' ? (
              <Sun className="h-5 w-5 text-amber-500" />
            ) : themeMode === 'dark' ? (
              <Moon className="h-5 w-5 text-indigo-400" />
            ) : (
              <Monitor className="h-5 w-5 text-teal-500" />
            )}
          </button>

          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={showCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            className={`hidden md:flex ${showCollapsed ? 'w-10 h-10' : 'flex-1'} items-center justify-center p-2 rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/40 transition-all cursor-pointer`}
          >
            {showCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </button>
        </div>
      </aside>

      {/* Main workspace frame */}
      <main className="flex-1 h-full overflow-hidden p-2 md:p-4 flex flex-col">
        <div className="h-full w-full rounded-3xl border border-zinc-200/80 bg-white/70 shadow-2xl dark:border-zinc-800/80 dark:bg-zinc-900/30 backdrop-blur-xl overflow-hidden flex flex-col">
          
          {/* Mobile Header Bar */}
          <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-200/50 dark:border-zinc-800/40 bg-white/50 dark:bg-zinc-950/20 select-none">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 cursor-pointer"
              title="Open Menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <span className="font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 text-base">CalBridge</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-500 text-xs font-bold uppercase select-none">
              {user.username.substring(0, 2)}
            </div>
          </div>

          <div className="flex-1 overflow-hidden h-full">
            {children}
          </div>
        </div>
      </main>

      {/* Calendar Form Popup Dialog */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                {editingCalendar ? 'Edit Calendar settings' : 'Create New Calendar'}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5 text-rose-500 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Calendar Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Work Events"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Color Preset Dot Picker */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Calendar Color
                </label>
                <div className="flex items-center gap-3">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      style={{ backgroundColor: c }}
                      className={`h-7 w-7 rounded-full border border-black/10 dark:border-white/10 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 transition-transform ${
                        color === c ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-zinc-950' : ''
                      }`}
                    >
                      {color === c && <Check className="h-4 w-4 text-white drop-shadow-sm" />}
                    </button>
                  ))}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded-full border border-zinc-200 dark:border-zinc-800 bg-transparent p-0 overflow-hidden"
                  />
                </div>
              </div>

              {/* Subscription & Local Import Options */}
              {!editingCalendar && (
                <div className="space-y-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/40">
                  
                  {/* Option 1: Remote subscription */}
                  <div className="flex items-start justify-between">
                    <div>
                      <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300 block">
                        Remote Subscription Feed
                      </label>
                      <span className="text-[11px] text-zinc-400 block leading-tight mt-0.5">
                        Fetch read-only events from an external .ics HTTPS URL.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isReadOnly}
                      onChange={(e) => {
                        setIsReadOnly(e.target.checked);
                        if (e.target.checked) setIsLocalImport(false);
                      }}
                      className="rounded-sm border-zinc-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 mt-1"
                    />
                  </div>

                  {/* Option 2: Local import */}
                  <div className="flex items-start justify-between">
                    <div>
                      <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300 block">
                        Import Events from Local File
                      </label>
                      <span className="text-[11px] text-zinc-400 block leading-tight mt-0.5">
                        Seed this new calendar with events from a local .ics file.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isLocalImport}
                      onChange={(e) => {
                        setIsLocalImport(e.target.checked);
                        if (e.target.checked) setIsReadOnly(false);
                      }}
                      className="rounded-sm border-zinc-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 mt-1"
                    />
                  </div>
                </div>
              )}

              {/* Feed URL input */}
              {isReadOnly && !editingCalendar && (
                <div className="animate-fade-in">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Feed URL (HTTPS .ics)
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://example.com/calendar.ics"
                    value={feedUrl}
                    onChange={(e) => setFeedUrl(e.target.value)}
                    className="w-full rounded-xl border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden focus:border-indigo-500"
                  />
                </div>
              )}

              {/* Local File selector input */}
              {isLocalImport && !editingCalendar && (
                <div className="animate-fade-in">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Select .ics Calendar File
                  </label>
                  <input
                    type="file"
                    required
                    accept=".ics"
                    onChange={handleFileChange}
                    className="w-full text-xs text-zinc-500 dark:text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 dark:file:bg-indigo-950/40 dark:file:text-indigo-400 file:cursor-pointer"
                  />
                </div>
              )}

              {editingCalendar && (() => {
                const caldavUrl = `${window.location.origin}/caldav/users/${user.username}/calendars/${editingCalendar.id}/`;
                const subscriptionUrl = `${window.location.origin}/api/calendars/feed/${editingCalendar.id}.ics`;

                return (
                  <div className="pt-4 border-t border-zinc-150 dark:border-zinc-800/40 space-y-4 text-left">
                    {/* CalDAV Sync URL */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                        CalDAV Sync URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={caldavUrl}
                          className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs text-zinc-650 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-350 outline-hidden select-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(caldavUrl);
                            alert('CalDAV Sync URL copied to clipboard!');
                          }}
                          className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 cursor-pointer shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block leading-tight mt-1">
                        Use this URL in compatible clients like Thunderbird or Apple Calendar on Mac.
                      </span>
                    </div>

                    {/* WebDAV ICS Feed URL */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                        iOS / Apple Calendar Subscription Feed (WebDAV .ics)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={subscriptionUrl}
                          className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs text-zinc-650 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-350 outline-hidden select-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(subscriptionUrl);
                            alert('Subscription feed URL copied to clipboard!');
                          }}
                          className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 cursor-pointer shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block leading-tight mt-1">
                        For iPhone: Go to Settings &gt; Calendar &gt; Accounts &gt; Add Account &gt; Other &gt; Add Subscribed Calendar and paste this URL.
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/40">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  disabled={submitting}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={getPrimaryButtonStyle(user.accentColor)}
                  className={`rounded-xl ${getPrimaryButtonClass(user.accentColor)} px-4 py-2 text-sm font-semibold disabled:opacity-50`}
                >
                  {submitting ? 'Saving...' : editingCalendar ? 'Save Changes' : 'Create Calendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
