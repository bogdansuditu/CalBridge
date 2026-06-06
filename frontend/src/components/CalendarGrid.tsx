import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin, Plus } from 'lucide-react';
import { getPrimaryButtonClass, getPrimaryButtonStyle } from '../utils/theme';

interface CalendarData {
  id: string;
  name: string;
  color: string;
  isReadOnly: boolean;
}

interface EventData {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  dtStart: string;
  dtEnd: string;
  isAllDay: boolean;
  rrule: string | null;
  calendarId: string;
  originalDtStart?: string;
  originalDtEnd?: string;
}

interface CalendarGridProps {
  events: EventData[];
  calendars: CalendarData[];
  visibleCalendarIds: Set<string>;
  onEventClick: (event: EventData) => void;
  onSlotClick: (date: Date) => void;
  onEventUpdate?: (eventId: string, newStart: Date, newEnd: Date) => void;
  user?: { accentColor?: string | null };
}

type ViewType = 'year' | 'month' | 'week' | 'day' | 'agenda';

const hourRows = Array.from({ length: 24 }, (_, i) => i);
const hourHeight = 60; // 60px per hour (1px per minute)

export default function CalendarGrid({
  events,
  calendars,
  visibleCalendarIds,
  onEventClick,
  onSlotClick,
  onEventUpdate,
  user
}: CalendarGridProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<ViewType>('month');

  // Filter events based on active calendars in sidebar
  const activeEvents = events.filter(e => visibleCalendarIds.has(e.calendarId));

  const calendarMap = new Map(calendars.map(c => [c.id, c]));

  // Date Navigation Helpers
  const next = () => {
    const nextDate = new Date(currentDate);
    if (currentView === 'year') {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    } else if (currentView === 'month' || currentView === 'agenda') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else if (currentView === 'week') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (currentView === 'day') {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    setCurrentDate(nextDate);
  };

  const prev = () => {
    const prevDate = new Date(currentDate);
    if (currentView === 'year') {
      prevDate.setFullYear(prevDate.getFullYear() - 1);
    } else if (currentView === 'month' || currentView === 'agenda') {
      prevDate.setMonth(prevDate.getMonth() - 1);
    } else if (currentView === 'week') {
      prevDate.setDate(prevDate.getDate() - 7);
    } else if (currentView === 'day') {
      prevDate.setDate(prevDate.getDate() - 1);
    }
    setCurrentDate(prevDate);
  };

  const today = () => {
    setCurrentDate(new Date());
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, event: EventData) => {
    const cal = calendars.find(c => c.id === event.calendarId);
    if (cal?.isReadOnly) {
      e.preventDefault();
      return;
    }
    // Set drag transfer parameters
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: event.id,
      dtStart: event.dtStart,
      dtEnd: event.dtEnd,
      originalDtStart: event.originalDtStart,
      originalDtEnd: event.originalDtEnd,
      calendarId: event.calendarId
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnMonthGrid = (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;
    try {
      const dragData = JSON.parse(rawData);
      const { id, dtStart, dtEnd, originalDtStart, originalDtEnd, calendarId } = dragData;

      const cal = calendars.find(c => c.id === calendarId);
      if (cal?.isReadOnly) return;

      const occurrenceStart = new Date(dtStart);
      const masterStart = new Date(originalDtStart || dtStart);
      const masterEnd = new Date(originalDtEnd || dtEnd);

      const newOccurrenceStart = new Date(targetDate);
      newOccurrenceStart.setHours(occurrenceStart.getHours(), occurrenceStart.getMinutes(), 0, 0);

      const deltaMs = newOccurrenceStart.getTime() - occurrenceStart.getTime();
      const newMasterStart = new Date(masterStart.getTime() + deltaMs);
      const newMasterEnd = new Date(masterEnd.getTime() + deltaMs);

      if (onEventUpdate) {
        onEventUpdate(id, newMasterStart, newMasterEnd);
      }
    } catch (err) {
      console.error('[Month Grid Drop] Failed:', err);
    }
  };

  const handleDropOnHourGrid = (e: React.DragEvent, targetDay: Date) => {
    e.preventDefault();
    const rawData = e.dataTransfer.getData('text/plain');
    if (!rawData) return;
    try {
      const dragData = JSON.parse(rawData);
      const { id, dtStart, dtEnd, originalDtStart, originalDtEnd, calendarId } = dragData;

      const cal = calendars.find(c => c.id === calendarId);
      if (cal?.isReadOnly) return;

      const occurrenceStart = new Date(dtStart);
      const masterStart = new Date(originalDtStart || dtStart);
      const masterEnd = new Date(originalDtEnd || dtEnd);

      const rect = e.currentTarget.getBoundingClientRect();
      const dropY = e.clientY - rect.top;
      const dropHourFloat = dropY / hourHeight;
      const dropHour = Math.floor(dropHourFloat);
      const dropMinutes = Math.floor((dropHourFloat - dropHour) * 60);

      // Round minutes to the nearest 15-minute slot
      const minutesAligned = Math.round(dropMinutes / 15) * 15;
      const alignedHour = dropHour + Math.floor(minutesAligned / 60);
      const alignedMinutes = minutesAligned % 60;

      const newOccurrenceStart = new Date(targetDay);
      newOccurrenceStart.setHours(alignedHour, alignedMinutes, 0, 0);

      const deltaMs = newOccurrenceStart.getTime() - occurrenceStart.getTime();
      const newMasterStart = new Date(masterStart.getTime() + deltaMs);
      const newMasterEnd = new Date(masterEnd.getTime() + deltaMs);

      if (onEventUpdate) {
        onEventUpdate(id, newMasterStart, newMasterEnd);
      }
    } catch (err) {
      console.error('[Hour Grid Drop] Failed:', err);
    }
  };

  // Year View Generation Helpers
  const getYearMonthDays = (year: number, month: number) => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const adjustedFirstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const grid = [];
    for (let i = adjustedFirstDayIndex - 1; i >= 0; i--) {
      grid.push({
        date: new Date(year, month - 1, daysInPrevMonth - i),
        isCurrentMonth: false
      });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      grid.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }
    const remainingSlots = 42 - grid.length;
    for (let i = 1; i <= remainingSlots; i++) {
      grid.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }
    return grid;
  };

  const renderYearView = () => {
    const year = currentDate.getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => i);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const todayDate = new Date();

    return (
      <div className="h-full overflow-y-auto custom-scrollbar p-4 select-none">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {months.map(month => {
            const days = getYearMonthDays(year, month);
            return (
              <div key={month} className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/40 bg-white/40 dark:bg-zinc-900/10 p-3 flex flex-col backdrop-blur-xs">
                <h3 className="text-sm font-extrabold text-zinc-850 dark:text-zinc-200 mb-2 truncate">
                  {monthNames[month]}
                </h3>

                <div className="grid grid-cols-7 text-center text-[9px] font-bold text-zinc-400 dark:text-zinc-650 mb-1">
                  {weekdayLabels.map((lbl, idx) => (
                    <div key={idx}>{lbl}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-y-0.5 text-center text-xs">
                  {days.map(({ date, isCurrentMonth }, idx) => {
                    const isToday = isSameDay(date, todayDate);
                    const dayEvents = getEventsForDay(date);
                    const hasEvents = dayEvents.length > 0;

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setCurrentDate(date);
                          setCurrentView('day');
                        }}
                        className={`aspect-square flex flex-col items-center justify-center rounded-full cursor-pointer relative ${
                          isCurrentMonth
                            ? 'text-zinc-700 dark:text-zinc-350 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            : 'text-zinc-300 dark:text-zinc-700 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30'
                        } ${
                          isToday
                            ? 'bg-indigo-650 text-white font-extrabold hover:bg-indigo-500'
                            : ''
                        }`}
                      >
                        {date.getDate()}
                        {hasEvents && !isToday && (
                          <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                        )}
                        {hasEvents && isToday && (
                          <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-white" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Month View Grid Calculation
  const getMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // Sunday=0, Monday=1...
    // Adjust firstDayIndex to make Monday start of week (0=Mon, 6=Sun)
    const adjustedFirstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const grid = [];

    // Previous Month padding days
    for (let i = adjustedFirstDayIndex - 1; i >= 0; i--) {
      grid.push({
        date: new Date(year, month - 1, daysInPrevMonth - i),
        isCurrentMonth: false
      });
    }

    // Current Month days
    for (let i = 1; i <= daysInMonth; i++) {
      grid.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }

    // Next Month padding days (to make grid multiples of 7)
    const totalSlots = grid.length <= 35 ? 35 : 42;
    const remainingSlots = totalSlots - grid.length;
    for (let i = 1; i <= remainingSlots; i++) {
      grid.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }

    return grid;
  };

  // Week View Days Calculation (Monday to Sunday)
  const getWeekDays = () => {
    const day = currentDate.getDay();
    const adjust = day === 0 ? -6 : 1 - day; // Adjust to Monday
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() + adjust);

    const week = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      week.push(date);
    }
    return week;
  };

  // Check if two dates represent the same day
  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  // Get events on a specific day
  const getEventsForDay = (date: Date) => {
    return activeEvents.filter(event => {
      const start = new Date(event.dtStart);
      const end = new Date(event.dtEnd);
      
      // All day matching or date intersection
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(d.getDate() + 1);

      return start < nextD && end >= d;
    });
  };

  // Format header title
  const getHeaderTitle = () => {
    if (currentView === 'year') {
      return currentDate.getFullYear().toString();
    } else if (currentView === 'month' || currentView === 'agenda') {
      return currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } else if (currentView === 'week') {
      const week = getWeekDays();
      const startStr = week[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const endStr = week[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startStr} – ${endStr}`;
    } else {
      return currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  };

  // Render Month View
  const renderMonthView = () => {
    const days = getMonthDays();
    const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayDate = new Date();

    return (
      <div className="flex flex-col h-full select-none">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 text-center py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          {weekdayLabels.map(day => <div key={day}>{day}</div>)}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 grid-rows-5 flex-1 divide-x divide-y divide-zinc-200/50 dark:divide-zinc-800/30 border-b border-r border-zinc-200/50 dark:border-zinc-800/30 overflow-hidden">
          {days.map(({ date, isCurrentMonth }, idx) => {
            const dayEvents = getEventsForDay(date);
            const isToday = isSameDay(date, todayDate);
            const isSelected = isSameDay(date, currentDate);

            return (
              <div
                key={idx}
                onClick={() => onSlotClick(date)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDropOnMonthGrid(e, date)}
                className={`flex flex-col p-1.5 h-full relative cursor-pointer min-h-[90px] overflow-hidden transition-colors ${
                  isCurrentMonth 
                    ? 'bg-white dark:bg-zinc-900/30' 
                    : 'bg-zinc-50/20 text-zinc-400 dark:bg-zinc-950/10 dark:text-zinc-600'
                } hover:bg-zinc-50/50 dark:hover:bg-zinc-900/10`}
              >
                {/* Date Label */}
                <div className="flex justify-between items-center mb-1">
                  <span
                    onClick={() => {
                      setCurrentDate(date);
                      setCurrentView('day');
                    }}
                    className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 ${
                      isToday
                        ? 'bg-indigo-600 text-white font-extrabold'
                        : isSelected
                        ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                        : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="text-[10px] text-zinc-400 font-semibold px-1">
                      {dayEvents.length} event{dayEvents.length > 1 && 's'}
                    </span>
                  )}
                </div>

                {/* Event Tags inside Grid Day Slot */}
                <div className="space-y-1 flex-1 overflow-y-auto custom-scrollbar">
                  {dayEvents.slice(0, 4).map(event => {
                    const cal = calendarMap.get(event.calendarId);
                    const calColor = cal?.color || '#3b82f6';
                    return (
                      <div
                        key={`${event.id}-${event.dtStart}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                        draggable={!cal?.isReadOnly}
                        onDragStart={(e) => handleDragStart(e, event)}
                        style={{ borderLeftColor: calColor }}
                        className="text-[10.5px] truncate font-medium border-l-3 rounded-r-sm bg-zinc-100/60 dark:bg-zinc-800/40 px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300 hover:scale-[1.01] transition-transform"
                      >
                        {event.summary}
                      </div>
                    );
                  })}
                  {dayEvents.length > 4 && (
                    <div className="text-[9.5px] text-zinc-400 font-bold pl-1.5">
                      + {dayEvents.length - 4} more...
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Calculate layout coordinates for a specific event
  const getEventPosition = (event: EventData) => {
    const start = new Date(event.dtStart);
    const end = new Date(event.dtEnd);

    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();
    const duration = Math.max(endMin - startMin, 30); // At least 30 minutes visual height

    const top = (startMin / 60) * hourHeight;
    const height = (duration / 60) * hourHeight;

    return { top, height };
  };

  // Render Day/Week Grid Core Columns
  const renderHoursGrid = (days: Date[]) => {
    return (
      <div className="flex flex-1 overflow-y-auto custom-scrollbar h-full relative" style={{ height: 'calc(100% - 40px)' }}>
        {/* Time column labels */}
        <div className="w-14 shrink-0 border-r border-zinc-200/50 dark:border-zinc-800/20 bg-zinc-50/20 dark:bg-zinc-900/10 select-none">
          {hourRows.map(hour => (
            <div key={hour} className="text-[10.5px] text-zinc-400 font-semibold pr-2 text-right relative" style={{ height: `${hourHeight}px`, top: '-7px' }}>
              {hour === 0 ? '' : `${String(hour).padStart(2, '0')}:00`}
            </div>
          ))}
        </div>

        {/* Columns for days */}
        <div className="flex flex-1 relative divide-x divide-zinc-200/50 dark:divide-zinc-800/30">
          {/* Horizontal Grid lines */}
          <div className="absolute inset-0 pointer-events-none flex flex-col">
            {hourRows.map(hour => (
              <div key={hour} className="border-b border-zinc-200/50 dark:border-zinc-800/20 w-full" style={{ height: `${hourHeight}px` }} />
            ))}
          </div>

          {/* Day Columns containing Event blocks */}
          {days.map((day, dIdx) => {
            const dayEvents = getEventsForDay(day).filter(e => !e.isAllDay);

            return (
              <div
                key={dIdx}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickY = e.clientY - rect.top;
                  const clickHour = Math.floor(clickY / hourHeight);
                  const date = new Date(day);
                  date.setHours(clickHour, 0, 0, 0);
                  onSlotClick(date);
                }}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDropOnHourGrid(e, day)}
                className="flex-1 relative cursor-pointer hover:bg-zinc-50/10 dark:hover:bg-zinc-900/5"
                style={{ height: `${24 * hourHeight}px` }}
              >
                {/* Event absolute blocks */}
                {dayEvents.map(event => {
                  const { top, height } = getEventPosition(event);
                  const cal = calendarMap.get(event.calendarId);
                  const calColor = cal?.color || '#3b82f6';

                  return (
                    <div
                      key={`${event.id}-${event.dtStart}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      draggable={!cal?.isReadOnly}
                      onDragStart={(e) => handleDragStart(e, event)}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        borderLeftColor: calColor,
                        backgroundColor: `${calColor}15` // opacity hex
                      }}
                      className="absolute left-1 right-1 rounded-r-lg border-l-4 p-2 shadow-xs hover:shadow-md hover:brightness-95 active:scale-99 transition-all overflow-hidden flex flex-col justify-start text-left cursor-pointer"
                    >
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate leading-tight">
                        {event.summary}
                      </span>
                      {height > 45 && event.location && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate flex items-center gap-0.5 mt-0.5">
                          <MapPin className="h-3 w-3" /> {event.location}
                        </span>
                      )}
                      {height > 60 && event.description && (
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-1">
                          {event.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render Week View
  const renderWeekView = () => {
    const days = getWeekDays();
    const todayDate = new Date();

    return (
      <div className="flex flex-col h-full">
        {/* Week Columns header */}
        <div className="flex border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 select-none">
          <div className="w-14 shrink-0" /> {/* Time placeholder spacer */}
          <div className="flex flex-1 divide-x divide-zinc-200/50 dark:divide-zinc-800/30 text-center py-2 text-xs font-bold text-zinc-500">
            {days.map((day, idx) => {
              const isToday = isSameDay(day, todayDate);
              return (
                <div key={idx} className="flex-1 py-1 flex flex-col items-center">
                  <span className="text-[10px] uppercase font-semibold text-zinc-400">{day.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span className={`text-base font-bold w-7 h-7 flex items-center justify-center rounded-full mt-0.5 ${
                    isToday ? 'bg-indigo-600 text-white font-extrabold shadow-sm shadow-indigo-500/20' : 'text-zinc-700 dark:text-zinc-300'
                  }`}>
                    {day.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hours grid */}
        {renderHoursGrid(days)}
      </div>
    );
  };

  // Render Day View
  const renderDayView = () => {
    return (
      <div className="flex flex-col h-full">
        <div className="flex border-b border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 py-2 items-center select-none">
          <div className="w-14 shrink-0" />
          <div className="pl-4 font-bold text-zinc-700 dark:text-zinc-300 text-sm">
            {currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {renderHoursGrid([currentDate])}
      </div>
    );
  };

  // Render Agenda View
  const renderAgendaView = () => {
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Filter events for the current month/year
    const monthlyEvents = activeEvents.filter(event => {
      const start = new Date(event.dtStart);
      return start.getMonth() === currentMonth && start.getFullYear() === currentYear;
    });

    // Sort events by dtStart
    const sorted = [...monthlyEvents].sort((a, b) => new Date(a.dtStart).getTime() - new Date(b.dtStart).getTime());
    
    // Group events by date
    const groups: { [key: string]: { date: Date; events: EventData[] } } = {};
    for (const evt of sorted) {
      const dateKey = new Date(evt.dtStart).toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = {
          date: new Date(evt.dtStart),
          events: []
        };
      }
      groups[dateKey].events.push(evt);
    }

    const groupList = Object.values(groups);

    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        {groupList.length === 0 ? (
          <div className="text-center py-20 text-zinc-400 dark:text-zinc-600 select-none">
            <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-semibold text-sm">No scheduled events</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Events from your active calendars will show up here.</p>
          </div>
        ) : (
          groupList.map((group, idx) => (
            <div key={idx} className="flex flex-col md:flex-row gap-4 border-b border-zinc-100 dark:border-zinc-800/40 pb-4">
              {/* Date Header Column */}
              <div className="md:w-36 shrink-0 text-left select-none">
                <span className="text-xs uppercase font-bold text-zinc-400 block">
                  {group.date.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span className="text-xl font-extrabold text-zinc-800 dark:text-zinc-200">
                  {group.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>

              {/* Day Events Column */}
              <div className="flex-1 space-y-3">
                {group.events.map(event => {
                  const cal = calendarMap.get(event.calendarId);
                  const calColor = cal?.color || '#3b82f6';
                  const start = new Date(event.dtStart);
                  const end = new Date(event.dtEnd);

                  return (
                    <div
                      key={`${event.id}-${event.dtStart}`}
                      onClick={() => onEventClick(event)}
                      className="group flex flex-col sm:flex-row justify-between items-start sm:items-center p-3.5 rounded-2xl border border-zinc-100 dark:border-zinc-800/50 bg-white dark:bg-zinc-900/30 shadow-xs hover:shadow-md cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-3">
                        {/* Calendar indicator dot */}
                        <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: calColor }} />
                        <div>
                          <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {event.summary}
                          </h4>
                          {event.location && (
                            <span className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 flex items-center gap-0.5">
                              <MapPin className="h-3.5 w-3.5" /> {event.location}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Time */}
                      <div className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold flex items-center gap-1 mt-2 sm:mt-0 select-none">
                        <Clock className="h-3.5 w-3.5" />
                        {event.isAllDay ? (
                          <span>All-Day</span>
                        ) : (
                          <span>
                            {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50/30 dark:bg-zinc-950/5 overflow-hidden">
      
      {/* Calendar Grid Toolbar Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-900/20 backdrop-blur-md select-none">
        
        {/* Navigation title / arrows */}
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 min-w-[150px]">
            {getHeaderTitle()}
          </h2>
          <div className="flex items-center rounded-xl border border-zinc-200/80 bg-white dark:border-zinc-800/50 dark:bg-zinc-900/30 overflow-hidden shadow-xs">
            <button
              onClick={prev}
              className="p-1.5 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={today}
              className="px-3.5 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 border-x border-zinc-100 dark:border-zinc-800/50 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={next}
              className="p-1.5 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => onSlotClick(new Date())}
            style={getPrimaryButtonStyle(user?.accentColor)}
            className={`flex items-center gap-1.5 rounded-xl ${getPrimaryButtonClass(user?.accentColor)} px-3 py-1.5 text-xs font-bold uppercase tracking-wider ml-2`}
          >
            <Plus className="h-4.5 w-4.5" />
            Add Event
          </button>
        </div>

        {/* View Switches */}
        <div className="flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200/50 dark:border-zinc-800/50">
          {(['year', 'month', 'week', 'day', 'agenda'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                currentView === view
                  ? 'bg-white text-zinc-800 shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* Main View Container */}
      <div className="flex-1 overflow-hidden h-full">
        {currentView === 'year' && renderYearView()}
        {currentView === 'month' && renderMonthView()}
        {currentView === 'week' && renderWeekView()}
        {currentView === 'day' && renderDayView()}
        {currentView === 'agenda' && renderAgendaView()}
      </div>

    </div>
  );
}
