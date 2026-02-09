
import React from 'react';
import { UserRole, RolePermission, FeatureKey } from '../types';

interface BottomNavigationProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  role: UserRole;
  permissions: RolePermission[];
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, setActiveTab, role, permissions }) => {
  
  // Helper to check if current role has a specific feature
  const hasPerm = (feature: FeatureKey) => {
    const rolePerm = permissions.find(p => p.role === role);
    return rolePerm?.features.includes(feature);
  };

  const allItems = [
    {
      id: 'calendar',
      featureKey: 'tab_calendar' as FeatureKey,
      label: 'Lịch',
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
    },
    {
      id: 'trainer-schedule',
      featureKey: 'tab_trainer_schedule' as FeatureKey,
      label: 'Lịch GV',
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
    },
    {
      id: 'manage-courses',
      featureKey: 'tab_manage_courses' as FeatureKey,
      label: 'QL Môn',
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
    },
    {
      id: 'catalog',
      featureKey: 'tab_catalog' as FeatureKey,
      label: 'Đăng Ký',
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
    },
    {
      id: 'course-approvals',
      featureKey: 'tab_course_approvals' as FeatureKey,
      label: 'Duyệt',
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
    },
    {
      id: 'tools',
      featureKey: 'tab_tools' as FeatureKey,
      label: 'Công cụ',
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
    },
    {
      id: 'profile',
      featureKey: 'tab_profile' as FeatureKey,
      label: 'Cá nhân',
      icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
    }
  ];

  // Filter items based on permissions
  const visibleItems = allItems.filter(item => hasPerm(item.featureKey));

  // Max 5 items for bottom nav to look good
  const displayedItems = visibleItems.slice(0, 5);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 lg:hidden z-40 pb-safe">
      <div className="flex justify-around items-center h-16">
        {displayedItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              activeTab === item.id ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className={`p-1 rounded-xl transition-all ${activeTab === item.id ? 'bg-indigo-50' : ''}`}>
               {item.icon}
            </div>
            <span className="text-[10px] font-bold tracking-tight">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BottomNavigation;
