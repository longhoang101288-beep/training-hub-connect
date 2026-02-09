
export enum UserRole {
  ADMIN = 'ADMIN',
  ASM = 'ASM',
  TRAINER = 'TRAINER',
  RSM = 'RSM',
  PM = 'PM',
  KA = 'KA'
}

export interface User {
  id: string;
  username: string;
  password?: string;
  name: string;
  role: UserRole;
  region?: string;
  // New fields for Profile & Settings
  avatarUrl?: string;
  email?: string;
  phone?: string;
  bio?: string;
  preferences?: {
    emailNotification: boolean;
    browserNotification: boolean;
    compactMode: boolean;
    themeColor?: 'indigo' | 'rose' | 'emerald' | 'blue' | 'amber';
    language?: 'vi' | 'en';
  };
}

export type CourseApprovalStatus = 'pending_trainer' | 'trainer_approved' | 'approved' | 'rejected';

export interface Course {
  id: string;
  title: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  category: string;
  imageUrl: string;
  targetAudience: string; // Đối tượng tham gia
  format: 'Online' | 'Offline' | 'Livestream'; // Hình thức đào tạo
  location: string; // Địa điểm (Link Zoom hoặc Phòng họp)
  approvalStatus: CourseApprovalStatus; // Trạng thái duyệt của môn học
  creatorRole?: UserRole; // Người tạo
}

export interface Registration {
  id: string;
  courseId: string;
  asmId: string; // ID của người đăng ký (có thể là RSM)
  region: string;
  date: string;
  status: 'pending' | 'confirmed';
}

export interface PopupConfig {
  isActive: boolean;
  imageUrl: string;
  linkUrl: string;
}

export interface WebexConfig {
  url: string;
  username: string;
  password: string;
}

export interface SystemSettings {
  popup: PopupConfig;
  webex?: WebexConfig;
}

export interface AttendanceRecord {
  id: string; // ID
  date: string; // Ngày
  checkIn: string; // Check in
  checkOut: string; // Check out
  courseName: string; // Môn học
  fullName: string; // Họ và Tên
  insideId: string; // Inside
  shopAddress: string; // Địa chỉ shop làm việc
  email: string; // Email
  asm: string; // ASM
  asmEmail: string; // Email ASM
  feedback: string; // Feedback
  rating?: number; // Optional
}

export interface DaySchedule {
  morning: string;
  afternoon: string;
}

export interface WeeklyWorkSchedule {
  id: string; // Format: user_id + year + week (e.g., u4_2024_25)
  userId: string;
  year: number;
  weekNumber: number;
  days: {
    monday: DaySchedule;
    tuesday: DaySchedule;
    wednesday: DaySchedule;
    thursday: DaySchedule;
    friday: DaySchedule;
    saturday: DaySchedule;
  };
  updatedAt: string;
}

// --- PERMISSION SYSTEM ---
export type FeatureKey = 
  | 'tab_calendar' 
  | 'tab_catalog' 
  | 'tab_registrations' 
  | 'tab_users' 
  | 'tab_profile' 
  // | 'tab_settings'  <-- Temporarily removed
  | 'tab_manage_courses' 
  | 'tab_course_approvals' 
  | 'tab_tools'
  | 'tab_trainer_schedule' // New: View Trainer Schedule Tab
  | 'tool_webex' 
  | 'tool_attendance' 
  | 'tool_statistics'
  | 'tool_work_schedule' // New: Input Work Schedule Tool
  | 'config_popup'
  | 'config_webex'
  | 'manage_roles'; // New: Access Role Management

export interface RolePermission {
  role: UserRole;
  features: FeatureKey[];
}
