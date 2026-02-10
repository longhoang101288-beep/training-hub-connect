
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, Course, Registration, SystemSettings, PopupConfig, CourseApprovalStatus, AttendanceRecord, WebexConfig, FeatureKey, RolePermission, WeeklyWorkSchedule } from './types';
import { ASM_REGIONS, TRAINER_REGIONS, INITIAL_USERS, MOCK_COURSES, MOCK_REGISTRATIONS, DEFAULT_ROLE_PERMISSIONS, FEATURE_LABELS } from './constants';
import DashboardHeader from './components/DashboardHeader';
import CourseCalendar from './components/CourseCalendar';
import BottomNavigation from './components/BottomNavigation';
import { generateTrainingPlanSummary } from './services/geminiService';
import { fetchAllData, saveToSheet, seedDatabase } from './services/googleSheetService';
import * as XLSX from 'xlsx';

const App: React.FC = () => {
  // Loading State
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false); 
  
  // Use Ref to track saving state in closures (setInterval)
  const [isSaving, _setIsSaving] = useState(false); 
  const isSavingRef = useRef(false);
  const setIsSaving = (val: boolean) => {
      isSavingRef.current = val;
      _setIsSaving(val);
  };

  const [dbConnected, setDbConnected] = useState(false);

  // Data States
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>(DEFAULT_ROLE_PERMISSIONS);
  const [workSchedules, setWorkSchedules] = useState<WeeklyWorkSchedule[]>([]);
  
  // System Settings State (Popup & Webex) - Still loaded for background system use
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    popup: { isActive: false, imageUrl: '', linkUrl: '' },
    webex: { url: '', username: '', password: '' }
  });
  const [showGlobalPopup, setShowGlobalPopup] = useState(false);
  
  // Forms for Settings
  const [popupConfigForm, setPopupConfigForm] = useState<PopupConfig>({ isActive: false, imageUrl: '', linkUrl: '' });
  const [webexConfigForm, setWebexConfigForm] = useState<WebexConfig>({ url: '', username: '', password: '' });
  
  // Ref to track if user is currently editing settings
  const isEditingConfig = useRef(false);

  // Initialize currentUser
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('currentUser');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });

  const [isLoginView, setIsLoginView] = useState(true);
  const [activeTab, setActiveTab] = useState<'catalog' | 'calendar' | 'registrations' | 'users' | 'profile' | 'manage-courses' | 'approvals' | 'course-approvals' | 'tools' | 'manage-roles' | 'trainer-schedule'>('calendar');
  
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  
  // Form States
  const [authData, setAuthData] = useState({ 
    username: '', 
    password: '', 
    name: '', 
    role: UserRole.ASM, 
    region: ASM_REGIONS[0] 
  });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // State for adding User
  const [newUser, setNewUser] = useState<Partial<User>>({
    username: '',
    password: '',
    name: '',
    role: UserRole.ASM, 
    region: ASM_REGIONS[0]
  });
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Settings & Profile Form Data
  const [profileData, setProfileData] = useState<Partial<User>>({});
  
  // Add Course State
  const [newCourse, setNewCourse] = useState<Partial<Course>>({
    title: '',
    description: '',
    category: 'Sales',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    targetAudience: '',
    format: 'Online',
    location: '',
    imageUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=400'
  });
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  
  // Edit Course State
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // --- TOOL STATES ---
  const [activeTool, setActiveTool] = useState<'statistics' | 'attendance' | 'webex' | 'config_webex' | 'config_popup' | 'work_schedule' | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);

  // --- WORK SCHEDULE STATES ---
  const [viewScheduleDate, setViewScheduleDate] = useState(new Date()); // Controls which week is shown in 'trainer-schedule'
  const [editScheduleDate, setEditScheduleDate] = useState(new Date()); // Controls which week is being edited in modal
  const [scheduleForm, setScheduleForm] = useState<WeeklyWorkSchedule | null>(null);

  // --- DYNAMIC PERMISSION CHECK ---
  const hasPermission = (feature: FeatureKey) => {
    if (!currentUser) return false;
    // Admins always have certain permissions
    if (currentUser.role === UserRole.ADMIN && feature === 'manage_roles') return true;
    
    const roleConfig = rolePermissions.find(rp => rp.role === currentUser.role);
    if (!roleConfig) {
       // Fallback for new roles not in DB yet
       return DEFAULT_ROLE_PERMISSIONS.find(rp => rp.role === currentUser.role)?.features.includes(feature) || false;
    }
    return roleConfig.features.includes(feature);
  };

  // --- DATA LOADING ---
  const loadData = async (isBackground = false) => {
    if (isBackground && (isEditingConfig.current || isSavingRef.current)) {
        return;
    }

    if (!isBackground) setIsLoading(true);
    else setIsSyncing(true);

    try {
      const data = await fetchAllData();
      
      if (isBackground && (isEditingConfig.current || isSavingRef.current)) {
          return;
      }

      if (data) {
        setUsers(data.users || []);
        setCourses(data.courses || []);
        setRegistrations(data.registrations || []);
        
        // --- ROBUST PERMISSION MERGING LOGIC ---
        // We use DEFAULT_ROLE_PERMISSIONS as the source of truth for structure
        // We overlay DB permissions on top, but ensure new features are injected if missing
        const loadedPerms = data.rolePermissions || [];
        const mergedPermissions = DEFAULT_ROLE_PERMISSIONS.map(defPerm => {
            const dbPerm = loadedPerms.find((p: any) => p.role === defPerm.role);
            
            // If DB doesn't have this role yet, return default
            if (!dbPerm) return defPerm;

            // Ensure features is an array
            const dbFeatures = Array.isArray(dbPerm.features) ? dbPerm.features : [];
            
            // Identify features that are in Default but NOT in DB
            // We only force-add specific new features to avoid re-enabling restricted ones
            const keysToForce: FeatureKey[] = ['tab_trainer_schedule', 'tool_work_schedule'];
            const missingRequiredFeatures = keysToForce.filter(k => defPerm.features.includes(k) && !dbFeatures.includes(k));
            
            return {
                ...dbPerm,
                features: [...dbFeatures, ...missingRequiredFeatures]
            };
        });
        
        setRolePermissions(mergedPermissions);
        setWorkSchedules(data.workSchedules || []);
        
        const loadedSettings: SystemSettings = {
            popup: data.settings?.popup || { isActive: false, imageUrl: '', linkUrl: '' },
            webex: data.settings?.webex || { url: '', username: '', password: '' }
        };

        setSystemSettings(loadedSettings);
        
        if (!isEditingConfig.current) {
            setPopupConfigForm(loadedSettings.popup);
            setWebexConfigForm(loadedSettings.webex || { url: '', username: '', password: '' });
        }
        
        setDbConnected(true);
      } else {
        throw new Error("No data received");
      }
    } catch (error) {
      if (!isBackground) {
        console.warn("Không thể kết nối Database. Chuyển sang chế độ Offline với dữ liệu mẫu.");
        setUsers(INITIAL_USERS);
        setCourses(MOCK_COURSES);
        setRegistrations(MOCK_REGISTRATIONS);
        setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
        setDbConnected(false);
      }
    } finally {
      if (!isBackground) setIsLoading(false);
      else setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => { loadData(true); }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentUser && systemSettings.popup.isActive) {
        setShowGlobalPopup(true);
    }
  }, [currentUser, systemSettings.popup.isActive]);

  useEffect(() => {
    if (currentUser) {
      setProfileData({
        name: currentUser.name,
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        bio: currentUser.bio || '',
        password: currentUser.password,
        preferences: currentUser.preferences || {
           emailNotification: true,
           browserNotification: false,
           compactMode: false,
           themeColor: 'indigo',
           language: 'vi'
        }
      });

      // Default tab logic
      if (activeTab === 'calendar') {
          // Only switch if the user actually has permission for the clearer specific tab
          // But keep calendar as default if they just logged in
      }
    }
  }, [currentUser]); 

  // --- HELPER FUNCTIONS ---
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

  // Get ISO Week Number
  const getWeekNumber = (d: Date) => {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
      return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
  };

  // Get Start and End of week
  const getWeekRange = (date: Date) => {
      const curr = new Date(date);
      const first = curr.getDate() - curr.getDay() + 1; // First day is the day of the month - the day of the week + 1
      const last = first + 5; // last day is the first day + 6

      const firstday = new Date(curr.setDate(first));
      const lastday = new Date(curr.setDate(last));
      
      return { start: firstday, end: lastday };
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'course' | 'user' | 'course_edit' | 'popup') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("Vui lòng chọn file ảnh!");
      return;
    }

    if (target === 'popup') {
        isEditingConfig.current = true;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const MAX_WIDTH = target === 'popup' ? 800 : 400; 
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = height * (MAX_WIDTH / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        const base64Data = canvas.toDataURL('image/png', target === 'popup' ? 0.9 : 0.7);
        
        if (target === 'course') {
          setNewCourse(prev => ({ ...prev, imageUrl: base64Data }));
          setImagePreview(base64Data);
        } else if (target === 'course_edit') {
          setEditingCourse(prev => prev ? ({ ...prev, imageUrl: base64Data }) : null);
          setImagePreview(base64Data);
        } else if (target === 'user') {
          if (currentUser) {
             const updatedUser = { ...currentUser, avatarUrl: base64Data };
             setCurrentUser(updatedUser);
             localStorage.setItem('currentUser', JSON.stringify(updatedUser));
             saveToSheet("Users", updatedUser, "update");
          }
        } else if (target === 'popup') {
          setPopupConfigForm(prev => ({ ...prev, imageUrl: base64Data }));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleDownloadTemplate = () => {
     const headers = [ { "ID": "VD: 1001", "Ngày": "2024-06-15", "Check in": "08:00", "Check out": "17:00", "Môn học": "Kỹ năng bán hàng", "Họ và Tên": "Nguyễn Văn A", "Inside": "SGN001", "Địa chỉ shop làm việc": "123 Đường ABC", "Email": "nhanvien@email.com", "ASM": "ASM Khu Vực 1", "Email ASM": "asm@email.com", "Feedback": "Bài học bổ ích" } ];
     const ws = XLSX.utils.json_to_sheet(headers);
     const wscols = [ {wch: 10}, {wch: 12}, {wch: 10}, {wch: 10}, {wch: 25}, {wch: 20}, {wch: 10}, {wch: 25}, {wch: 25}, {wch: 15}, {wch: 25}, {wch: 30} ];
     ws['!cols'] = wscols;
     const wb = XLSX.utils.book_new();
     XLSX.utils.book_append_sheet(wb, ws, "Mau_Diem_Danh");
     XLSX.writeFile(wb, "FTC_Mau_Diem_Danh_Dao_Tao.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsProcessingFile(true);
      setUploadStatus('idle');
      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const bstr = evt.target?.result;
              const wb = XLSX.read(bstr, { type: 'binary' });
              const wsname = wb.SheetNames[0];
              const ws = wb.Sheets[wsname];
              const data = XLSX.utils.sheet_to_json(ws);
              const mappedData: AttendanceRecord[] = data.map((row: any, index: number) => ({
                  id: row['ID'] || `att_${Date.now()}_${index}`,
                  date: row['Ngày'] || row['Date'] || new Date().toLocaleDateString('vi-VN'),
                  checkIn: row['Check in'] || '--:--',
                  checkOut: row['Check out'] || '--:--',
                  courseName: row['Môn học'] || row['Course'] || 'Không tên',
                  fullName: row['Họ và Tên'] || row['Full Name'] || 'Unknown',
                  insideId: row['Inside'] || row['Inside ID'] || '',
                  shopAddress: row['Địa chỉ shop làm việc'] || row['Shop'] || '',
                  email: row['Email'] || '',
                  asm: row['ASM'] || '',
                  asmEmail: row['Email ASM'] || '',
                  feedback: row['Feedback'] || row['Góp ý'] || '',
                  rating: parseInt(row['Rating'] || row['Điểm'] || '0')
              }));
              setAttendanceData(mappedData);
          } catch (error) {
              console.error("Error reading file:", error);
              alert("Lỗi đọc file. Vui lòng kiểm tra định dạng Excel/CSV.");
          } finally {
              setIsProcessingFile(false);
          }
      };
      reader.readAsBinaryString(file);
  };

  const handleSyncAttendance = async () => {
      if (attendanceData.length === 0) return;
      if (!confirm(`Bạn có chắc chắn muốn lưu ${attendanceData.length} bản ghi vào Database (Sheet 'Attendance') không?`)) return;
      setUploadStatus('uploading');
      setUploadProgress(0);
      let successCount = 0;
      const total = attendanceData.length;
      for (let i = 0; i < total; i++) {
          const record = attendanceData[i];
          const payload = { "ID": record.id, "Ngày": record.date, "Check in": record.checkIn, "Check out": record.checkOut, "Môn học": record.courseName, "Họ và Tên": record.fullName, "Inside": record.insideId, "Địa chỉ shop làm việc": record.shopAddress, "Email": record.email, "ASM": record.asm, "Email ASM": record.asmEmail, "Feedback": record.feedback };
          const success = await saveToSheet("Attendance", payload, "add");
          if (success) successCount++;
          setUploadProgress(Math.round(((i + 1) / total) * 100));
          await new Promise(r => setTimeout(r, 200)); 
      }
      if (successCount === total) { setUploadStatus('success'); alert(`Đã lưu thành công ${successCount}/${total} bản ghi!`); } else { setUploadStatus('error'); alert(`Hoàn tất với lỗi. Đã lưu ${successCount}/${total} bản ghi.`); }
  };

  // --- WORK SCHEDULE LOGIC ---
  const initScheduleForm = (date: Date) => {
      if (!currentUser) return;
      const weekNum = getWeekNumber(date);
      const year = date.getFullYear();
      const id = `${currentUser.id}_${year}_${weekNum}`;
      
      const existing = workSchedules.find(ws => ws.id === id);
      
      if (existing) {
          setScheduleForm(JSON.parse(JSON.stringify(existing))); // Deep copy
      } else {
          setScheduleForm({
              id,
              userId: currentUser.id,
              year,
              weekNumber: weekNum,
              updatedAt: new Date().toISOString(),
              days: {
                  monday: { morning: '', afternoon: '' },
                  tuesday: { morning: '', afternoon: '' },
                  wednesday: { morning: '', afternoon: '' },
                  thursday: { morning: '', afternoon: '' },
                  friday: { morning: '', afternoon: '' },
                  saturday: { morning: '', afternoon: '' }
              }
          });
      }
      setEditScheduleDate(date);
      setActiveTool('work_schedule');
  };

  const handleSaveWorkSchedule = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!scheduleForm) return;
      setIsSaving(true);
      
      const payload = { ...scheduleForm, updatedAt: new Date().toISOString() };
      const success = await saveToSheet("WorkSchedules", payload, "update");
      
      if (success) {
          setWorkSchedules(prev => {
              const idx = prev.findIndex(ws => ws.id === payload.id);
              if (idx >= 0) {
                  const newArr = [...prev];
                  newArr[idx] = payload;
                  return newArr;
              }
              return [...prev, payload];
          });
          alert("Lưu lịch làm việc thành công!");
          setActiveTool(null);
      } else {
          alert("Lỗi khi lưu lịch làm việc.");
      }
      setIsSaving(false);
  };

  const calculateStatistics = () => {
      if (!courses.length || !registrations.length) return null;
      const totalCourses = courses.length;
      const upcomingCourses = courses.filter(c => new Date(c.startDate) >= new Date()).length;
      const categoryCount: Record<string, number> = {};
      courses.forEach(c => { categoryCount[c.category] = (categoryCount[c.category] || 0) + 1; });
      const categories = Object.keys(categoryCount).map(key => ({ name: key, count: categoryCount[key], percent: Math.round((categoryCount[key] / totalCourses) * 100) })).sort((a, b) => b.count - a.count);
      const totalRegistrations = registrations.length;
      const approvedRegistrations = registrations.filter(r => r.status === 'confirmed').length;
      const approvalRate = totalRegistrations > 0 ? Math.round((approvedRegistrations / totalRegistrations) * 100) : 0;
      const regionStats: Record<string, number> = {};
      registrations.forEach(r => { const region = r.region || 'Khác'; regionStats[region] = (regionStats[region] || 0) + 1; });
      const topRegions = Object.keys(regionStats).map(key => ({ name: key, count: regionStats[key], percent: Math.round((regionStats[key] / totalRegistrations) * 100) })).sort((a, b) => b.count - a.count);
      return { totalCourses, upcomingCourses, totalRegistrations, approvedRegistrations, approvalRate, categories, topRegions };
  };

  const handleSeedData = async () => {
    if(!confirm("XÁC NHẬN KHÔI PHỤC:\n\nHệ thống sẽ xóa toàn bộ dữ liệu hiện tại trên Google Sheet và tạo lại tài khoản Admin (admin/admin) cùng dữ liệu mẫu.\n\nBạn có chắc chắn không?")) return;
    
    setIsLoading(true);
    setIsSaving(true); 

    try { 
        await seedDatabase(INITIAL_USERS, MOCK_COURSES); 
        await delay(5000); 
        alert("Khôi phục thành công! Hệ thống đang tải lại dữ liệu mới.");
        await loadData(); 
    } catch (error) { 
        console.error(error); 
        alert("Có lỗi khi tạo dữ liệu mẫu."); 
    } finally { 
        setIsLoading(false);
        setIsSaving(false); 
    }
  };

  const handleRoleChange = (role: UserRole) => {
    const defaultRegion = (role === UserRole.TRAINER) ? TRAINER_REGIONS[0] : ASM_REGIONS[0];
    setAuthData({ ...authData, role, region: defaultRegion });
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true); 
    isEditingConfig.current = false;
    try {
      if (isLoginView) {
        const freshData = await fetchAllData();
        let usersToCheck = users;
        // Merge permissions logic for login phase as well
        if (freshData && freshData.users) {
           setUsers(freshData.users); setCourses(freshData.courses || []); setRegistrations(freshData.registrations || []);
           const loadedSettings = { popup: freshData.settings?.popup || { isActive: false, imageUrl: '', linkUrl: '' }, webex: freshData.settings?.webex || { url: '', username: '', password: '' } };
           setSystemSettings(loadedSettings); setDbConnected(true); usersToCheck = freshData.users;
           
           if(freshData.rolePermissions && freshData.rolePermissions.length > 0) {
               // Apply robust merge
               const mergedPermissions = DEFAULT_ROLE_PERMISSIONS.map(defPerm => {
                    const dbPerm = freshData.rolePermissions.find((p: any) => p.role === defPerm.role);
                    if (!dbPerm) return defPerm;
                    const dbFeatures = Array.isArray(dbPerm.features) ? dbPerm.features : [];
                    const keysToForce: FeatureKey[] = ['tab_trainer_schedule', 'tool_work_schedule'];
                    const missingRequiredFeatures = keysToForce.filter(k => defPerm.features.includes(k) && !dbFeatures.includes(k));
                    return { ...dbPerm, features: [...dbFeatures, ...missingRequiredFeatures] };
               });
               setRolePermissions(mergedPermissions);
           } else {
               setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
           }
           
           if(freshData.workSchedules) setWorkSchedules(freshData.workSchedules);
        }

        if (!usersToCheck || usersToCheck.length === 0) { if (confirm("CẢNH BÁO: Dữ liệu người dùng trên Google Sheet đang TRỐNG (có thể do bị xóa).\n\nBạn có muốn KHÔI PHỤC lại tài khoản Admin và dữ liệu mẫu ngay bây giờ không?")) { await handleSeedData(); setIsLoggingIn(false); return; } }
        const inputUsername = authData.username.trim().toLowerCase();
        const inputPassword = authData.password.trim();
        const user = usersToCheck.find(u => String(u.username).trim().toLowerCase() === inputUsername && String(u.password).trim() === inputPassword );
        if (user) {
          setCurrentUser(user); localStorage.setItem('currentUser', JSON.stringify(user));
        } else { alert("Sai tên đăng nhập hoặc mật khẩu! (Lưu ý: Nếu đang Offline, chỉ dùng được tài khoản mẫu trong code)"); }
      } else {
        if (users.find(u => u.username === authData.username)) { alert("Tên đăng nhập đã tồn tại!"); setIsLoggingIn(false); return; }
        const newUser: User = { id: Math.random().toString(36).substr(2, 9), username: authData.username, password: authData.password, name: authData.name, role: authData.role, region: (authData.role as UserRole) === UserRole.ADMIN ? '' : authData.region, preferences: { emailNotification: true, browserNotification: false, compactMode: false } };
        setUsers([...users, newUser]); setCurrentUser(newUser); localStorage.setItem('currentUser', JSON.stringify(newUser)); setActiveTab('calendar'); await saveToSheet("Users", newUser, "add");
      }
    } catch (error) { console.error(error); alert("Có lỗi xảy ra trong quá trình đăng nhập."); } finally { setIsLoggingIn(false); }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); if (!currentUser) return; setIsSaving(true);
    const updatedUser: User = { ...currentUser, name: profileData.name || currentUser.name, email: profileData.email, phone: profileData.phone, bio: profileData.bio, password: profileData.password || currentUser.password, preferences: profileData.preferences };
    setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u)); setCurrentUser(updatedUser); localStorage.setItem('currentUser', JSON.stringify(updatedUser)); await saveToSheet("Users", updatedUser, "update"); setIsSaving(false); alert("Cập nhật thông tin thành công!");
  };

  // --- SAVE SYSTEM CONFIG (Webex & Popup) ---
  const handleSaveWebexConfig = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSaving(true);
      const success = await saveToSheet("Webex", webexConfigForm, "update");
      if (success) {
          setSystemSettings(prev => ({ ...prev, webex: webexConfigForm }));
          alert("Đã lưu cấu hình Webex thành công!");
      } else {
          alert("Lỗi khi lưu cấu hình Webex.");
      }
      setIsSaving(false);
      isEditingConfig.current = false;
      setActiveTool(null);
  };

  const handleSavePopupConfig = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSaving(true);
      const success = await saveToSheet("Settings", popupConfigForm, "update");
      if (success) {
          setSystemSettings(prev => ({ ...prev, popup: popupConfigForm }));
          alert("Đã lưu cấu hình Popup thành công!");
      } else {
          alert("Lỗi khi lưu cấu hình Popup.");
      }
      setIsSaving(false);
      isEditingConfig.current = false;
      setActiveTool(null);
  };

  const handleAdminUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editingUser) return;
    setUsers(users.map(u => u.id === editingUser.id ? editingUser : u)); setIsSaving(true); await saveToSheet("Users", editingUser, "update"); setIsSaving(false); setEditingUser(null); alert("Cập nhật thông tin user thành công!"); setTimeout(() => loadData(true), 1500);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault(); if (users.find(u => u.username === newUser.username)) { alert("Tên đăng nhập đã tồn tại!"); return; }
    const userToAdd: User = { id: 'u' + Date.now(), username: newUser.username || '', password: newUser.password || '123456', name: newUser.name || '', role: newUser.role as UserRole, region: (newUser.role as UserRole) === UserRole.ADMIN ? '' : newUser.region, preferences: { emailNotification: true, browserNotification: false, compactMode: false } };
    setUsers([...users, userToAdd]); setIsAddingUser(false); setNewUser({ username: '', password: '', name: '', role: UserRole.ASM, region: ASM_REGIONS[0] }); setIsSaving(true); await saveToSheet("Users", userToAdd, "add"); setIsSaving(false); alert("Thêm người dùng thành công!"); setTimeout(() => loadData(true), 1500);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("CẢNH BÁO: Bạn có chắc chắn muốn XÓA người dùng này?\nHành động này sẽ xóa vĩnh viễn và không thể hoàn tác.")) return;
    setIsSaving(true); setUsers(prev => prev.filter(u => u.id !== userId)); const success = await saveToSheet("Users", { id: userId }, "delete"); setIsSaving(false); if (success) { setTimeout(() => loadData(true), 1500); } else { alert("Lỗi: Không thể xóa người dùng trên hệ thống."); loadData(true); }
  };

  const handleLogout = () => {
    setCurrentUser(null); localStorage.removeItem('currentUser'); setShowGlobalPopup(false); setAuthData({ username: '', password: '', name: '', role: UserRole.ASM, region: ASM_REGIONS[0] });
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault(); if(!currentUser) return; setIsSaving(true);
    const initialStatus: CourseApprovalStatus = 'trainer_approved';
    const course: Course = { id: 'c' + Date.now(), title: newCourse.title || '', description: newCourse.description || '', category: newCourse.category || 'Other', startDate: newCourse.startDate || '', endDate: newCourse.endDate || '', startTime: newCourse.startTime || '', endTime: newCourse.endTime || '', targetAudience: newCourse.targetAudience || 'Tất cả', format: newCourse.format as 'Online' | 'Offline' | 'Livestream' || 'Online', location: newCourse.location || '', imageUrl: newCourse.imageUrl || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=400', approvalStatus: initialStatus, creatorRole: currentUser.role };
    setCourses([course, ...courses]); setIsAddingCourse(false); setNewCourse({ title: '', description: '', category: 'Sales', startDate: '', endDate: '', startTime: '', endTime: '', targetAudience: '', format: 'Online', location: '', imageUrl: '' }); setImagePreview(null); await saveToSheet("Courses", course, "add"); setIsSaving(false); alert("Đã gửi yêu cầu tạo môn (Chờ KA duyệt chốt)!");
  };

  const handleUpdateCourse = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editingCourse) return; setIsSaving(true);
    const updatedCourse: Course = { ...editingCourse, approvalStatus: editingCourse.approvalStatus === 'rejected' ? 'trainer_approved' : editingCourse.approvalStatus };
    setCourses(prev => prev.map(c => c.id === editingCourse.id ? updatedCourse : c)); const success = await saveToSheet("Courses", updatedCourse, "update");
    if (success) { setTimeout(async () => { await loadData(true); setIsSaving(false); setEditingCourse(null); alert(editingCourse.approvalStatus === 'rejected' ? "Đã cập nhật và gửi lại yêu cầu phê duyệt!" : "Cập nhật môn học thành công! Dữ liệu đã được đồng bộ."); }, 1500); } else { setIsSaving(false); setEditingCourse(null); alert("Đã gửi yêu cầu cập nhật."); }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!confirm("CẢNH BÁO: Bạn có chắc chắn muốn XÓA môn học này?\nHành động này sẽ xóa vĩnh viễn và không thể hoàn tác.")) return;
    setIsSaving(true); setCourses(prev => prev.filter(c => c.id !== courseId)); const success = await saveToSheet("Courses", { id: courseId }, "delete"); setIsSaving(false); if (success) { setTimeout(() => loadData(true), 1500); } else { alert("Lỗi: Không thể xóa môn học trên hệ thống."); loadData(true); }
  };

  const handleCourseApproval = async (course: Course, newStatus: CourseApprovalStatus) => {
      const updatedCourse = { ...course, approvalStatus: newStatus }; setCourses(prev => prev.map(c => c.id === course.id ? updatedCourse : c)); await saveToSheet("Courses", updatedCourse, "update");
      if (newStatus === 'rejected') { alert("Đã từ chối môn học này."); } else if (newStatus === 'trainer_approved') { alert("Đã duyệt (Chờ KA duyệt chốt)."); } else { alert("Đã duyệt chốt thành công!"); }
  };

  const handleRegister = async () => {
    if (!currentUser || selectedCourseIds.length === 0) { alert("Vui lòng chọn môn học!"); return; }
    setIsSaving(true); 
    const newRegs: Registration[] = selectedCourseIds.map(cid => { const course = courses.find(c => c.id === cid); return { id: Math.random().toString(36).substr(2, 9), courseId: cid, asmId: currentUser.id, region: currentUser.region || 'Unknown', date: course ? course.startDate : new Date().toISOString().split('T')[0], status: 'pending' }; });
    for (const reg of newRegs) { await saveToSheet("Registrations", reg, "add"); await delay(2000); }
    setRegistrations(prev => [...prev, ...newRegs]); setSelectedCourseIds([]); setIsSaving(false); alert("Đăng ký thành công! Vui lòng chờ KA duyệt."); setActiveTab('registrations'); 
    setTimeout(() => { loadData(true); }, 5000);
  };

  const handleCancelRegistration = async (regId: string) => {
    if (!confirm("Bạn có chắc chắn muốn HỦY đăng ký môn học này không?")) return;
    setIsSaving(true);
    setRegistrations(prev => prev.filter(r => r.id !== regId)); 
    try {
        const success = await saveToSheet("Registrations", { id: regId }, "delete");
        if (!success) { alert("Có lỗi khi hủy đăng ký. Vui lòng thử lại."); loadData(true); }
    } catch (e) {
        console.error(e); alert("Lỗi kết nối."); loadData(true);
    } finally {
        setIsSaving(false);
    }
  };

  const handleRegistrationAction = async (reg: Registration, action: 'confirm' | 'reject') => {
    if (action === 'reject') { if(!confirm("Bạn có chắc chắn muốn TỪ CHỐI và XÓA yêu cầu đăng ký này?")) { return; } setRegistrations(prev => prev.filter(r => r.id !== reg.id)); await saveToSheet("Registrations", { id: reg.id }, "delete"); }
    if (action === 'confirm') { const updatedReg = { ...reg, status: 'confirmed' as const }; setRegistrations(prev => prev.map(r => r.id === reg.id ? updatedReg : r)); await saveToSheet("Registrations", updatedReg, "update"); }
    setTimeout(() => { loadData(true); }, 2000);
  };

  const handleGenerateSummary = async () => {
    if (selectedCourseIds.length === 0 || !currentUser) return; setIsGeneratingAi(true);
    const selected = courses.filter(c => selectedCourseIds.includes(c.id)); const summary = await generateTrainingPlanSummary(selected, currentUser.region || 'Region'); setAiSummary(summary || ''); setIsGeneratingAi(false);
  };

  const handlePermissionChange = (role: UserRole, feature: FeatureKey, checked: boolean) => {
      // Don't allow removing 'manage_roles' from ADMIN
      if (role === UserRole.ADMIN && feature === 'manage_roles' && !checked) return;

      setRolePermissions(prev => {
          const newPerms = [...prev];
          const roleIndex = newPerms.findIndex(p => p.role === role);
          
          if (roleIndex === -1) {
              // Should not happen with default data, but safe fallback
              newPerms.push({ role, features: [feature] });
          } else {
              const currentFeatures = newPerms[roleIndex].features;
              if (checked) {
                  if (!currentFeatures.includes(feature)) {
                      newPerms[roleIndex] = { ...newPerms[roleIndex], features: [...currentFeatures, feature] };
                  }
              } else {
                  newPerms[roleIndex] = { ...newPerms[roleIndex], features: currentFeatures.filter(f => f !== feature) };
              }
          }
          return newPerms;
      });
  };

  const handleSavePermissions = async () => {
      setIsSaving(true);
      // Save for each role. In a real DB, this might be a single batch call.
      // With our simple Sheet API, we loop.
      for (const perm of rolePermissions) {
          await saveToSheet("RolePermissions", { role: perm.role, features: perm.features }, "update");
      }
      setIsSaving(false);
      alert("Đã lưu phân quyền thành công!");
  };

  // Render Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center flex-col gap-4">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium animate-pulse">Đang kết nối cơ sở dữ liệu Google Sheets...</p>
      </div>
    );
  }

  // Render Login
  if (!currentUser) {
     // ... (Existing Login Render code remains same) ...
     return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
          <div className="p-8">
            <div className="flex justify-center mb-6">
              <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg shadow-indigo-200">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
            <h2 className="text-3xl font-black text-center text-slate-900 mb-0">FTC Training Hub</h2>
            <p className="text-center text-slate-500 font-bold uppercase text-xs tracking-widest mb-6">Hệ thống đăng ký đào tạo</p>
            
            <div className="flex justify-center gap-3 mb-8">
               <div className={`flex items-center gap-1 px-3 py-1 rounded-full border ${dbConnected ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
                  <span className={`w-2 h-2 rounded-full ${dbConnected ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                  <span className={`text-xs font-bold ${dbConnected ? 'text-green-700' : 'text-amber-700'}`}>
                    {dbConnected ? 'Online' : 'Offline'}
                  </span>
               </div>
               <button onClick={() => loadData(false)} disabled={isSyncing || isLoggingIn} className="flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-white text-slate-600 text-xs font-bold transition-colors disabled:opacity-50">
                 <svg className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                 {isSyncing ? 'Đang tải...' : 'Cập nhật'}
               </button>
               {users.length === 0 && (
                 <button onClick={handleSeedData} disabled={isSyncing || isLoggingIn} className="flex items-center gap-1 px-3 py-1 rounded-full border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold transition-colors disabled:opacity-50">
                   <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                   Khôi Phục Data
                 </button>
               )}
            </div>
            
            <form onSubmit={handleAuth} className="space-y-4">
              {!isLoginView && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Họ Tên</label>
                  <input required type="text" value={authData.name} onChange={e => setAuthData({...authData, name: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Nguyễn Văn A" />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tên Đăng Nhập</label>
                <input required type="text" value={authData.username} onChange={e => setAuthData({...authData, username: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="username" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Mật Khẩu</label>
                <input required type="password" value={authData.password} onChange={e => setAuthData({...authData, password: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="••••••••" />
              </div>

              {!isLoginView && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Chức Vụ</label>
                    <select value={authData.role} onChange={e => handleRoleChange(e.target.value as UserRole)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value={UserRole.ASM}>ASM</option>
                      <option value={UserRole.RSM}>RSM</option>
                      <option value={UserRole.TRAINER}>Giảng Viên</option>
                      <option value={UserRole.PM}>PM (Product)</option>
                      <option value={UserRole.KA}>KA (Key Account)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Khu Vực</label>
                    <select value={authData.region} onChange={e => setAuthData({...authData, region: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none">
                      {(authData.role === UserRole.TRAINER ? TRAINER_REGIONS : ASM_REGIONS).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <button type="submit" disabled={isLoggingIn} className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${isLoggingIn ? 'bg-indigo-400 cursor-not-allowed text-indigo-100 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'}`}>
                {isLoggingIn && (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {isLoggingIn ? (isLoginView ? 'Đang Đăng Nhập...' : 'Đang Tạo Tài Khoản...') : (isLoginView ? 'Đăng Nhập' : 'Tạo Tài Khoản')}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button disabled={isLoggingIn} onClick={() => setIsLoginView(!isLoginView)} className="text-indigo-600 text-sm font-semibold hover:underline disabled:opacity-50">
                {isLoginView ? 'Chưa có tài khoản? Tạo ngay thôi!' : 'Đã có tài khoản? Đăng nhập'}
              </button>
            </div>
          </div>
          <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
             <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">
               Ứng dụng được vận hành bởi FTC @ 2026
             </p>
          </div>
        </div>
      </div>
     );
  }

  // Render Main App
  return (
    <div className="min-h-screen flex flex-col">
      <DashboardHeader 
          user={currentUser} 
          onLogout={handleLogout} 
          dbConnected={dbConnected} 
          courses={courses}
          registrations={registrations}
          setActiveTab={(tab) => setActiveTab(tab as any)}
      />
      
      {isSyncing && <div className="fixed top-0 left-0 right-0 h-1 bg-indigo-600 animate-pulse z-[60]"></div>}

      {showGlobalPopup && systemSettings.popup.isActive && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowGlobalPopup(false)}>
           <div className="relative max-w-md w-full bg-transparent rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-50 duration-500 ease-out" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowGlobalPopup(false)} className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition-colors z-10"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg></button>
              {systemSettings.popup.linkUrl ? (
                <a href={systemSettings.popup.linkUrl} target="_blank" rel="noopener noreferrer" className="block cursor-pointer">
                   <img src={systemSettings.popup.imageUrl} alt="Popup" className="w-full h-auto object-contain rounded-2xl" />
                </a>
              ) : (
                <img src={systemSettings.popup.imageUrl} alt="Popup" className="w-full h-auto object-contain rounded-2xl" />
              )}
           </div>
        </div>
      )}

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden lg:flex">
           <div className="p-6">
            <div className="bg-slate-50 rounded-2xl p-4 flex flex-col items-center gap-3 border border-slate-100 text-center">
              <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-md overflow-hidden">
                {currentUser.avatarUrl ? (
                   <img src={currentUser.avatarUrl} alt={currentUser.name} className="w-full h-full object-cover" />
                ) : (
                   currentUser.name.charAt(0)
                )}
              </div>
              <div className="overflow-hidden w-full">
                <p className="font-bold text-slate-800 truncate">{currentUser.name}</p>
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider bg-slate-200 inline-block px-2 py-0.5 rounded-full mt-1">{currentUser.role}</p>
              </div>
            </div>
          </div>
          
          <nav className="flex-1 px-4 space-y-1 overflow-y-auto max-h-[calc(100vh-250px)]">
            <button onClick={() => setActiveTab('calendar')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'calendar' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
              Lịch đào tạo
            </button>
            
            {hasPermission('tab_trainer_schedule') && (
                <button onClick={() => setActiveTab('trainer-schedule')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'trainer-schedule' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  Lịch làm việc GV
                </button>
            )}

            {hasPermission('tab_users') && (
                <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'users' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  Quản lý Users
                </button>
            )}

            {hasPermission('tab_manage_courses') && (
               <button onClick={() => setActiveTab('manage-courses')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'manage-courses' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                {['TRAINER', 'KA', 'ADMIN', 'RSM'].includes(currentUser.role) ? 'Quản lý Môn học' : 'Tạo Môn học'}
               </button>
            )}

            {hasPermission('tab_course_approvals') && (
               <button onClick={() => setActiveTab('course-approvals')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'course-approvals' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Duyệt Môn & Đăng Ký
               </button>
            )}

            {hasPermission('tab_catalog') && (
               <button onClick={() => setActiveTab('catalog')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'catalog' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                Đăng ký Môn học
              </button>
            )}

            {hasPermission('tab_registrations') && (
              <button onClick={() => setActiveTab('registrations')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'registrations' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Đã đăng ký
              </button>
            )}
            
            {hasPermission('tab_tools') && (
                <button onClick={() => setActiveTab('tools')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'tools' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                    Công cụ & Tiện ích
                </button>
            )}
            
            {hasPermission('manage_roles') && (
                <button onClick={() => setActiveTab('manage-roles')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'manage-roles' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Quản Lý Phân Quyền
                </button>
            )}

            <div className="pt-4 pb-2 border-t border-slate-100 mt-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cá nhân</div>
            <button onClick={() => setActiveTab('profile')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'profile' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Thông tin cá nhân
            </button>
          </nav>
        </aside>

        <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} role={currentUser.role} permissions={rolePermissions} />

        <section className="flex-1 overflow-y-auto bg-slate-50 p-4 lg:p-6 pb-24 lg:pb-6">
          <div className="max-w-7xl mx-auto">
            
            {activeTab === 'calendar' && (
               <div className="space-y-6">
                  <div className="flex justify-between items-center">
                     <h2 className="text-2xl font-black text-slate-800">Lịch Đào Tạo</h2>
                  </div>
                  <CourseCalendar registrations={registrations} user={currentUser} courses={courses} />
               </div>
            )}
            
            {/* TRAINER WORK SCHEDULE VIEW */}
            {activeTab === 'trainer-schedule' && hasPermission('tab_trainer_schedule') && (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <h2 className="text-2xl font-black text-slate-800">Lịch Làm Việc GV FTC</h2>
                        <div className="flex items-center gap-4 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                            <button onClick={() => setViewScheduleDate(prev => new Date(prev.setDate(prev.getDate() - 7)))} className="p-2 hover:bg-slate-50 rounded-lg text-slate-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <div className="text-center min-w-[150px]">
                                <p className="text-xs text-slate-400 font-bold uppercase">Tuần {getWeekNumber(viewScheduleDate)} - Năm {viewScheduleDate.getFullYear()}</p>
                                <p className="text-sm font-bold text-slate-800">
                                    {getWeekRange(viewScheduleDate).start.toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'})} - {getWeekRange(viewScheduleDate).end.toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'})}
                                </p>
                            </div>
                            <button onClick={() => setViewScheduleDate(prev => new Date(prev.setDate(prev.getDate() + 7)))} className="p-2 hover:bg-slate-50 rounded-lg text-slate-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                        <table className="w-full text-sm border-collapse min-w-[1200px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="p-4 font-black text-slate-600 text-left w-48 sticky left-0 bg-slate-50 z-20 border-r border-slate-200">Giảng Viên</th>
                                    {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'].map(day => (
                                        <th key={day} className="p-4 font-black text-slate-600 text-center w-40 border-r border-slate-100 last:border-0">{day}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {TRAINER_REGIONS.map(region => {
                                    const regionTrainers = users.filter(u => u.role === UserRole.TRAINER && u.region === region);
                                    if (regionTrainers.length === 0) return null;

                                    return (
                                        <React.Fragment key={region}>
                                            <tr className="bg-slate-100/50">
                                                <td colSpan={7} className="px-4 py-2 font-black text-xs text-slate-500 uppercase tracking-widest sticky left-0 bg-slate-100/50 z-10">{region}</td>
                                            </tr>
                                            {regionTrainers.map(trainer => {
                                                const weekNum = getWeekNumber(viewScheduleDate);
                                                const year = viewScheduleDate.getFullYear();
                                                const scheduleId = `${trainer.id}_${year}_${weekNum}`;
                                                const schedule = workSchedules.find(ws => ws.id === scheduleId)?.days;

                                                return (
                                                    <tr key={trainer.id} className="hover:bg-white transition-colors group">
                                                        <td className="p-4 sticky left-0 bg-white group-hover:bg-slate-50 z-20 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold overflow-hidden text-xs">
                                                                    {trainer.avatarUrl ? <img src={trainer.avatarUrl} className="w-full h-full object-cover" /> : trainer.name.charAt(0)}
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold text-slate-800 text-xs">{trainer.name}</p>
                                                                    <p className="text-[10px] text-slate-400">@{trainer.username}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((dayKey) => (
                                                            <td key={dayKey} className="border-r border-slate-50 last:border-0 align-top h-24 p-0">
                                                                <div className="flex flex-col h-full">
                                                                    <div className="flex-1 p-2 border-b border-dashed border-slate-100 bg-orange-50/30">
                                                                        <span className="text-[9px] font-bold text-orange-400 uppercase block mb-0.5">Sáng</span>
                                                                        <p className="text-xs text-slate-700 leading-tight whitespace-pre-line">
                                                                            {schedule ? (schedule as any)[dayKey]?.morning : ''}
                                                                        </p>
                                                                    </div>
                                                                    <div className="flex-1 p-2 bg-blue-50/30">
                                                                        <span className="text-[9px] font-bold text-blue-400 uppercase block mb-0.5">Chiều</span>
                                                                        <p className="text-xs text-slate-700 leading-tight whitespace-pre-line">
                                                                            {schedule ? (schedule as any)[dayKey]?.afternoon : ''}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        ))}
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ... other tabs ... */}
            {/* Keeping existing tabs collapsed for brevity, only showing changed Tools tab */}
            {activeTab === 'catalog' && hasPermission('tab_catalog') && (
              <div className="space-y-6 pb-20">
                  <div className="flex justify-between items-center">
                      <h2 className="text-2xl font-black text-slate-800">Đăng Ký Môn Học</h2>
                  </div>

                  {selectedCourseIds.length > 0 && (
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm animate-in slide-in-from-top-2">
                          <div className="flex justify-between items-start gap-4">
                              <div className="flex-1">
                                  <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
                                      <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                      AI Tóm Tắt Kế Hoạch
                                  </h3>
                                  <p className="text-sm text-slate-600">{aiSummary || "Hệ thống sẽ phân tích các môn học bạn chọn để đưa ra đánh giá về lợi ích cho vùng của bạn."}</p>
                              </div>
                              <button onClick={handleGenerateSummary} disabled={isGeneratingAi} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors disabled:opacity-50">
                                  {isGeneratingAi ? 'Đang tạo...' : 'Tạo Tóm Tắt'}
                              </button>
                          </div>
                      </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {courses.filter(c => c.approvalStatus === 'approved').length === 0 ? (
                          <p className="text-slate-500 italic col-span-full text-center py-10">Chưa có môn học nào khả dụng để đăng ký.</p>
                      ) : (
                          courses.filter(c => c.approvalStatus === 'approved').map(course => {
                              const isSelected = selectedCourseIds.includes(course.id);
                              const existingReg = registrations.find(r => r.courseId === course.id && r.asmId === currentUser.id);
                              const isRegistered = !!existingReg;
                              
                              return (
                                  <div key={course.id} className={`bg-white rounded-2xl border transition-all overflow-hidden group flex flex-col ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-lg' : 'border-slate-200 shadow-sm hover:shadow-md'}`}>
                                      <div className="h-40 relative">
                                          <img src={course.imageUrl} className="w-full h-full object-cover" alt={course.title} />
                                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                                              <div className="w-full">
                                                  <div className="flex justify-between items-start mb-2">
                                                      <span className="text-[10px] font-black uppercase bg-indigo-600 text-white px-2 py-1 rounded-md shadow-sm">{course.category}</span>
                                                      {isRegistered && (
                                                          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md shadow-sm ${existingReg.status === 'confirmed' ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'}`}>
                                                              {existingReg.status === 'confirmed' ? 'Đã Duyệt' : 'Chờ Duyệt'}
                                                          </span>
                                                      )}
                                                  </div>
                                                  <h3 className="text-white font-bold text-lg leading-tight line-clamp-2">{course.title}</h3>
                                              </div>
                                          </div>
                                      </div>
                                      <div className="p-4 flex-1 flex flex-col gap-4">
                                          <div className="grid grid-cols-2 gap-2 text-xs">
                                              <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                                  <p className="text-slate-400 font-bold uppercase text-[9px]">Ngày bắt đầu</p>
                                                  <p className="font-semibold text-slate-700">{formatDate(course.startDate)}</p>
                                              </div>
                                              <div className="bg-slate-50 p-2 rounded border border-slate-100">
                                                  <p className="text-slate-400 font-bold uppercase text-[9px]">Hình thức</p>
                                                  <p className="font-semibold text-slate-700">{course.format}</p>
                                              </div>
                                          </div>
                                          <p className="text-xs text-slate-500 line-clamp-3 mb-auto">{course.description}</p>
                                          
                                          {isRegistered ? (
                                              <button 
                                                  onClick={() => handleCancelRegistration(existingReg!.id)}
                                                  disabled={isSaving}
                                                  className={`w-full py-3 font-bold rounded-xl text-sm border flex items-center justify-center gap-2 transition-colors ${isSaving ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'}`}
                                              >
                                                  {isSaving ? (
                                                      <>
                                                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                          Đang Hủy...
                                                      </>
                                                  ) : (
                                                      <>
                                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                          Hủy Đăng Ký
                                                      </>
                                                  )}
                                              </button>
                                          ) : (
                                              <button 
                                                  onClick={() => {
                                                      if (isSelected) setSelectedCourseIds(prev => prev.filter(id => id !== course.id));
                                                      else setSelectedCourseIds(prev => [...prev, course.id]);
                                                  }}
                                                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${isSelected ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200'}`}
                                              >
                                                  {isSelected ? 'Bỏ chọn' : 'Chọn Môn Này'}
                                              </button>
                                          )}
                                      </div>
                                  </div>
                              );
                          })
                      )}
                  </div>

                  {/* FLOATING ACTION BUTTON FOR REGISTRATION */}
                  {selectedCourseIds.length > 0 && (
                      <div className="fixed bottom-20 lg:bottom-10 right-4 lg:right-10 z-30 animate-in zoom-in slide-in-from-bottom-4 duration-300">
                          <button 
                              onClick={handleRegister} 
                              disabled={isSaving}
                              className="bg-indigo-600 text-white px-6 py-4 rounded-full font-bold shadow-2xl shadow-indigo-400 hover:bg-indigo-700 hover:scale-105 transition-all flex items-center gap-3"
                          >
                              {isSaving ? (
                                  <>
                                      <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                      </svg>
                                      Đang Gửi...
                                  </>
                              ) : (
                                  <>
                                      <span className="bg-white text-indigo-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black">
                                          {selectedCourseIds.length}
                                      </span>
                                      Gửi Đăng Ký
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                  </>
                              )}
                          </button>
                      </div>
                  )}
              </div>
            )}

            {/* RESTORED TOOLS TAB */}
            {activeTab === 'tools' && currentUser && hasPermission('tab_tools') && (
               <div className="space-y-6">
                 <h2 className="text-2xl font-black text-slate-800">Công Cụ & Tiện Ích</h2>
                 
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                   {/* Webex Tool - Visible via permissions */}
                   {hasPermission('tool_webex') && (
                       <div 
                          onClick={() => setActiveTool('webex')}
                          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group relative overflow-hidden"
                       >
                          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity"><svg className="w-16 h-16 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg></div>
                          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></div>
                          <h3 className="font-bold text-slate-800 mb-1">Tạo Link Họp Webex</h3>
                          <p className="text-xs text-slate-500">Truy cập nhanh hệ thống phòng họp.</p>
                       </div>
                   )}

                   {hasPermission('tool_attendance') && (
                       <div onClick={() => setActiveTool('attendance')} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"><div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div><h3 className="font-bold text-slate-800 mb-1">Quản Lý Điểm Danh</h3><p className="text-xs text-slate-500">Upload và xử lý file sau đào tạo.</p></div>
                   )}
                   
                   {hasPermission('tool_statistics') && (
                       <div onClick={() => setActiveTool('statistics')} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"><div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg></div><h3 className="font-bold text-slate-800 mb-1">Báo Cáo Thống Kê</h3><p className="text-xs text-slate-500">Xem tiến độ đào tạo vùng.</p></div>
                   )}

                   {/* --- NEW WORK SCHEDULE TOOL (Trainer Only) --- */}
                   {hasPermission('tool_work_schedule') && (
                        <div onClick={() => initScheduleForm(new Date())} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"><div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg></div><h3 className="font-bold text-slate-800 mb-1">Cập Nhật Lịch Làm Việc</h3><p className="text-xs text-slate-500">Khai báo lịch làm việc tuần này.</p></div>
                   )}

                   {/* --- RESTORED CONFIG TOOLS --- */}
                   {hasPermission('config_webex') && (
                       <div onClick={() => { isEditingConfig.current = true; setActiveTool('config_webex'); }} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"><div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></div><h3 className="font-bold text-slate-800 mb-1">Cấu Hình Webex</h3><p className="text-xs text-slate-500">Cập nhật thông tin phòng họp chung.</p></div>
                   )}

                   {hasPermission('config_popup') && (
                       <div onClick={() => { isEditingConfig.current = true; setActiveTool('config_popup'); }} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"><div className="w-12 h-12 bg-pink-50 text-pink-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg></div><h3 className="font-bold text-slate-800 mb-1">Cấu Hình Global Popup</h3><p className="text-xs text-slate-500">Tạo thông báo khẩn cấp toàn hệ thống.</p></div>
                   )}
                 </div>
                 
                 {/* ... existing Webex View modal ... */}
                 {activeTool === 'webex' && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl">
                            <div className="p-6">
                                <div className="text-center mb-6">
                                    <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-800">Thông Tin Phòng Họp</h3>
                                    <p className="text-sm text-slate-500">Sử dụng thông tin dưới đây để đăng nhập Webex</p>
                                </div>

                                <div className="space-y-4 mb-8">
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                        <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Webex URL</p>
                                        <p className="font-medium text-slate-800 text-sm truncate">{systemSettings.webex?.url || 'Chưa cấu hình'}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 group cursor-pointer" onClick={() => {navigator.clipboard.writeText(systemSettings.webex?.username || ''); alert('Đã copy Username');}}>
                                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Username</p>
                                            <div className="flex items-center justify-between">
                                                <p className="font-bold text-slate-800 text-sm truncate">{systemSettings.webex?.username || '---'}</p>
                                                <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 group cursor-pointer" onClick={() => {navigator.clipboard.writeText(systemSettings.webex?.password || ''); alert('Đã copy Password');}}>
                                            <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Password</p>
                                            <div className="flex items-center justify-between">
                                                <p className="font-bold text-slate-800 text-sm truncate">{systemSettings.webex?.password || '---'}</p>
                                                <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button onClick={() => setActiveTool(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">Đóng</button>
                                    <a href={systemSettings.webex?.url || '#'} target="_blank" rel="noopener noreferrer" className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors text-center shadow-lg shadow-blue-200" onClick={() => setActiveTool(null)}>
                                        Mở Webex
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                 )}
                 
                 {/* --- WORK SCHEDULE INPUT MODAL --- */}
                 {activeTool === 'work_schedule' && scheduleForm && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 shadow-2xl">
                             <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                <div>
                                    <h3 className="text-xl font-black text-slate-800">Cập Nhật Lịch Làm Việc</h3>
                                    <p className="text-sm text-slate-500">Tuần {scheduleForm.weekNumber} - Năm {scheduleForm.year} ({getWeekRange(editScheduleDate).start.toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'})} - {getWeekRange(editScheduleDate).end.toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'})})</p>
                                </div>
                                <div className="flex gap-2">
                                     <button type="button" onClick={() => initScheduleForm(new Date(editScheduleDate.setDate(editScheduleDate.getDate() - 7)))} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"><svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg></button>
                                     <button type="button" onClick={() => initScheduleForm(new Date(editScheduleDate.setDate(editScheduleDate.getDate() + 7)))} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"><svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg></button>
                                </div>
                            </div>
                            <div className="p-6 overflow-y-auto bg-white flex-1">
                                <form id="work-schedule-form" onSubmit={handleSaveWorkSchedule} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((dayKey, index) => {
                                            const dayLabels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                                            return (
                                                <div key={dayKey} className="border border-slate-200 rounded-xl overflow-hidden">
                                                    <div className="bg-slate-50 p-3 border-b border-slate-200 font-bold text-slate-700 text-center">
                                                        {dayLabels[index]}
                                                    </div>
                                                    <div className="p-4 space-y-3">
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-orange-400 uppercase mb-1">Sáng</label>
                                                            <textarea 
                                                                className="w-full p-2 text-sm border border-slate-200 rounded-lg bg-orange-50/20 focus:ring-2 focus:ring-orange-200 outline-none resize-none h-20"
                                                                placeholder="Công việc buổi sáng..."
                                                                value={(scheduleForm.days as any)[dayKey].morning}
                                                                onChange={(e) => setScheduleForm({
                                                                    ...scheduleForm,
                                                                    days: {
                                                                        ...scheduleForm.days,
                                                                        [dayKey]: { ...(scheduleForm.days as any)[dayKey], morning: e.target.value }
                                                                    }
                                                                })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-blue-400 uppercase mb-1">Chiều</label>
                                                            <textarea 
                                                                className="w-full p-2 text-sm border border-slate-200 rounded-lg bg-blue-50/20 focus:ring-2 focus:ring-blue-200 outline-none resize-none h-20"
                                                                placeholder="Công việc buổi chiều..."
                                                                value={(scheduleForm.days as any)[dayKey].afternoon}
                                                                onChange={(e) => setScheduleForm({
                                                                    ...scheduleForm,
                                                                    days: {
                                                                        ...scheduleForm.days,
                                                                        [dayKey]: { ...(scheduleForm.days as any)[dayKey], afternoon: e.target.value }
                                                                    }
                                                                })}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </form>
                            </div>
                            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                                <button type="button" onClick={() => setActiveTool(null)} className="flex-1 py-3 bg-white border border-slate-200 font-bold text-slate-600 rounded-xl hover:bg-slate-50">Đóng</button>
                                <button type="submit" form="work-schedule-form" disabled={isSaving} className="flex-1 py-3 bg-indigo-600 font-bold text-white rounded-xl shadow-lg hover:bg-indigo-700 shadow-indigo-200">
                                    {isSaving ? 'Đang lưu...' : 'Lưu Lịch Làm Việc'}
                                </button>
                            </div>
                        </div>
                    </div>
                 )}
                 
                 {/* ... existing Config Modals ... */}
                 {activeTool === 'config_webex' && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl">
                            <div className="p-6">
                                <h3 className="text-xl font-black text-slate-800 mb-6">Cập Nhật Webex</h3>
                                <form onSubmit={handleSaveWebexConfig} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Webex URL</label>
                                        <input type="text" value={webexConfigForm.url} onChange={e => setWebexConfigForm({...webexConfigForm, url: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" placeholder="https://..." />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Username</label>
                                        <input type="text" value={webexConfigForm.username} onChange={e => setWebexConfigForm({...webexConfigForm, username: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Password</label>
                                        <input type="text" value={webexConfigForm.password} onChange={e => setWebexConfigForm({...webexConfigForm, password: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" />
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button type="button" onClick={() => { setActiveTool(null); isEditingConfig.current = false; }} className="flex-1 py-3 bg-slate-100 font-bold text-slate-600 rounded-xl">Hủy</button>
                                        <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-indigo-600 font-bold text-white rounded-xl shadow-lg hover:bg-indigo-700">{isSaving ? 'Đang lưu...' : 'Lưu Cấu Hình'}</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                 )}

                 {/* --- NEW CONFIG POPUP MODAL --- */}
                 {activeTool === 'config_popup' && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl">
                            <div className="p-6">
                                <h3 className="text-xl font-black text-slate-800 mb-6">Cập Nhật Global Popup</h3>
                                <form onSubmit={handleSavePopupConfig} className="space-y-4">
                                    <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <span className="font-bold text-slate-700 text-sm">Trạng thái kích hoạt</span>
                                        <div onClick={() => setPopupConfigForm({...popupConfigForm, isActive: !popupConfigForm.isActive})} className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${popupConfigForm.isActive ? 'bg-green-500' : 'bg-slate-300'}`}>
                                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${popupConfigForm.isActive ? 'translate-x-6' : ''}`}></div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Hình ảnh Popup</label>
                                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'popup')} className="mb-2 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                                        {popupConfigForm.imageUrl && <img src={popupConfigForm.imageUrl} className="w-full h-32 object-contain rounded-xl border border-slate-200 bg-slate-50" />}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Link liên kết (Tùy chọn)</label>
                                        <input type="text" value={popupConfigForm.linkUrl} onChange={e => setPopupConfigForm({...popupConfigForm, linkUrl: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" placeholder="https://..." />
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button type="button" onClick={() => { setActiveTool(null); isEditingConfig.current = false; }} className="flex-1 py-3 bg-slate-100 font-bold text-slate-600 rounded-xl">Hủy</button>
                                        <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-indigo-600 font-bold text-white rounded-xl shadow-lg hover:bg-indigo-700">{isSaving ? 'Đang lưu...' : 'Lưu Popup'}</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                 )}
                 
                 {activeTool === 'attendance' && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                       <div className="bg-slate-50 rounded-3xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 shadow-2xl">
                          <div className="bg-white p-4 border-b border-slate-200 flex justify-between items-center"><h3 className="text-xl font-black text-slate-800">Quản Lý Điểm Danh</h3><button onClick={() => setActiveTool(null)} className="p-2 hover:bg-slate-100 rounded-full"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
                          <div className="p-6 bg-slate-50 overflow-y-auto">
                              <div className="bg-white p-6 rounded-2xl border border-slate-200 mb-6">
                                  <div className="flex justify-between mb-4"><h4 className="font-bold">Upload File</h4><button onClick={handleDownloadTemplate} className="text-indigo-600 text-xs font-bold border border-indigo-200 px-3 py-1 rounded-lg">Tải mẫu</button></div>
                                  <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />
                              </div>
                              {attendanceData.length > 0 && <button onClick={handleSyncAttendance} disabled={uploadStatus === 'uploading'} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold">{uploadStatus === 'uploading' ? 'Đang lưu...' : 'Lưu Database'}</button>}
                          </div>
                       </div>
                    </div>
                 )}
                 
                 {activeTool === 'statistics' && calculateStatistics() && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                       <div className="bg-slate-50 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 shadow-2xl">
                          <div className="bg-white p-4 border-b border-slate-200 flex justify-between items-center"><h3 className="text-xl font-black text-slate-800">Dashboard Thống Kê</h3><button onClick={() => setActiveTool(null)} className="p-2 hover:bg-slate-100 rounded-full"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
                          <div className="p-6 overflow-y-auto">
                              <div className="grid grid-cols-2 gap-4">
                                  <div className="bg-white p-4 rounded-xl border border-slate-200"><p className="text-slate-500 text-xs">Tổng Môn</p><p className="text-2xl font-black">{calculateStatistics()?.totalCourses}</p></div>
                                  <div className="bg-white p-4 rounded-xl border border-slate-200"><p className="text-slate-500 text-xs">Tổng Đăng Ký</p><p className="text-2xl font-black">{calculateStatistics()?.totalRegistrations}</p></div>
                              </div>
                          </div>
                       </div>
                    </div>
                 )}
               </div>
            )}
           
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
