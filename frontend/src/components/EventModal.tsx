import React, { useState, useEffect } from 'react';
import { apiCall } from '../api';
import { X, Calendar, Clock, MapPin, AlignLeft, RefreshCw, Trash2 } from 'lucide-react';
import { getPrimaryButtonClass, getPrimaryButtonStyle } from '../utils/theme';
import DatePicker from './DatePicker';

interface CalendarData {
  id: string;
  name: string;
  color: string;
  isReadOnly: boolean;
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

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  event: CalendarItemData | null; // Null means create mode
  calendars: CalendarData[];
  selectedDate?: Date; // Pre-filled date when clicking on a grid slot
  user?: { accentColor?: string | null };
}

export default function EventModal({ isOpen, onClose, onSave, event, calendars, selectedDate, user }: EventModalProps) {
  const [itemType, setItemType] = useState<'event' | 'reminder'>('event');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [dtStart, setDtStart] = useState('');
  const [dtEnd, setDtEnd] = useState('');
  const [isAllDay, setIsAllDay] = useState(false);
  const [rrule, setRrule] = useState('');
  const [calendarId, setCalendarId] = useState('');
  const [priority, setPriority] = useState<number>(0);
  const [status, setStatus] = useState<string>('NEEDS-ACTION');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [repeatEndType, setRepeatEndType] = useState<'never' | 'date'>('never');
  const [repeatUntilDate, setRepeatUntilDate] = useState('');
  const [hasChangedEndDate, setHasChangedEndDate] = useState(false);

  // Filter out read-only calendars for selection
  const writableCalendars = calendars.filter(c => !c.isReadOnly);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setLoading(false); // Reset loading when opened
      if (event) {
        // Edit mode
        const isReminder = !!(event.isTodo || event.status !== undefined);
        setItemType(isReminder ? 'reminder' : 'event');
        setSummary(event.summary || '');
        setDescription(event.description || '');
        setLocation(event.location || '');
        setIsAllDay(!!event.isAllDay);
        setCalendarId(event.calendarId);
        setPriority(event.priority || 0);
        setStatus(event.status || 'NEEDS-ACTION');

        let baseRrule = event.rrule || '';
        let endType: 'never' | 'date' = 'never';
        let untilDate = '';

        if (baseRrule.includes('UNTIL=')) {
          endType = 'date';
          const match = /UNTIL=([^;]+)/.exec(baseRrule);
          if (match) {
            const rawUntil = match[1];
            if (rawUntil.length >= 8) {
              const y = rawUntil.substring(0, 4);
              const m = rawUntil.substring(4, 6);
              const d = rawUntil.substring(6, 8);
              untilDate = `${y}-${m}-${d}`;
            }
          }
          baseRrule = baseRrule.replace(/;?UNTIL=[^;]+/, '');
        }

        setRrule(baseRrule);
        setRepeatEndType(endType);
        setRepeatUntilDate(untilDate);

        const startVal = isReminder ? (event.due || event.dtStart) : event.dtStart;
        const start = new Date(startVal);
        setDtStart(formatDateForInput(start, !!event.isAllDay));

        if (!isReminder && event.dtEnd) {
          const end = new Date(event.dtEnd);
          setDtEnd(formatDateForInput(end, !!event.isAllDay));
          setHasChangedEndDate(true);
        } else {
          const fallbackEnd = new Date(start.getTime());
          fallbackEnd.setHours(fallbackEnd.getHours() + 1);
          setDtEnd(formatDateForInput(fallbackEnd, !!event.isAllDay));
          setHasChangedEndDate(false);
        }
      } else {
        // Create mode
        setItemType('event');
        setSummary('');
        setDescription('');
        setLocation('');
        setIsAllDay(false);
        setRrule('');
        setRepeatEndType('never');
        setRepeatUntilDate('');
        setPriority(0);
        setStatus('NEEDS-ACTION');
        setHasChangedEndDate(false);
        
        // Select first writable calendar by default
        if (writableCalendars.length > 0) {
          setCalendarId(writableCalendars[0].id);
        }

        const start = selectedDate ? new Date(selectedDate) : new Date();
        // Default start to next hour
        if (!selectedDate) {
          start.setMinutes(0, 0, 0);
          start.setHours(start.getHours() + 1);
        }
        
        const end = new Date(start.getTime());
        end.setHours(end.getHours() + 1);

        setDtStart(formatDateForInput(start, false));
        setDtEnd(formatDateForInput(end, false));
      }
    }
  }, [isOpen, event, calendars, selectedDate]);

  // Helper to format Date objects to datetime-local or date strings
  const formatDateForInput = (d: Date, allDay: boolean): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const dateStr = pad(d.getDate());
    
    if (allDay) {
      return `${y}-${m}-${dateStr}`;
    } else {
      const hh = pad(d.getHours());
      const mm = pad(d.getMinutes());
      return `${y}-${m}-${dateStr}T${hh}:${mm}`;
    }
  };

  const handleStartChange = (newStart: string) => {
    setDtStart(newStart);
    if (!hasChangedEndDate && itemType === 'event') {
      try {
        const startD = new Date(newStart);
        if (!isNaN(startD.getTime())) {
          const endD = new Date(startD.getTime());
          if (isAllDay) {
            endD.setDate(endD.getDate() + 1);
          } else {
            endD.setHours(endD.getHours() + 1);
          }
          setDtEnd(formatDateForInput(endD, isAllDay));
        }
      } catch (e) {
        // ignore
      }
    }
  };

  const handleEndChange = (newEnd: string) => {
    setDtEnd(newEnd);
    setHasChangedEndDate(true);
  };

  const handleAllDayToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setIsAllDay(checked);

    // Convert dates accordingly
    try {
      if (checked) {
        // Datetime-local -> Date only (split at T)
        setDtStart(dtStart.split('T')[0]);
        setDtEnd(dtEnd.split('T')[0]);
      } else {
        // Date only -> Datetime-local (append 09:00 / 10:00)
        setDtStart(`${dtStart}T09:00`);
        setDtEnd(`${dtEnd}T10:00`);
      }
    } catch {
      // Fallback
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!calendarId) {
      setError('Please select a calendar');
      setLoading(false);
      return;
    }

    let startObj: Date;
    if (isAllDay) {
      startObj = new Date(dtStart + 'T00:00:00Z');
    } else {
      startObj = new Date(dtStart);
    }

    if (isNaN(startObj.getTime())) {
      setError('Invalid date/time selected');
      setLoading(false);
      return;
    }

    if (itemType === 'reminder') {
      const payload = {
        calendarId,
        summary: summary.trim() || 'Untitled Reminder',
        description: description.trim() || null,
        status,
        due: startObj.toISOString(),
        dtStart: startObj.toISOString(),
        priority
      };

      try {
        if (event && event.id && event.isTodo) {
          // Edit Mode Todo
          await apiCall(`/api/todos/${event.id}`, {
            method: 'PUT',
            json: payload
          });
        } else {
          // Create Mode Todo
          await apiCall('/api/todos', {
            method: 'POST',
            json: payload
          });
        }
        onSave();
      } catch (err: any) {
        setError(err.message || 'Failed to save reminder');
      } finally {
        setLoading(false);
      }
    } else {
      // Event Item type submit
      let endObj: Date;
      if (isAllDay) {
        endObj = new Date(dtEnd + 'T00:00:00Z');
      } else {
        endObj = new Date(dtEnd);
      }

      if (isNaN(endObj.getTime())) {
        setError('Invalid end date/time');
        setLoading(false);
        return;
      }

      if (endObj <= startObj) {
        setError('End date/time must be after start date/time');
        setLoading(false);
        return;
      }

      let finalRrule = rrule;
      if (finalRrule && repeatEndType === 'date' && repeatUntilDate) {
        const cleanDate = repeatUntilDate.replace(/-/g, '');
        finalRrule = `${finalRrule};UNTIL=${cleanDate}T235959Z`;
      }

      const payload = {
        calendarId,
        summary: summary.trim() || 'Untitled Event',
        description: description.trim() || null,
        location: location.trim() || null,
        dtStart: startObj.toISOString(),
        dtEnd: endObj.toISOString(),
        isAllDay,
        rrule: finalRrule || null
      };

      try {
        if (event && event.id && !event.isTodo) {
          // Edit Mode Event
          await apiCall(`/api/events/${event.id}`, {
            method: 'PUT',
            json: payload
          });
        } else {
          // Create Mode Event
          await apiCall('/api/events', {
            method: 'POST',
            json: payload
          });
        }
        onSave();
      } catch (err: any) {
        setError(err.message || 'Failed to save event');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDelete = async () => {
    if (!event || !event.id) return;
    if (!confirm(`Are you sure you want to delete this ${itemType}?`)) return;

    setError(null);
    setLoading(true);

    try {
      const endpoint = event.isTodo ? `/api/todos/${event.id}` : `/api/events/${event.id}`;
      await apiCall(endpoint, {
        method: 'DELETE'
      });
      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to delete item');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 sm:items-center animate-fade-in">
      <div className="w-full max-w-lg bg-white p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 rounded-t-3xl rounded-b-none sm:rounded-3xl animate-slide-up max-h-[90vh] overflow-y-auto custom-scrollbar">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-500" />
            {event ? `Edit ${itemType === 'reminder' ? 'Reminder' : 'Event'}` : `New ${itemType === 'reminder' ? 'Reminder' : 'Event'}`}
          </h3>
          <button
            onClick={onClose}
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

        {/* Item Type Selector Tab */}
        {!event && (
          <div className="flex p-0.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/40 mb-4 select-none">
            <button
              type="button"
              onClick={() => setItemType('event')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold uppercase tracking-wider text-center cursor-pointer transition-all ${
                itemType === 'event'
                  ? 'bg-white text-zinc-800 shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-450 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              Event
            </button>
            <button
              type="button"
              onClick={() => setItemType('reminder')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold uppercase tracking-wider text-center cursor-pointer transition-all ${
                itemType === 'reminder'
                  ? 'bg-white text-zinc-800 shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-450 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              Reminder
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Summary / Title */}
          <div>
            <input
              type="text"
              required
              placeholder={itemType === 'reminder' ? 'Reminder Title' : 'Event Title'}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full text-xl font-bold border-b border-zinc-200 pb-2 bg-transparent text-zinc-800 placeholder-zinc-400 dark:border-zinc-800 dark:text-zinc-100 outline-hidden focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Calendar Picker */}
          <div className="grid grid-cols-3 items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Calendar
            </label>
            <div className="col-span-2">
              <select
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden focus:border-indigo-500"
              >
                {writableCalendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates & Times */}
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50/20 p-4 dark:border-zinc-800/40 dark:bg-zinc-900/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <Clock className="h-4 w-4 text-zinc-400" />
                <span className="font-medium">{itemType === 'reminder' ? 'Schedule Date' : 'Time Settings'}</span>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={handleAllDayToggle}
                  className="rounded-sm border-zinc-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                All-Day
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className={itemType === 'reminder' ? 'col-span-2' : ''}>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  {itemType === 'reminder' ? 'Due Date/Time' : 'Starts'}
                </label>
                <DatePicker
                  value={dtStart}
                  onChange={handleStartChange}
                  isAllDay={isAllDay}
                  user={user}
                />
              </div>

              {itemType === 'event' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Ends
                  </label>
                  <DatePicker
                    value={dtEnd}
                    onChange={handleEndChange}
                    isAllDay={isAllDay}
                    user={user}
                    alignRight={true}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Priority (Reminders Only) */}
          {itemType === 'reminder' && (
            <div className="flex items-center gap-4 py-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 w-16">
                Priority
              </label>
              <div className="flex gap-2 flex-1">
                {([
                  { value: 0, label: 'None' },
                  { value: 9, label: 'Low' },
                  { value: 5, label: 'Medium' },
                  { value: 1, label: 'High' }
                ] as const).map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    style={priority === p.value ? getPrimaryButtonStyle(user?.accentColor) : {}}
                    className={`flex-1 rounded-xl border text-xs font-bold py-2 transition-all cursor-pointer ${
                      priority === p.value
                        ? getPrimaryButtonClass(user?.accentColor)
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status Toggle checkbox (Reminders Edit Only) */}
          {itemType === 'reminder' && event && (
            <div className="flex items-center justify-between p-3 rounded-2xl border border-zinc-150/80 bg-zinc-50/10 dark:border-zinc-800/40 dark:bg-zinc-900/10">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="reminder-status-chk"
                  checked={status === 'COMPLETED'}
                  onChange={(e) => setStatus(e.target.checked ? 'COMPLETED' : 'NEEDS-ACTION')}
                  className="rounded-sm border-zinc-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                />
                <label htmlFor="reminder-status-chk" className="text-sm font-semibold text-zinc-700 dark:text-zinc-350 cursor-pointer">
                  Mark as Completed
                </label>
              </div>
            </div>
          )}

          {/* Location (Events Only) */}
          {itemType === 'event' && (
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-zinc-400 mt-2.5 shrink-0" />
              <div className="w-full">
                <input
                  type="text"
                  placeholder="Add Location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Recurrence Rule (Events Only) */}
          {itemType === 'event' && (
            <div className="flex items-start gap-3">
              <RefreshCw className="h-5 w-5 text-zinc-400 mt-2.5 shrink-0" />
              <div className="w-full space-y-2">
                <select
                  value={rrule}
                  onChange={(e) => setRrule(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden focus:border-indigo-500"
                >
                  <option value="">Does Not Repeat</option>
                  <option value="FREQ=DAILY">Every Day</option>
                  <option value="FREQ=WEEKLY">Every Week</option>
                  <option value="FREQ=MONTHLY">Every Month</option>
                  <option value="FREQ=YEARLY">Every Year</option>
                </select>

                {rrule && (
                  <div className="grid grid-cols-2 gap-3 pl-1 animate-fade-in">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                        Ends
                      </label>
                      <select
                        value={repeatEndType}
                        onChange={(e) => setRepeatEndType(e.target.value as 'never' | 'date')}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-1.5 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden focus:border-indigo-500"
                      >
                        <option value="never">Never</option>
                        <option value="date">On Date</option>
                      </select>
                    </div>

                    {repeatEndType === 'date' && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                          End Date
                        </label>
                        <DatePicker
                          value={repeatUntilDate}
                          onChange={setRepeatUntilDate}
                          isAllDay={true}
                          user={user}
                          alignRight={true}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Description / Notes */}
          <div className="flex items-start gap-3">
            <AlignLeft className="h-5 w-5 text-zinc-400 mt-2.5 shrink-0" />
            <div className="w-full">
              <textarea
                placeholder="Add Notes"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 text-sm text-zinc-800 placeholder-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden focus:border-indigo-500 resize-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/40">
            {event && event.id ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/10 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            ) : (
              <div /> // Spacer
            )}

            <div className="flex gap-3">
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
                style={getPrimaryButtonStyle(user?.accentColor)}
                className={`rounded-xl ${getPrimaryButtonClass(user?.accentColor)} px-5 py-2 text-sm font-semibold disabled:opacity-50`}
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
