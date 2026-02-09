
import { Course, User, UserRole, Registration, FeatureKey, RolePermission } from './types';

// Helper to get dynamic dates relative to today
const getRelativeDate = (dayOffset: number, hour: number = 8, minute: number = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const currentYear = new Date().getFullYear();

export const MOCK_COURSES: Course[] = [
  {
    id: 'c1',
    title: 'Nâng Cao Kỹ Năng Bán Hàng',
    description: 'Làm chủ nghệ thuật chốt đơn và xây dựng mối quan hệ khách hàng.',
    startDate: getRelativeDate(2), // 2 days from now
    endDate: getRelativeDate(3),
    startTime: '08:30',
    endTime: '17:00',
    category: 'Sales',
    imageUrl: 'https://images.unsplash.com/photo-1552581234-26160f608093?auto=format&fit=crop&q=80&w=400',
    targetAudience: 'ASM, Sales Sup, Nhân viên kinh doanh',
    format: 'Offline',
    location: 'Phòng họp Ruby, Tầng 5, VP Hà Nội',
    approvalStatus: 'approved',
    creatorRole: UserRole.TRAINER
  },
  {
    id: 'c2',
    title: 'Kiến Thức Sản Phẩm Mới',
    description: 'Đánh giá chuyên sâu về dòng sản phẩm hè ' + currentYear + ' và các tính năng chính.',
    startDate: getRelativeDate(5),
    endDate: getRelativeDate(5),
    startTime: '09:00',
    endTime: '16:30',
    category: 'Product',
    imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=400',
    targetAudience: 'Toàn bộ nhân viên',
    format: 'Online',
    location: 'Zoom ID: 888 999 1111',
    approvalStatus: 'approved',
    creatorRole: UserRole.PM
  },
  {
    id: 'c3',
    title: 'Lãnh Đạo Hiệu Quả Cho ASM',
    description: 'Phát triển kỹ năng quản lý để dẫn dắt đội ngũ vùng hiệu quả.',
    startDate: getRelativeDate(10),
    endDate: getRelativeDate(12),
    startTime: '08:00',
    endTime: '17:30',
    category: 'Soft Skills',
    imageUrl: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&q=80&w=400',
    targetAudience: 'ASM, Giám đốc vùng',
    format: 'Offline',
    location: 'Trung tâm đào tạo HCM',
    approvalStatus: 'pending_trainer', // Needs trainer approval
    creatorRole: UserRole.RSM
  },
  {
    id: 'c4',
    title: 'Căn Bản Tiếp Thị Kỹ Thuật Số',
    description: 'Hiểu về mạng xã hội và tìm kiếm địa phương để tăng trưởng vùng.',
    startDate: getRelativeDate(15),
    endDate: getRelativeDate(15),
    startTime: '13:00',
    endTime: '17:00',
    category: 'Marketing',
    imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=400',
    targetAudience: 'Marketing Team, ASM',
    format: 'Online',
    location: 'Google Meet: meet.google.com/abc-xyz-123',
    approvalStatus: 'trainer_approved', // Needs KA approval
    creatorRole: UserRole.TRAINER
  }
];

export const ASM_REGIONS = ['Miền Bắc 1', 'Miền Bắc 2', 'Hà Nội', 'Hồ Chí Minh', 'Miền Trung', 'Miền Đông', 'Miền Tây'];
export const TRAINER_REGIONS = ['Miền Bắc', 'Miền Trung', 'Miền Nam'];

export const INITIAL_USERS: User[] = [
  { id: 'u1', username: 'admin', password: 'admin', name: 'Hệ Thống Admin', role: UserRole.ADMIN },
  { id: 'u2', username: 'asm_hanoi', password: 'password', name: 'ASM Hà Nội', role: UserRole.ASM, region: 'Hà Nội' },
  { id: 'u3', username: 'asm_hcm', password: 'password', name: 'ASM HCM', role: UserRole.ASM, region: 'Hồ Chí Minh' },
  { id: 'u4', username: 'trainer_bac', password: 'password', name: 'GV Miền Bắc', role: UserRole.TRAINER, region: 'Miền Bắc' },
  // New Roles
  { id: 'u5', username: 'rsm_mienbac', password: 'password', name: 'RSM Miền Bắc', role: UserRole.RSM, region: 'Miền Bắc 1' },
  { id: 'u6', username: 'pm_product', password: 'password', name: 'Product Manager', role: UserRole.PM },
  { id: 'u7', username: 'ka_manager', password: 'password', name: 'Key Account Mgr', role: UserRole.KA },
];

export const MOCK_REGISTRATIONS: Registration[] = [
  { id: 'r_mock_1', courseId: 'c1', asmId: 'u2', region: 'Hà Nội', date: MOCK_COURSES[0].startDate, status: 'confirmed' },
  { id: 'r_mock_2', courseId: 'c2', asmId: 'u2', region: 'Hà Nội', date: MOCK_COURSES[1].startDate, status: 'pending' },
  { id: 'r_mock_3', courseId: 'c3', asmId: 'u3', region: 'Hồ Chí Minh', date: MOCK_COURSES[2].startDate, status: 'confirmed' },
  { id: 'r_mock_4', courseId: 'c1', asmId: 'u5', region: 'Miền Bắc 1', date: MOCK_COURSES[0].startDate, status: 'confirmed' }
];

// --- PERMISSIONS CONFIG ---

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  tab_calendar: 'Xem Lịch Đào Tạo',
  tab_catalog: 'Xem/Đăng Ký Môn Học',
  tab_registrations: 'Môn Đã Đăng Ký',
  tab_users: 'Quản Lý Users (Admin)',
  tab_profile: 'Trang Cá Nhân',
  // tab_settings removed
  tab_manage_courses: 'Tạo/Quản Lý Môn Học',
  tab_course_approvals: 'Duyệt Môn & Đăng Ký',
  tab_tools: 'Tab Công Cụ & Tiện Ích',
  tool_webex: 'Tạo Link Họp Webex',
  tool_attendance: 'Quản Lý Điểm Danh',
  tool_statistics: 'Xem Báo Cáo Thống Kê',
  config_popup: 'Cấu Hình Popup (Admin/KA)',
  config_webex: 'Cấu Hình Webex (Admin)',
  manage_roles: 'Quản Lý Phân Quyền (Admin)'
};

export const DEFAULT_ROLE_PERMISSIONS: RolePermission[] = [
  {
    role: UserRole.ADMIN,
    features: ['tab_calendar', 'tab_users', 'tab_profile', 'tab_manage_courses', 'tab_course_approvals', 'tab_tools', 'tool_webex', 'tool_attendance', 'tool_statistics', 'config_popup', 'config_webex', 'manage_roles']
  },
  {
    role: UserRole.ASM,
    features: ['tab_calendar', 'tab_profile', 'tab_tools', 'tool_attendance', 'tool_statistics'] 
  },
  {
    role: UserRole.TRAINER,
    features: ['tab_calendar', 'tab_manage_courses', 'tab_profile', 'tab_tools', 'tool_webex', 'tool_attendance', 'tool_statistics'] 
  },
  {
    role: UserRole.RSM,
    features: ['tab_calendar', 'tab_catalog', 'tab_registrations', 'tab_manage_courses', 'tab_profile', 'tab_tools', 'tool_attendance', 'tool_statistics'] 
  },
  {
    role: UserRole.PM,
    features: ['tab_calendar', 'tab_manage_courses', 'tab_profile', 'tab_tools', 'tool_attendance', 'tool_statistics'] 
  },
  {
    role: UserRole.KA,
    features: ['tab_calendar', 'tab_manage_courses', 'tab_course_approvals', 'tab_profile', 'tab_tools', 'tool_webex', 'tool_attendance', 'tool_statistics', 'config_popup']
  }
];
