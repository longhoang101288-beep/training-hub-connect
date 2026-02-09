
import React, { useState } from 'react';
import { Registration, User, UserRole, Course } from '../types';

interface CourseCalendarProps {
  registrations: Registration[];
  user: User;
  courses: Course[];
}

const CourseCalendar: React.FC<CourseCalendarProps> = ({ registrations, user, courses }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const startDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Chưa có ngày';
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
         return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
      }
      return dateString.split('-').reverse().join('/');
    } catch (e) {
      return dateString;
    }
  };

  // Helper function to format time strings
  const formatTime = (timeString?: string) => {
    if (!timeString) return '--:--';
    if (/^\d{1,2}:\d{2}/.test(timeString) && !timeString.includes('T')) {
       return timeString.substring(0, 5);
    }
    try {
      const date = new Date(timeString);
      if (!isNaN(date.getTime())) {
         return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
      }
    } catch (e) {}
    return timeString;
  };

  const monthYearStr = currentMonth.toLocaleString('vi-VN', { month: 'long', year: 'numeric' });

  const getRegistrationsForDay = (day: number) => {
    const dayStr = day.toString().padStart(2, '0');
    const monthStr = (currentMonth.getMonth() + 1).toString().padStart(2, '0');
    const yearStr = currentMonth.getFullYear();
    const dateStr = `${yearStr}-${monthStr}-${dayStr}`;

    return registrations.filter(reg => {
      let regDateOnly = '';
      
      if (reg.date) {
         if (reg.date.includes('T')) {
            const d = new Date(reg.date);
            if (!isNaN(d.getTime())) {
               const rYear = d.getFullYear();
               const rMonth = (d.getMonth() + 1).toString().padStart(2, '0');
               const rDay = d.getDate().toString().padStart(2, '0');
               regDateOnly = `${rYear}-${rMonth}-${rDay}`;
            } else {
               regDateOnly = reg.date.split('T')[0];
            }
         } else {
            regDateOnly = reg.date;
         }
      }

      const dateMatch = regDateOnly === dateStr;
      
      // Update logic: ADMIN, TRAINER, and KA see all. Others filter by region/ASM ID.
      const regionMatch = (user.role === UserRole.ADMIN || user.role === UserRole.TRAINER || user.role === UserRole.KA) 
        ? true 
        : (reg.region === user.region || reg.asmId === user.id);

      const statusMatch = user.role === UserRole.ASM ? reg.status === 'confirmed' : true;

      return dateMatch && regionMatch && statusMatch;
    });
  };

  const getFormatColor = (format: string) => {
      switch (format) {
          case 'Online':
              return 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100';
          case 'Offline':
              return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
          case 'Livestream':
              return 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100';
          default:
              return 'bg-slate-50 text-slate-700 border-slate-200';
      }
  };

  const renderDays = () => {
    const days = [];
    const totalDays = daysInMonth(currentMonth);
    const startDay = startDayOfMonth(currentMonth);

    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 sm:h-32 border border-slate-100 bg-slate-50/50"></div>);
    }

    for (let d = 1; d <= totalDays; d++) {
      const dayRegs = getRegistrationsForDay(d);
      days.push(
        <div key={d} className="h-24 sm:h-32 border border-slate-100 bg-white p-1 sm:p-2 flex flex-col gap-1 overflow-y-auto group hover:bg-slate-50 transition-colors">
          <span className="text-xs font-semibold text-slate-400 group-hover:text-indigo-600">{d}</span>
          {dayRegs.map(reg => {
            const course = courses.find(c => c.id === reg.courseId);
            // FIX: If course is deleted (undefined), do not render anything
            if (!course) return null;

            const isPending = reg.status === 'pending';
            const colorClass = getFormatColor(course.format);
            
            return (
              <div 
                key={reg.id} 
                onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCourse(course);
                }}
                className={`text-[8px] sm:text-[10px] p-1 sm:p-1.5 rounded border shadow-sm whitespace-normal transition-all cursor-pointer hover:scale-[1.02] active:scale-95 ${
                  isPending ? 'opacity-70 border-dashed' : 'opacity-100'
                } ${colorClass}`}
                title="Nhấn để xem chi tiết"
              >
                {isPending && <span className="mr-1 text-[8px] font-black uppercase bg-slate-200 text-slate-500 px-1 rounded hidden sm:inline-block">Chờ</span>}
                <span className="font-bold hidden sm:inline">[{course.format}]</span> {course.title}
              </div>
            );
          })}
        </div>
      );
    }

    return days;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 uppercase tracking-tight text-sm sm:text-base">Lịch Đào Tạo Vùng</h3>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-xs sm:text-sm font-medium text-slate-600 capitalize">{monthYearStr}</span>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="p-1.5 hover:bg-white rounded-md border border-slate-200 shadow-sm transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <button onClick={nextMonth} className="p-1.5 hover:bg-white rounded-md border border-slate-200 shadow-sm transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile Scroll Wrapper */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
            <div className="grid grid-cols-7 text-center border-b border-slate-100 bg-slate-50">
                {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (
                <div key={day} className="py-2 text-[10px] font-bold text-slate-400 uppercase">{day}</div>
                ))}
            </div>
            
            <div className="grid grid-cols-7">
                {renderDays()}
            </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <div className="w-3 h-3 bg-sky-50 border border-sky-200 rounded"></div> 
                Online
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <div className="w-3 h-3 bg-emerald-50 border border-emerald-200 rounded"></div> 
                Offline
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <div className="w-3 h-3 bg-rose-50 border border-rose-200 rounded"></div> 
                Livestream
            </div>
        </div>
      </div>

      {selectedCourse && (
        <div className="absolute inset-0 z-10 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedCourse(null)}>
           <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="relative h-32">
                 <img src={selectedCourse.imageUrl} className="w-full h-full object-cover" />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                    <h3 className="text-white font-bold text-lg leading-tight">{selectedCourse.title}</h3>
                 </div>
                 <button onClick={() => setSelectedCourse(null)} className="absolute top-2 right-2 bg-black/40 text-white p-1 rounded-full hover:bg-black/60"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
              </div>
              <div className="p-4 space-y-3">
                 <p className="text-xs text-slate-500 line-clamp-3">{selectedCourse.description}</p>
                 <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                       <p className="text-slate-400 font-bold uppercase text-[9px]">Thời gian</p>
                       <p className="font-semibold text-slate-700">{formatTime(selectedCourse.startTime)} - {formatTime(selectedCourse.endTime)}</p>
                    </div>
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                       <p className="text-slate-400 font-bold uppercase text-[9px]">Hình thức</p>
                       <p className="font-semibold text-slate-700">{selectedCourse.format}</p>
                    </div>
                 </div>
                 <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                    <p className="text-indigo-400 font-bold uppercase text-[9px] mb-1">Địa điểm / Link</p>
                    <p className="font-bold text-indigo-700 text-sm truncate">{selectedCourse.location}</p>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default CourseCalendar;
