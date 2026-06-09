import { useState, useEffect } from 'react';
import { apiCall, getCurrentUser, setCurrentUser } from './api';
import AuthScreen from './components/AuthScreen';
import Layout from './components/Layout';
import CalendarGrid from './components/CalendarGrid';
import AdminPanel from './components/AdminPanel';
import EventModal from './components/EventModal';
import UserSettingsModal from './components/UserSettingsModal';
import { applyTheme, ThemeMode } from './utils/theme';

interface CalendarData {
  id: string;
  name: string;
  color: string;
  isReadOnly: boolean;
  feedUrl: string | null;
  lastSyncedAt: string | null;
  syncToken: number;
}

export interface CalendarItemData {
  id?: string;
  uid?: string;
  summary: string;
  description: string | null;
  location?: string | null;
  dtStart: string;
  dtEnd?: string;
  isAllDay?: boolean;
  rrule?: string | null;
  status?: string;
  completedAt?: string | null;
  due?: string | null;
  priority?: number;
  calendarId: string;
  isTodo?: boolean;
}

export default function App() {
  const [user, setUser] = useState<{ id: string; username: string; role: string; accentColor?: string | null } | null>(null);
  const [calendars, setCalendars] = useState<CalendarData[]>([]);
  const [events, setEvents] = useState<CalendarItemData[]>([]);
  const [todos, setTodos] = useState<CalendarItemData[]>([]);
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'calendar' | 'admin'>('calendar');
  const [loading, setLoading] = useState(true);

  // Theme state
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('calbridge_theme');
    return (saved as any) || 'system';
  });

  // Settings Modal state
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);

  // Event Modal trigger states
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarItemData | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Apply theme when themeMode changes
  useEffect(() => {
    applyTheme(themeMode);
    localStorage.setItem('calbridge_theme', themeMode);
  }, [themeMode]);

  // System theme change listener
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (themeMode === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  // Authenticate user session on boot and sync fresh data
  useEffect(() => {
    const activeUser = getCurrentUser();
    if (activeUser) {
      setUser(activeUser);
      // Fetch fresh details (like accentColor)
      apiCall('/api/auth/me')
        .then(res => {
          if (res.user) {
            setUser(res.user);
            setCurrentUser(res.user);
            if (res.user.accentColor) {
              localStorage.setItem('calbridge_accent_color', res.user.accentColor);
            } else {
              localStorage.removeItem('calbridge_accent_color');
            }
          }
        })
        .catch(err => {
          console.error('Failed to sync current user profile:', err);
        });
    }
    setLoading(false);
  }, []);

  const handleUpdateUser = (updatedUser: { id: string; username: string; role: string; accentColor?: string | null }) => {
    setUser(updatedUser);
  };

  const handleCycleTheme = () => {
    setThemeMode(prev => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'system';
      return 'light';
    });
  };

  // Fetch calendars and events once user is authenticated
  const loadData = async () => {
    if (!user) return;
    try {
      // Fetch calendars
      const calRes = await apiCall('/api/calendars');
      setCalendars(calRes.calendars);
      
      // Auto-enable newly discovered calendars
      setVisibleCalendarIds(prev => {
        const next = new Set(prev);
        calRes.calendars.forEach((c: CalendarData) => {
          if (!prev.has(c.id) && prev.size === 0) {
            next.add(c.id);
          } else if (prev.size > 0 && !prev.has(c.id)) {
            // Keep existing selections, but if it is a first load, enable all
            // Or if they added a new calendar, auto-enable it
            next.add(c.id);
          }
        });
        return next;
      });

      // Fetch events
      const evtRes = await apiCall('/api/events');
      setEvents(evtRes.events);

      // Fetch todos
      const todoRes = await apiCall('/api/todos');
      setTodos(todoRes.todos.map((t: any) => ({ ...t, isTodo: true })));
    } catch (error) {
      console.error('[Dashboard] Data fetch error:', error);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  // Poll for calendar syncToken changes every 10 seconds to auto-refresh the UI
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      try {
        const calRes = await apiCall('/api/calendars');
        
        // Check if any calendar's syncToken has changed
        let hasChanges = false;
        const currentCalMap = new Map(calendars.map(c => [c.id, c]));

        for (const newCal of calRes.calendars) {
          const currentCal = currentCalMap.get(newCal.id);
          if (!currentCal || currentCal.syncToken !== newCal.syncToken) {
            hasChanges = true;
            break;
          }
        }

        if (hasChanges) {
          console.log('[Sync] Database update detected, auto-refreshing UI...');
          setCalendars(calRes.calendars);
          
          const evtRes = await apiCall('/api/events');
          setEvents(evtRes.events);

          const todoRes = await apiCall('/api/todos');
          setTodos(todoRes.todos.map((t: any) => ({ ...t, isTodo: true })));
        }
      } catch (err) {
        console.error('[Sync] Error checking for calendar updates:', err);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [user, calendars]);

  const handleLoginSuccess = (authenticatedUser: { id: string; username: string; role: string; accentColor?: string | null }) => {
    setUser(authenticatedUser);
    if (authenticatedUser.accentColor) {
      localStorage.setItem('calbridge_accent_color', authenticatedUser.accentColor);
    } else {
      localStorage.removeItem('calbridge_accent_color');
    }
  };

  const handleToggleCalendar = (id: string) => {
    setVisibleCalendarIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleOpenCreateModal = (date?: Date) => {
    setSelectedEvent(null);
    setSelectedDate(date);
    setIsEventModalOpen(true);
  };

  const handleOpenEditModal = (event: CalendarItemData) => {
    setSelectedEvent(event);
    setSelectedDate(undefined);
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = () => {
    setIsEventModalOpen(false);
    loadData();
  };

  const handleEventUpdateTimes = async (eventId: string, newStart: Date, newEnd: Date) => {
    try {
      await apiCall(`/api/events/${eventId}`, {
        method: 'PUT',
        json: {
          dtStart: newStart.toISOString(),
          dtEnd: newEnd.toISOString()
        }
      });
      loadData();
    } catch (error: any) {
      console.error('[Dashboard] Event drag update error:', error);
      alert(error.message || 'Failed to update event times');
    }
  };

  const handleToggleTodoComplete = async (todoId: string) => {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;

    const newStatus = todo.status === 'COMPLETED' ? 'NEEDS-ACTION' : 'COMPLETED';
    const completedAt = newStatus === 'COMPLETED' ? new Date().toISOString() : null;

    // Optimistic UI update
    setTodos(prev => prev.map(t => t.id === todoId ? { ...t, status: newStatus, completedAt } : t));

    try {
      await apiCall(`/api/todos/${todoId}`, {
        method: 'PUT',
        json: { status: newStatus, completedAt }
      });
      loadData();
    } catch (err) {
      console.error('[App] Failed to toggle todo complete status:', err);
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-900 text-zinc-400">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm font-semibold">Initializing CalBridge...</p>
        </div>
      </div>
    );
  }

  // Not logged in: Show Setup/Login screen
  if (!user) {
    return <AuthScreen onSuccess={handleLoginSuccess} />;
  }

  // Logged in: Show Dashboard Layout
  return (
    <Layout
      user={user}
      calendars={calendars}
      visibleCalendarIds={visibleCalendarIds}
      onToggleCalendar={handleToggleCalendar}
      onRefreshCalendars={loadData}
      activeTab={activeTab}
      onChangeTab={setActiveTab}
      onOpenSettings={() => setIsUserSettingsOpen(true)}
      themeMode={themeMode}
      onToggleTheme={handleCycleTheme}
    >
      {activeTab === 'calendar' ? (
        <CalendarGrid
          events={events}
          todos={todos}
          calendars={calendars}
          visibleCalendarIds={visibleCalendarIds}
          onEventClick={handleOpenEditModal}
          onSlotClick={handleOpenCreateModal}
          onEventUpdate={handleEventUpdateTimes}
          onToggleTodoComplete={handleToggleTodoComplete}
          user={user}
        />
      ) : (
        <AdminPanel currentUser={user} />
      )}

      {/* Shared Event Creation/Editor Modal */}
      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        onSave={handleSaveEvent}
        event={selectedEvent}
        calendars={calendars}
        selectedDate={selectedDate}
        user={user}
      />

      {/* User settings profile modal */}
      <UserSettingsModal
        isOpen={isUserSettingsOpen}
        onClose={() => setIsUserSettingsOpen(false)}
        user={user}
        onUpdateUser={handleUpdateUser}
      />
    </Layout>
  );
}
