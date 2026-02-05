
import { Course, User, UserRole } from './types';

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
