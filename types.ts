
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

export interface SystemSettings {
  popup: PopupConfig;
}
