import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { getPrimaryButtonStyle } from '../utils/theme';

interface DatePickerProps {
  value: string; // YYYY-MM-DD or YYYY-MM-DDTHH:MM
  onChange: (val: string) => void;
  isAllDay: boolean;
  user?: { accentColor?: string | null };
  alignRight?: boolean;
}

export default function DatePicker({ value, onChange, isAllDay, user, alignRight }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current value
  const parseValue = (val: string): Date => {
    try {
      if (!val) return new Date();
      if (isAllDay) {
        const [y, m, d] = val.split('-').map(Number);
        return new Date(y, m - 1, d);
      } else {
        const [datePart, timePart] = val.split('T');
        const [y, m, d] = datePart.split('-').map(Number);
        const [hh, mm] = timePart.split(':').map(Number);
        return new Date(y, m - 1, d, hh, mm);
      }
    } catch {
      return new Date();
    }
  };

  const selectedDate = parseValue(value);
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));

  // Keep currentMonth in sync when value changes or popover opens
  useEffect(() => {
    if (isOpen) {
      setCurrentMonth(new Date(selectedDate));
    }
  }, [isOpen, value]);

  // Formatter helpers
  const pad = (n: number) => String(n).padStart(2, '0');
  
  const formatDateOnly = (d: Date): string => {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const formatDateTime = (d: Date): string => {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const displayString = (): string => {
    if (isNaN(selectedDate.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[selectedDate.getMonth()];
    const date = selectedDate.getDate();
    const year = selectedDate.getFullYear();
    
    if (isAllDay) {
      return `${month} ${date}, ${year}`;
    } else {
      let hours = selectedDate.getHours();
      const minutes = pad(selectedDate.getMinutes());
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12
      return `${month} ${date}, ${year} at ${hours}:${minutes} ${ampm}`;
    }
  };

  // Calendar logic
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay(); // Sunday=0
  const totalDays = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const handleSelectDay = (day: number) => {
    const newDate = new Date(selectedDate);
    newDate.setFullYear(year, month, day);
    
    if (isAllDay) {
      onChange(formatDateOnly(newDate));
      setIsOpen(false);
    } else {
      onChange(formatDateTime(newDate));
    }
  };

  // Time logic
  const hours = selectedDate.getHours();
  const minutes = selectedDate.getMinutes();
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const ampm = hours >= 12 ? 'PM' : 'AM';

  const handleTimeChange = (type: 'hour' | 'minute' | 'ampm', val: string) => {
    const newDate = new Date(selectedDate);
    if (type === 'hour') {
      const hNum = Number(val);
      const isPm = hours >= 12;
      const finalH = isPm ? (hNum === 12 ? 12 : hNum + 12) : (hNum === 12 ? 0 : hNum);
      newDate.setHours(finalH);
    } else if (type === 'minute') {
      newDate.setMinutes(Number(val));
    } else if (type === 'ampm') {
      const isPm = val === 'PM';
      let currentH = hours % 12;
      if (isPm) {
        newDate.setHours(currentH === 0 ? 12 : currentH + 12);
      } else {
        newDate.setHours(currentH === 0 ? 0 : currentH);
      }
    }
    onChange(formatDateTime(newDate));
  };

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50/50 dark:bg-zinc-900/50 dark:border-zinc-800/80 px-3.5 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 outline-hidden hover:bg-zinc-150/50 dark:hover:bg-zinc-850/50 transition-all duration-200 select-none text-left"
      >
        <span className="truncate">{displayString() || 'Select Date...'}</span>
        {isAllDay ? (
          <CalendarIcon className="h-4 w-4 text-zinc-400 shrink-0 ml-2" />
        ) : (
          <Clock className="h-4 w-4 text-zinc-400 shrink-0 ml-2" />
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className={`absolute ${alignRight ? 'right-0' : 'left-0'} mt-2 z-50 w-64 rounded-2xl border border-zinc-200/80 bg-white/95 dark:bg-zinc-950/95 dark:border-zinc-800/80 shadow-2xl p-3 backdrop-blur-xl animate-fade-in text-zinc-800 dark:text-zinc-100 select-none`}>
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-xs tracking-wide">
              {monthNames[month]} {year}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-0.5 rounded-lg border border-zinc-150 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900 text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-0.5 rounded-lg border border-zinc-150 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900 text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-0.5">
            {daysOfWeek.map((day) => (
              <span key={day} className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                {day}
              </span>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2.5">
            {/* Spacers for preceding days */}
            {Array(firstDayIndex)
              .fill(null)
              .map((_, i) => (
                <div key={`spacer-${i}`} className="w-7 h-7" />
              ))}

            {/* Month days */}
            {Array.from({ length: totalDays }, (_, i) => i + 1).map((day) => {
              const isSelected =
                selectedDate.getDate() === day &&
                selectedDate.getMonth() === month &&
                selectedDate.getFullYear() === year;

              const isToday =
                new Date().getDate() === day &&
                new Date().getMonth() === month &&
                new Date().getFullYear() === year;

              return (
                <button
                  key={`day-${day}`}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  style={isSelected ? getPrimaryButtonStyle(user?.accentColor) : {}}
                  className={`w-7 h-7 flex items-center justify-center text-[10px] font-bold rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? 'text-white shadow-md'
                      : isToday
                      ? 'border border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-350'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Time Selector (only if not all day) */}
          {!isAllDay && (
            <div className="pt-2 border-t border-zinc-150 dark:border-zinc-800/40 space-y-1.5">
              <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                <Clock className="h-3 w-3" />
                <span>Select Time</span>
              </div>
              <div className="flex gap-1.5">
                {/* Hour */}
                <select
                  value={displayHour}
                  onChange={(e) => handleTimeChange('hour', e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/50 px-1.5 py-1 text-[10px] font-bold outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>

                {/* Minute */}
                <select
                  value={minutes}
                  onChange={(e) => handleTimeChange('minute', e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/50 px-1.5 py-1 text-[10px] font-bold outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                >
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>
                      {pad(m)}
                    </option>
                  ))}
                </select>

                {/* AM/PM */}
                <select
                  value={ampm}
                  onChange={(e) => handleTimeChange('ampm', e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/50 px-1.5 py-1 text-[10px] font-bold outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
