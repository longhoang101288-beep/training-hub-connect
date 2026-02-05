
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, Course, Registration } from '../types';

interface DashboardHeaderProps {
  user: User;
  onLogout: () => void;
  dbConnected: boolean;
  courses?: Course[];
  registrations?: Registration[];
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ user, onLogout, dbConnected, courses = [], registrations = [] }) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Generate Notifications based on Data & Role
  useEffect(() => {
    const newNotifs: NotificationItem[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. KA & ADMIN: See Pending Approvals
    if (user.role === UserRole.KA || user.role === UserRole.ADMIN) {
        const pendingCourses = courses.filter(c => c.approvalStatus === 'trainer_approved' || c.approvalStatus === 'pending_trainer').length;
        if (pendingCourses > 0) {
            newNotifs.push({
                id: 'ka-courses',
                title: 'Duyệt Môn Học',
                message: `Có ${pendingCourses} môn học mới đang chờ bạn duyệt.`,
                type: 'warning',
                timestamp: new Date()
            });
        }

        const pendingRegs = registrations.filter(r => r.status === 'pending').length;
        if (pendingRegs > 0) {
            newNotifs.push({
                id: 'ka-regs',
                title: 'Duyệt Đăng Ký',
                message: `Có ${pendingRegs} yêu cầu đăng ký tham gia chờ xử lý.`,
                type: 'info',
                timestamp: new Date()
            });
        }
    }

    // 2. CREATORS (Trainer, PM, RSM, KA): See Status of THEIR created courses
    if (user.role === UserRole.TRAINER || user.role === UserRole.PM || user.role === UserRole.RSM || user.role === UserRole.KA) {
        // A. REJECTED COURSES
        const myRejectedCourses = courses.filter(c => c.creatorRole === user.role && c.approvalStatus === 'rejected');
        if (myRejectedCourses.length > 0) {
            newNotifs.push({
                id: 'creator-rejected',
                title: 'Môn Học Bị Từ Chối',
                message: `Bạn có ${myRejectedCourses.length} môn học bị từ chối. Vui lòng kiểm tra và chỉnh sửa lại.`,
                type: 'error',
                timestamp: new Date()
            });
        }

        // B. APPROVED COURSES (Only upcoming ones to avoid spamming old history)
        const myApprovedCourses = courses.filter(c => {
            const startDate = new Date(c.startDate);
            return c.creatorRole === user.role && 
                   c.approvalStatus === 'approved' &&
                   startDate >= today;
        });

        if (myApprovedCourses.length > 0) {
            newNotifs.push({
                id: 'creator-approved',
                title: 'Môn Học Đã Được Duyệt',
                message: `Chúc mừng! ${myApprovedCourses.length} môn học sắp tới của bạn đã được duyệt và xuất bản lên lịch.`,
                type: 'success',
                timestamp: new Date()
            });
        }
    }

    // 3. REGISTRANTS (RSM/ASM): See Registration Status changes
    // Since we don't have a "read" status in DB, we show status of registrations for upcoming courses
    const myRegs = registrations.filter(r => r.asmId === user.id);
    const confirmedRegs = myRegs.filter(r => r.status === 'confirmed');
    
    // Simple logic: Show summary of confirmed registrations for upcoming courses
    if (confirmedRegs.length > 0) {
        const upcoming = confirmedRegs.filter(r => {
            const course = courses.find(c => c.id === r.courseId);
            if (!course) return false;
            const startDate = new Date(course.startDate);
            return startDate >= today;
        });

        if (upcoming.length > 0) {
            newNotifs.push({
                id: 'reg-confirmed',
                title: 'Đăng Ký Thành Công',
                message: `Bạn có ${upcoming.length} lớp học sắp tới đã được duyệt tham gia. Nhớ kiểm tra lịch nhé!`,
                type: 'success',
                timestamp: new Date()
            });
        }
    }

    setNotifications(newNotifs);
  }, [courses, registrations, user]);

  return (
    <header className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex justify-between items-center sticky top-0 z-50 shadow-sm">
      <div className="flex items-center gap-3 lg:gap-4">
        <div className="bg-indigo-600 p-2 lg:p-2.5 rounded-xl shadow-lg shadow-indigo-200">
          <svg className="w-5 h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg lg:text-xl font-black text-slate-900 leading-none tracking-tight">FTC Hub</h1>
          <p className="hidden lg:block text-[11px] font-bold text-slate-500 uppercase tracking-wide mt-1">Hệ thống đăng ký đào tạo</p>
        </div>
        
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-100 bg-slate-50 ml-2">
            <div className={`w-1.5 h-1.5 rounded-full ${dbConnected ? 'bg-green-500' : 'bg-amber-500'}`}></div>
            <span className={`hidden lg:inline text-[9px] font-bold uppercase ${dbConnected ? 'text-green-700' : 'text-amber-700'}`}>
              {dbConnected ? 'Online' : 'Offline'}
            </span>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-4">
        
        {/* NOTIFICATION BELL */}
        <div className="relative" ref={notifRef}>
            <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all relative"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                {notifications.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-[60] overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 text-sm">Thông Báo</h3>
                        <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-full">{notifications.length} mới</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                                <svg className="w-10 h-10 mx-auto mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                                <p className="text-xs">Không có thông báo mới</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {notifications.map(notif => (
                                    <div key={notif.id} className="p-4 hover:bg-slate-50 transition-colors">
                                        <div className="flex gap-3">
                                            <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                                                notif.type === 'warning' ? 'bg-amber-500' :
                                                notif.type === 'error' ? 'bg-red-500' :
                                                notif.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                                            }`}></div>
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-800 mb-0.5">{notif.title}</h4>
                                                <p className="text-xs text-slate-500 leading-relaxed">{notif.message}</p>
                                                <p className="text-[10px] text-slate-300 mt-2 font-medium">Vừa cập nhật</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

        <div className="text-right hidden sm:block">
          <p className="text-sm font-bold text-slate-900">{user.name}</p>
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-[10px] font-black uppercase px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{user.role}</span>
            {user.region && <span className="text-[10px] text-slate-400 font-medium">{user.region}</span>}
          </div>
        </div>
        
        <div className="relative group">
           <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-slate-200 border-2 border-white shadow-md overflow-hidden">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                  {user.name.charAt(0)}
                </div>
              )}
           </div>
        </div>

        <button 
          onClick={onLogout}
          className="text-slate-400 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50"
          title="Đăng xuất"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </header>
  );
};

export default DashboardHeader;
