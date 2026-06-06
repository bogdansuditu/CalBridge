import React, { useState, useEffect } from 'react';
import { apiCall } from '../api';
import { X, Calendar, Clock, MapPin, AlignLeft, RefreshCw, Trash2 } from 'lucide-react';
import { getPrimaryButtonClass, getPrimaryButtonStyle } from '../utils/theme';

interface CalendarData {
  id: string;
  name: string;
  color: string;
  isReadOnly: boolean;
}

interface EventData {
  id?: string;
  summary: string;
  description: string | null;
  location: string | null;
  dtStart: Date | string;
  dtEnd: Date | string;
  isAllDay: boolean;
  rrule: string | null;
  calendarId: string;
}

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  event: EventData | null; // Null means create mode
  calendars: CalendarData[];
  selectedDate?: Date; // Pre-filled date when clicking on a grid slot
  user?: { accentColor?: string | null };
}

export default function EventModal({ isOpen, onClose, onSave, event, calendars, selectedDate, user }: EventModalProps) {
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [dtStart, setDtStart] = useState('');
  const [dtEnd, setDtEnd] = useState('');
  const [isAllDay, setIsAllDay] = useState(false);
  const [rrule, setRrule] = useState('');
  const [calendarId, setCalendarId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [repeatEndType, setRepeatEndType] = useState<'never' | 'date'>('never');
  const [repeatUntilDate, setRepeatUntilDate] = useState('');

  // Filter out read-only calendars for selection
  const writableCalendars = calendars.filter(c => !c.isReadOnly);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setLoading(false); // Reset loading when opened (prevents freeze)
      if (event) {
        // Edit mode
        setSummary(event.summary || '');
        setDescription(event.description || '');
        setLocation(event.location || '');
        setIsAllDay(event.isAllDay || false);
        setCalendarId(event.calendarId);

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

        const start = new Date(event.dtStart);
        const end = new Date(event.dtEnd);
        
        setDtStart(formatDateForInput(start, event.isAllDay));
        setDtEnd(formatDateForInput(end, event.isAllDay));
      } else {
        // Create mode
        setSummary('');
        setDescription('');
        setLocation('');
        setIsAllDay(false);
        setRrule('');
        setRepeatEndType('never');
        setRepeatUntilDate('');
        
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

    // Convert input strings to Date objects
    let startObj: Date;
    let endObj: Date;

    if (isAllDay) {
      // For all-day events, save as starting at 00:00 UTC and ending at 00:00 UTC next day
      startObj = new Date(dtStart + 'T00:00:00Z');
      endObj = new Date(dtEnd + 'T00:00:00Z');
    } else {
      startObj = new Date(dtStart);
      endObj = new Date(dtEnd);
    }

    if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) {
      setError('Invalid start or end date');
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
      if (event && event.id) {
        // Edit mode
        await apiCall(`/api/events/${event.id}`, {
          method: 'PUT',
          json: payload
        });
      } else {
        // Create mode
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
  };

  const handleDelete = async () => {
    if (!event || !event.id) return;
    if (!confirm('Are you sure you want to delete this event?')) return;

    setError(null);
    setLoading(true);

    try {
      await apiCall(`/api/events/${event.id}`, {
        method: 'DELETE'
      });
      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to delete event');
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
            {event ? 'Event Details' : 'New Calendar Event'}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Summary / Title */}
          <div>
            <input
              type="text"
              required
              placeholder="Event Title"
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
                <span className="font-medium">Time Settings</span>
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
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Starts
                </label>
                <input
                  type={isAllDay ? 'date' : 'datetime-local'}
                  value={dtStart}
                  onChange={(e) => setDtStart(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Ends
                </label>
                <input
                  type={isAllDay ? 'date' : 'datetime-local'}
                  value={dtEnd}
                  onChange={(e) => setDtEnd(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Location */}
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

          {/* Recurrence Rule */}
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
                      <input
                        type="date"
                        required
                        value={repeatUntilDate}
                        onChange={(e) => setRepeatUntilDate(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 outline-hidden"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

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
