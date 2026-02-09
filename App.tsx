
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, Course, Registration, SystemSettings, PopupConfig, CourseApprovalStatus, AttendanceRecord, WebexConfig } from './types';
import { ASM_REGIONS, TRAINER_REGIONS, INITIAL_USERS, MOCK_COURSES } from './constants';
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
  const [isSaving, setIsSaving] = useState(false); 
  const [dbConnected, setDbConnected] = useState(false);

  // Data States
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  
  // System Settings State (Popup & Webex)
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    popup: { isActive: false, imageUrl: '', linkUrl: '' },
    webex: { url: '', username: '', password: '' }
  });
  const [showGlobalPopup, setShowGlobalPopup] = useState(false);
  
  // Forms for Settings
  const [popupConfigForm, setPopupConfigForm] = useState<PopupConfig>({ isActive: false, imageUrl: '', linkUrl: '' });
  const [webexConfigForm, setWebexConfigForm] = useState<WebexConfig>({ url: '', username: '', password: '' });
  
  // Ref to track if user is currently editing settings (to prevent background overwrite)
  const isEditingConfig = useRef(false);

  // Initialize currentUser from localStorage to persist login across refreshes
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('currentUser');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });

  const [isLoginView, setIsLoginView] = useState(true);
  const [activeTab, setActiveTab] = useState<'catalog' | 'calendar' | 'registrations' | 'users' | 'profile' | 'settings' | 'manage-courses' | 'approvals' | 'course-approvals' | 'tools'>('calendar');
  
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  
  const isPollingAllowed = useRef(true);
  
  // Form States
  const [authData, setAuthData] = useState({ 
    username: '', 
    password: '', 
    name: '', 
    role: UserRole.ASM, 
    region: ASM_REGIONS[0] 
  });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  // State cho thêm User mới (Admin)
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
  const [activeTool, setActiveTool] = useState<'statistics' | 'attendance' | 'webex' | null>(null);
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showWebexPassword, setShowWebexPassword] = useState(false);

  // --- DATA LOADING ---
  const loadData = async (isBackground = false) => {
    // If saving or user is typing settings, do not fetch in background
    if (isBackground && (!isPollingAllowed.current || isEditingConfig.current)) return;

    if (!isBackground) setIsLoading(true);
    else setIsSyncing(true);

    try {
      const data = await fetchAllData();
      
      if (data) {
        setUsers(data.users || []);
        setCourses(data.courses || []);
        setRegistrations(data.registrations || []);
        
        // Load Settings if available, otherwise defaults
        const loadedSettings: SystemSettings = {
            popup: data.settings?.popup || { isActive: false, imageUrl: '', linkUrl: '' },
            webex: data.settings?.webex || { url: '', username: '', password: '' }
        };

        setSystemSettings(loadedSettings);
        
        // CRITICAL FIX: Only update form state if NOT in background mode OR if not currently editing
        // This prevents overwriting user input while they are typing during a background sync
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
        
        // Add mock confirmed registration so Calendar works in offline mode with dynamic dates
        setRegistrations([
           { id: 'r_mock_1', courseId: 'c1', asmId: 'u2', region: 'Hà Nội', date: MOCK_COURSES[0].startDate, status: 'confirmed' },
           { id: 'r_mock_2', courseId: 'c2', asmId: 'u2', region: 'Hà Nội', date: MOCK_COURSES[1].startDate, status: 'pending' },
           { id: 'r_mock_3', courseId: 'c3', asmId: 'u3', region: 'Hồ Chí Minh', date: MOCK_COURSES[2].startDate, status: 'confirmed' }
        ]);
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

  // Effect to show popup after login if active
  useEffect(() => {
    if (currentUser && systemSettings.popup.isActive) {
        setShowGlobalPopup(true);
    }
  }, [currentUser, systemSettings.popup.isActive]);

  // Set default tab on refresh/mount if user is logged in
  useEffect(() => {
    if (currentUser) {
      // Init profile data when user logs in or updates
      setProfileData({
        name: currentUser.name,
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        bio: currentUser.bio || '',
        password: currentUser.password,
        preferences: currentUser.preferences || {
           emailNotification: true,
           browserNotification: false,
           compactMode: false
        }
      });

      // Restore correct tab based on role if currently on default calendar and just loaded
      // This is a simple heuristic to restore the "dashboard" feel for different roles
      if (activeTab === 'calendar') {
          if (currentUser.role === UserRole.TRAINER) setActiveTab('manage-courses');
          else if (currentUser.role === UserRole.KA) setActiveTab('course-approvals');
          else if (currentUser.role === UserRole.RSM) setActiveTab('catalog');
          else if (currentUser.role === UserRole.PM) setActiveTab('manage-courses');
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

  // --- DOWNLOAD TEMPLATE ---
  const handleDownloadTemplate = () => {
     const headers = [
         {
             "ID": "VD: 1001",
             "Ngày": "2024-06-15",
             "Check in": "08:00",
             "Check out": "17:00",
             "Môn học": "Kỹ năng bán hàng",
             "Họ và Tên": "Nguyễn Văn A",
             "Inside": "SGN001",
             "Địa chỉ shop làm việc": "123 Đường ABC",
             "Email": "nhanvien@email.com",
             "ASM": "ASM Khu Vực 1",
             "Email ASM": "asm@email.com",
             "Feedback": "Bài học bổ ích"
         }
     ];

     const ws = XLSX.utils.json_to_sheet(headers);
     const wscols = [
         {wch: 10}, {wch: 12}, {wch: 10}, {wch: 10}, {wch: 25}, {wch: 20}, 
         {wch: 10}, {wch: 25}, {wch: 25}, {wch: 15}, {wch: 25}, {wch: 30}
     ];
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
          const payload = {
             "ID": record.id,
             "Ngày": record.date,
             "Check in": record.checkIn,
             "Check out": record.checkOut,
             "Môn học": record.courseName,
             "Họ và Tên": record.fullName,
             "Inside": record.insideId,
             "Địa chỉ shop làm việc": record.shopAddress,
             "Email": record.email,
             "ASM": record.asm,
             "Email ASM": record.asmEmail,
             "Feedback": record.feedback
          };

          const success = await saveToSheet("Attendance", payload, "add");
          if (success) successCount++;
          setUploadProgress(Math.round(((i + 1) / total) * 100));
          await new Promise(r => setTimeout(r, 200)); 
      }

      if (successCount === total) {
          setUploadStatus('success');
          alert(`Đã lưu thành công ${successCount}/${total} bản ghi!`);
      } else {
          setUploadStatus('error');
          alert(`Hoàn tất với lỗi. Đã lưu ${successCount}/${total} bản ghi.`);
      }
  };

  // --- STATISTICS CALCULATION ---
  const calculateStatistics = () => {
      if (!courses.length || !registrations.length) return null;

      const totalCourses = courses.length;
      const upcomingCourses = courses.filter(c => new Date(c.startDate) >= new Date()).length;
      
      const categoryCount: Record<string, number> = {};
      courses.forEach(c => {
          categoryCount[c.category] = (categoryCount[c.category] || 0) + 1;
      });
      const categories = Object.keys(categoryCount).map(key => ({
          name: key,
          count: categoryCount[key],
          percent: Math.round((categoryCount[key] / totalCourses) * 100)
      })).sort((a, b) => b.count - a.count);

      const totalRegistrations = registrations.length;
      const approvedRegistrations = registrations.filter(r => r.status === 'confirmed').length;
      const approvalRate = totalRegistrations > 0 ? Math.round((approvedRegistrations / totalRegistrations) * 100) : 0;

      const regionStats: Record<string, number> = {};
      registrations.forEach(r => {
          const region = r.region || 'Khác';
          regionStats[region] = (regionStats[region] || 0) + 1;
      });

      const topRegions = Object.keys(regionStats).map(key => ({
          name: key,
          count: regionStats[key],
          percent: Math.round((regionStats[key] / totalRegistrations) * 100)
      })).sort((a, b) => b.count - a.count);

      return {
          totalCourses,
          upcomingCourses,
          totalRegistrations,
          approvedRegistrations,
          approvalRate,
          categories,
          topRegions
      };
  };

  // --- ACTIONS ---

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleSeedData = async () => {
    if(!confirm("XÁC NHẬN KHÔI PHỤC:\n\nHệ thống sẽ xóa toàn bộ dữ liệu hiện tại trên Google Sheet và tạo lại tài khoản Admin (admin/admin) cùng dữ liệu mẫu.\n\nBạn có chắc chắn không?")) return;
    setIsLoading(true);
    
    try {
      await seedDatabase(INITIAL_USERS, MOCK_COURSES);
      await delay(2000);
      alert("Khôi phục thành công! Đang tải lại dữ liệu...\nBạn có thể đăng nhập bằng tài khoản: admin / admin");
      await loadData();
    } catch (error) {
      console.error(error);
      alert("Có lỗi khi tạo dữ liệu mẫu.");
    } finally {
      setIsLoading(false);
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
        
        if (freshData && freshData.users) {
           setUsers(freshData.users);
           setCourses(freshData.courses || []);
           setRegistrations(freshData.registrations || []);
           // Load settings on login
           const loadedSettings = {
               popup: freshData.settings?.popup || { isActive: false, imageUrl: '', linkUrl: '' },
               webex: freshData.settings?.webex || { url: '', username: '', password: '' }
           };
           setSystemSettings(loadedSettings);
           
           setDbConnected(true);
           usersToCheck = freshData.users;
        }
  
        if (!usersToCheck || usersToCheck.length === 0) {
           if (confirm("CẢNH BÁO: Dữ liệu người dùng trên Google Sheet đang TRỐNG (có thể do bị xóa).\n\nBạn có muốn KHÔI PHỤC lại tài khoản Admin và dữ liệu mẫu ngay bây giờ không?")) {
              await handleSeedData();
              setIsLoggingIn(false);
              return;
           }
        }

        const inputUsername = authData.username.trim().toLowerCase();
        const inputPassword = authData.password.trim();
  
        const user = usersToCheck.find(u => 
          String(u.username).trim().toLowerCase() === inputUsername && 
          String(u.password).trim() === inputPassword
        );
        
        if (user) {
          setCurrentUser(user);
          localStorage.setItem('currentUser', JSON.stringify(user));
          // Route based on role
          if (user.role === UserRole.ADMIN) setActiveTab('calendar');
          else if (user.role === UserRole.TRAINER) setActiveTab('manage-courses');
          else if (user.role === UserRole.KA) setActiveTab('course-approvals');
          else if (user.role === UserRole.RSM) setActiveTab('catalog');
          else if (user.role === UserRole.PM) setActiveTab('manage-courses');
          else setActiveTab('calendar'); // ASM & Others
        } else {
          alert("Sai tên đăng nhập hoặc mật khẩu! (Lưu ý: Nếu đang Offline, chỉ dùng được tài khoản mẫu trong code)");
        }
      } else {
        if (users.find(u => u.username === authData.username)) {
          alert("Tên đăng nhập đã tồn tại!");
          setIsLoggingIn(false);
          return;
        }
        const newUser: User = {
          id: Math.random().toString(36).substr(2, 9),
          username: authData.username,
          password: authData.password,
          name: authData.name,
          role: authData.role,
          region: (authData.role as UserRole) === UserRole.ADMIN ? '' : authData.region,
          preferences: {
            emailNotification: true,
            browserNotification: false,
            compactMode: false
          }
        };
        
        setUsers([...users, newUser]);
        setCurrentUser(newUser);
        localStorage.setItem('currentUser', JSON.stringify(newUser));
        setActiveTab('calendar');
  
        await saveToSheet("Users", newUser, "add");
      }
    } catch (error) {
      console.error(error);
      alert("Có lỗi xảy ra trong quá trình đăng nhập.");
    } finally {
      setIsLoggingIn(false); 
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsSaving(true);
    
    const updatedUser: User = { 
      ...currentUser, 
      name: profileData.name || currentUser.name,
      email: profileData.email,
      phone: profileData.phone,
      bio: profileData.bio,
      password: profileData.password || currentUser.password,
      preferences: profileData.preferences
    };

    setUsers(users.map(u => u.id === currentUser.id ? updatedUser : u));
    setCurrentUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    
    await saveToSheet("Users", updatedUser, "update");
    setIsSaving(false);
    alert("Cập nhật thông tin thành công!");
  };

  const handleAdminUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setUsers(users.map(u => u.id === editingUser.id ? editingUser : u));
    
    setIsSaving(true);
    await saveToSheet("Users", editingUser, "update");
    setIsSaving(false);

    setEditingUser(null);
    alert("Cập nhật thông tin user thành công!");
    
    // Sync to ensure server has data
    setTimeout(() => loadData(true), 1500);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (users.find(u => u.username === newUser.username)) {
      alert("Tên đăng nhập đã tồn tại!");
      return;
    }
    
    const userToAdd: User = {
      id: 'u' + Date.now(),
      username: newUser.username || '',
      password: newUser.password || '123456', 
      name: newUser.name || '',
      role: newUser.role as UserRole,
      region: (newUser.role as UserRole) === UserRole.ADMIN ? '' : newUser.region,
      preferences: {
        emailNotification: true,
        browserNotification: false,
        compactMode: false
      }
    };

    setUsers([...users, userToAdd]);
    setIsAddingUser(false);
    setNewUser({ username: '', password: '', name: '', role: UserRole.ASM, region: ASM_REGIONS[0] });
    
    setIsSaving(true);
    await saveToSheet("Users", userToAdd, "add");
    setIsSaving(false);

    alert("Thêm người dùng thành công!");
    
    // Sync to ensure server has data
    setTimeout(() => loadData(true), 1500);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("CẢNH BÁO: Bạn có chắc chắn muốn XÓA người dùng này?\nHành động này sẽ xóa vĩnh viễn và không thể hoàn tác.")) return;
    
    setIsSaving(true);
    // Optimistic UI update
    setUsers(prev => prev.filter(u => u.id !== userId));
    
    const success = await saveToSheet("Users", { id: userId }, "delete");
    setIsSaving(false);
    
    if (success) {
       setTimeout(() => loadData(true), 1500);
    } else {
       alert("Lỗi: Không thể xóa người dùng trên hệ thống.");
       loadData(true); // Revert
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    setShowGlobalPopup(false);
    setAuthData({ username: '', password: '', name: '', role: UserRole.ASM, region: ASM_REGIONS[0] });
  };

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!currentUser) return;
    setIsSaving(true);
    
    let initialStatus: CourseApprovalStatus = 'trainer_approved';
    if (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.KA) {
         initialStatus = 'approved'; 
    }

    const course: Course = {
      id: 'c' + Date.now(),
      title: newCourse.title || '',
      description: newCourse.description || '',
      category: newCourse.category || 'Other',
      startDate: newCourse.startDate || '',
      endDate: newCourse.endDate || '',
      startTime: newCourse.startTime || '',
      endTime: newCourse.endTime || '',
      targetAudience: newCourse.targetAudience || 'Tất cả',
      format: newCourse.format as 'Online' | 'Offline' | 'Livestream' || 'Online',
      location: newCourse.location || '',
      imageUrl: newCourse.imageUrl || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=400',
      approvalStatus: initialStatus,
      creatorRole: currentUser.role
    };
    setCourses([course, ...courses]);
    setIsAddingCourse(false);
    setNewCourse({
      title: '', description: '', category: 'Sales', startDate: '', endDate: '', startTime: '', endTime: '', targetAudience: '',
      format: 'Online', location: '', imageUrl: '' 
    });
    setImagePreview(null); 
    await saveToSheet("Courses", course, "add");
    setIsSaving(false);
    alert(initialStatus === 'approved' ? "Đã tạo môn học thành công!" : "Đã gửi yêu cầu tạo môn (Chờ KA duyệt chốt)!");
  };

  const handleUpdateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;
    setIsSaving(true);

    const updatedCourse: Course = {
       ...editingCourse,
       approvalStatus: editingCourse.approvalStatus === 'rejected' ? 'trainer_approved' : editingCourse.approvalStatus
    };

    setCourses(prev => prev.map(c => c.id === editingCourse.id ? updatedCourse : c));
    const success = await saveToSheet("Courses", updatedCourse, "update");
    
    if (success) {
      setTimeout(async () => {
         await loadData(true);
         setIsSaving(false);
         setEditingCourse(null);
         alert(editingCourse.approvalStatus === 'rejected' 
            ? "Đã cập nhật và gửi lại yêu cầu phê duyệt!" 
            : "Cập nhật môn học thành công! Dữ liệu đã được đồng bộ.");
      }, 1500);
    } else {
       setIsSaving(false);
       setEditingCourse(null);
       alert("Đã gửi yêu cầu cập nhật.");
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!confirm("CẢNH BÁO: Bạn có chắc chắn muốn XÓA môn học này?\nHành động này sẽ xóa vĩnh viễn và không thể hoàn tác.")) return;
    
    setIsSaving(true);
    setCourses(prev => prev.filter(c => c.id !== courseId));
    
    const success = await saveToSheet("Courses", { id: courseId }, "delete");
    setIsSaving(false);
    
    if (success) {
       setTimeout(() => loadData(true), 1500);
    } else {
       alert("Lỗi: Không thể xóa môn học trên hệ thống.");
       loadData(true); 
    }
  };

  const handleCourseApproval = async (course: Course, newStatus: CourseApprovalStatus) => {
      const updatedCourse = { ...course, approvalStatus: newStatus };
      setCourses(prev => prev.map(c => c.id === course.id ? updatedCourse : c));
      await saveToSheet("Courses", updatedCourse, "update");
      
      if (newStatus === 'rejected') {
          alert("Đã từ chối môn học này.");
      } else if (newStatus === 'trainer_approved') {
          alert("Đã duyệt (Chờ KA duyệt chốt).");
      } else {
          alert("Đã duyệt chốt thành công!");
      }
  };

  const handleRegister = async () => {
    if (!currentUser || selectedCourseIds.length === 0) {
      alert("Vui lòng chọn môn học!");
      return;
    }
    
    setIsSaving(true); 
    isPollingAllowed.current = false; 
    
    const newRegs: Registration[] = selectedCourseIds.map(cid => {
      const course = courses.find(c => c.id === cid);
      return {
        id: Math.random().toString(36).substr(2, 9),
        courseId: cid,
        asmId: currentUser.id, 
        region: currentUser.region || 'Unknown', 
        date: course ? course.startDate : new Date().toISOString().split('T')[0], 
        status: 'pending' 
      };
    });

    for (const reg of newRegs) {
      await saveToSheet("Registrations", reg, "add");
      await delay(2000); 
    }
    
    setRegistrations(prev => [...prev, ...newRegs]);
    setSelectedCourseIds([]); 
    setIsSaving(false); 
    
    alert("Đăng ký thành công! Vui lòng chờ KA duyệt.");
    setActiveTab('registrations'); 
    
    setTimeout(() => {
      isPollingAllowed.current = true;
      loadData(true); 
    }, 20000);
  };

  const handleCancelRegistration = async (regId: string) => {
    if (!confirm("Bạn có chắc chắn muốn HỦY đăng ký môn học này không?")) return;
    setRegistrations(prev => prev.filter(r => r.id !== regId));
    isPollingAllowed.current = false;
    
    const success = await saveToSheet("Registrations", { id: regId }, "delete");
    
    if (success) {
      setTimeout(() => {
        isPollingAllowed.current = true;
        loadData(true);
      }, 5000);
    } else {
      alert("Có lỗi khi hủy đăng ký. Vui lòng thử lại.");
      isPollingAllowed.current = true;
      loadData(true);
    }
  };

  const handleRegistrationAction = async (reg: Registration, action: 'confirm' | 'reject') => {
    isPollingAllowed.current = false;

    if (action === 'reject') {
      if(!confirm("Bạn có chắc chắn muốn TỪ CHỐI và XÓA yêu cầu đăng ký này?")) {
        isPollingAllowed.current = true;
        return;
      }
      setRegistrations(prev => prev.filter(r => r.id !== reg.id));
      await saveToSheet("Registrations", { id: reg.id }, "delete");
    }

    if (action === 'confirm') {
      const updatedReg = { ...reg, status: 'confirmed' as const };
      setRegistrations(prev => prev.map(r => r.id === reg.id ? updatedReg : r));
      await saveToSheet("Registrations", updatedReg, "update");
    }

    setTimeout(() => {
      isPollingAllowed.current = true;
      loadData(true);
    }, 3000);
  };

  const handleGenerateSummary = async () => {
    if (selectedCourseIds.length === 0 || !currentUser) return;
    setIsGeneratingAi(true);
    const selected = courses.filter(c => selectedCourseIds.includes(c.id));
    const summary = await generateTrainingPlanSummary(selected, currentUser.region || 'Region');
    setAiSummary(summary || '');
    setIsGeneratingAi(false);
  };

  const handleSavePopupConfig = async () => {
    setIsSaving(true);
    // Pause background polling
    isPollingAllowed.current = false;
    
    const newSettings: SystemSettings = {
        ...systemSettings,
        popup: popupConfigForm
    };
    setSystemSettings(newSettings);
    
    await saveToSheet("Settings", popupConfigForm, "update");
    
    isEditingConfig.current = false;
    setIsSaving(false);
    isPollingAllowed.current = true;
    alert("Đã lưu cấu hình Popup!");
  };

  const handleSaveWebexConfig = async () => {
    setIsSaving(true);
    // Pause background polling
    isPollingAllowed.current = false;
    
    const newSettings: SystemSettings = {
        ...systemSettings,
        webex: webexConfigForm
    };
    setSystemSettings(newSettings);
    
    // Save to the dedicated "Webex" sheet
    await saveToSheet("Webex", webexConfigForm, "update");
    
    isEditingConfig.current = false;
    setIsSaving(false);
    isPollingAllowed.current = true;
    alert("Đã lưu cấu hình Webex (vào sheet riêng)!");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center flex-col gap-4">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium animate-pulse">Đang kết nối cơ sở dữ liệu Google Sheets...</p>
      </div>
    );
  }

  if (!currentUser) {
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
               
               <button 
                onClick={() => loadData(false)}
                disabled={isSyncing || isLoggingIn}
                className="flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-white text-slate-600 text-xs font-bold transition-colors disabled:opacity-50"
                title="Tải lại dữ liệu mới nhất"
               >
                 <svg className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                 {isSyncing ? 'Đang tải...' : 'Cập nhật'}
               </button>

               {users.length === 0 && (
                 <button 
                    onClick={handleSeedData}
                    disabled={isSyncing || isLoggingIn}
                    className="flex items-center gap-1 px-3 py-1 rounded-full border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold transition-colors disabled:opacity-50"
                    title="Xóa và tạo lại dữ liệu mẫu"
                 >
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

              <button 
                type="submit" 
                disabled={isLoggingIn}
                className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                  isLoggingIn 
                    ? 'bg-indigo-400 cursor-not-allowed text-indigo-100 shadow-none' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                }`}
              >
                {isLoggingIn && (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {isLoggingIn 
                  ? (isLoginView ? 'Đang Đăng Nhập...' : 'Đang Tạo Tài Khoản...') 
                  : (isLoginView ? 'Đăng Nhập' : 'Tạo Tài Khoản')
                }
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

      {/* GLOBAL POPUP OVERLAY */}
      {showGlobalPopup && systemSettings.popup.isActive && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShowGlobalPopup(false)}>
           <div className="relative max-w-md w-full bg-transparent rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-50 duration-500 ease-out" onClick={e => e.stopPropagation()}>
              <button 
                onClick={() => setShowGlobalPopup(false)}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition-colors z-10"
              >
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
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
        {/* Sidebar Desktop */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden lg:flex">
          {/* ... Sidebar header ... */}
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
          
          <nav className="flex-1 px-4 space-y-1">
            {/* ... Navigation links ... */}
            {currentUser.role === UserRole.ADMIN && (
              <>
                <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'users' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  Quản lý Users
                </button>
                <button onClick={() => setActiveTab('course-approvals')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'course-approvals' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Duyệt Đăng Ký
                </button>
              </>
            )}
            
            {/* TRAINER: Can create, Approve L1 Courses, NO Registration Approvals */}
            {currentUser.role === UserRole.TRAINER && (
              <>
               <button onClick={() => setActiveTab('manage-courses')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'manage-courses' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Quản lý Môn học
               </button>
               {/* TRAINER NO LONGER HAS APPROVAL RIGHTS */}
              </>
            )}

            {/* KA: Approve L2 Courses (Final) & REGISTRATIONS */}
            {currentUser.role === UserRole.KA && (
              <>
               <button onClick={() => setActiveTab('manage-courses')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'manage-courses' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Tạo Môn học
               </button>
               <button onClick={() => setActiveTab('course-approvals')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'course-approvals' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Duyệt Môn & Đăng Ký
               </button>
              </>
            )}

            {/* RSM: Can Register */}
            {currentUser.role === UserRole.RSM && (
              <>
               <button onClick={() => setActiveTab('manage-courses')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'manage-courses' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Tạo Môn học
               </button>
               <button onClick={() => setActiveTab('catalog')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'catalog' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                Đăng ký Môn học
              </button>
              </>
            )}

            {/* PM: Can Create */}
            {currentUser.role === UserRole.PM && (
               <button onClick={() => setActiveTab('manage-courses')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'manage-courses' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Tạo Môn học
               </button>
            )}

            <button onClick={() => setActiveTab('calendar')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'calendar' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
              Lịch đào tạo
            </button>
            {currentUser.role === UserRole.RSM && (
              <button onClick={() => setActiveTab('registrations')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'registrations' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Đã đăng ký
              </button>
            )}
            
            {/* TOOLS TAB - Available for everyone but content differs */}
            <button onClick={() => setActiveTab('tools')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'tools' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                Công cụ & Tiện ích
            </button>
            
            <div className="pt-4 pb-2 border-t border-slate-100 mt-4 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cá nhân</div>
            <button onClick={() => setActiveTab('profile')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'profile' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              Thông tin cá nhân
            </button>
            <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${activeTab === 'settings' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Cài đặt tài khoản
            </button>
          </nav>
        </aside>

        {/* Mobile Bottom Navigation */}
        <BottomNavigation activeTab={activeTab} setActiveTab={setActiveTab} role={currentUser.role} />

        {/* Main Content Area */}
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

            {/* ... USERS TAB ... */}
            {activeTab === 'users' && currentUser.role === UserRole.ADMIN && (
               <div className="space-y-6">
                  {/* ... User Management Logic (Unchanged) ... */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h2 className="text-2xl font-black text-slate-800">Quản lý người dùng</h2>
                    <div className="flex gap-2 items-center w-full md:w-auto">
                      <button onClick={handleSeedData} className="flex-1 md:flex-none bg-amber-100 text-amber-700 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-amber-200 transition-colors flex items-center justify-center gap-2">
                        <span className="hidden sm:inline">Khởi tạo</span> Data Mẫu
                      </button>
                      <button onClick={() => setIsAddingUser(true)} className="flex-1 md:flex-none bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors">
                        Thêm <span className="hidden sm:inline">người dùng</span>
                      </button>
                    </div>
                  </div>
                  {/* ... Table User ... */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                    <table className="w-full text-left min-w-[600px]">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Họ Tên & Username</th>
                          <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Chức Vụ</th>
                          <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Vùng Miền</th>
                          <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">Hành Động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {users.map(u => (
                          <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold overflow-hidden">
                                  {u.avatarUrl ? <img src={u.avatarUrl} className="w-full h-full object-cover" /> : (u.name ? u.name.charAt(0) : '?')}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800">{u.name}</p>
                                  <p className="text-xs text-slate-400">@{u.username}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter ${
                                u.role === UserRole.ADMIN ? 'bg-purple-50 text-purple-600' : 
                                u.role === UserRole.RSM ? 'bg-emerald-50 text-emerald-600' :
                                u.role === UserRole.KA ? 'bg-pink-50 text-pink-600' :
                                u.role === UserRole.PM ? 'bg-cyan-50 text-cyan-600' :
                                u.role === UserRole.ASM ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'
                              }`}>{u.role}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm font-medium text-slate-600">{u.region || 'Tất cả'}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <button onClick={() => setEditingUser(u)} className="text-indigo-600 hover:text-indigo-800 text-sm font-bold">Chỉnh sửa</button>
                                {u.username !== 'admin' && (
                                  <button onClick={() => handleDeleteUser(u.id)} className="text-red-500 hover:text-red-700 text-sm font-bold">Xóa</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* EDIT USER MODAL */}
                  {editingUser && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 md:p-8">
                          <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                            <span className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </span>
                            Chỉnh Sửa Người Dùng
                          </h3>
                          <form onSubmit={handleAdminUpdateUser} className="space-y-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Họ Tên</label>
                              <input 
                                required 
                                type="text" 
                                value={editingUser.name} 
                                onChange={e => setEditingUser({...editingUser, name: e.target.value})} 
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium" 
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Chức Vụ</label>
                                <select 
                                  value={editingUser.role} 
                                  onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})} 
                                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                                >
                                  <option value={UserRole.ASM}>ASM</option>
                                  <option value={UserRole.RSM}>RSM</option>
                                  <option value={UserRole.TRAINER}>TRAINER</option>
                                  <option value={UserRole.PM}>PM</option>
                                  <option value={UserRole.KA}>KA</option>
                                  <option value={UserRole.ADMIN}>ADMIN</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Khu Vực</label>
                                <select 
                                  value={editingUser.region || ''} 
                                  onChange={e => setEditingUser({...editingUser, region: e.target.value})} 
                                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                                >
                                  <option value="">Tất cả</option>
                                  {[...ASM_REGIONS, ...TRAINER_REGIONS].map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Đặt lại mật khẩu (Tùy chọn)</label>
                              <input 
                                type="text" 
                                value={editingUser.password} 
                                onChange={e => setEditingUser({...editingUser, password: e.target.value})} 
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium" 
                                placeholder="Nhập mật khẩu mới"
                              />
                            </div>
                            <div className="flex gap-3 pt-4">
                              <button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors">Hủy</button>
                              <button type="submit" className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-colors">Lưu Thay Đổi</button>
                            </div>
                          </form>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ADD USER MODAL */}
                  {isAddingUser && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 md:p-8">
                          <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                            <span className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                            </span>
                            Thêm Người Dùng Mới
                          </h3>
                          <form onSubmit={handleCreateUser} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tên Đăng Nhập</label>
                                <input required type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" placeholder="username" />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Mật Khẩu</label>
                                <input required type="text" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" placeholder="password" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Họ Tên</label>
                              <input required type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium" placeholder="Nguyễn Văn A" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Chức Vụ</label>
                                <select 
                                  value={newUser.role} 
                                  onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})} 
                                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                                >
                                  <option value={UserRole.ASM}>ASM</option>
                                  <option value={UserRole.RSM}>RSM</option>
                                  <option value={UserRole.TRAINER}>TRAINER</option>
                                  <option value={UserRole.PM}>PM</option>
                                  <option value={UserRole.KA}>KA</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Khu Vực</label>
                                <select 
                                  value={newUser.region} 
                                  onChange={e => setNewUser({...newUser, region: e.target.value})} 
                                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-medium"
                                >
                                  {(newUser.role === UserRole.TRAINER ? TRAINER_REGIONS : ASM_REGIONS).map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex gap-3 pt-4">
                              <button type="button" onClick={() => setIsAddingUser(false)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors">Hủy</button>
                              <button type="submit" className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-colors">Tạo Tài Khoản</button>
                            </div>
                          </form>
                        </div>
                      </div>
                    </div>
                  )}
               </div>
            )}

            {/* TOOLS TAB - UPDATED ATTENDANCE LOGIC */}
             {activeTab === 'tools' && currentUser && (
               <div className="space-y-6">
                 <h2 className="text-2xl font-black text-slate-800">Công Cụ & Tiện Ích</h2>
                 
                 {/* ... Popup & Webex Config Cards (Admin/KA) ... */}
                 {(currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.KA) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                     {/* Global Popup Config */}
                     <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                         <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-slate-800 text-lg">Cấu Hình Popup</h3>
                            <div className="flex items-center gap-2">
                                 <span className={`text-xs font-bold ${popupConfigForm.isActive ? 'text-green-600' : 'text-slate-400'}`}>
                                    {popupConfigForm.isActive ? 'Bật' : 'Tắt'}
                                 </span>
                                 <button 
                                   onClick={() => {
                                       isEditingConfig.current = true;
                                       setPopupConfigForm(prev => ({...prev, isActive: !prev.isActive}));
                                   }}
                                   className={`w-10 h-5 rounded-full p-1 transition-colors ${popupConfigForm.isActive ? 'bg-green-500' : 'bg-slate-300'}`}
                                 >
                                    <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${popupConfigForm.isActive ? 'translate-x-5' : ''}`}></div>
                                 </button>
                            </div>
                         </div>
                         
                         <div className="flex gap-4">
                             <div className="w-24 h-24 shrink-0 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center overflow-hidden relative group">
                                {popupConfigForm.imageUrl ? (
                                    <img src={popupConfigForm.imageUrl} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-slate-400 text-[10px]">No Image</span>
                                )}
                                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleImageUpload(e, 'popup')} />
                             </div>
                             <div className="flex-1 space-y-2">
                                <div>
                                    <input 
                                        type="text" 
                                        value={popupConfigForm.linkUrl} 
                                        onChange={e => {
                                            isEditingConfig.current = true;
                                            setPopupConfigForm({...popupConfigForm, linkUrl: e.target.value});
                                        }}
                                        placeholder="Link liên kết (https://...)"
                                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                                    />
                                </div>
                                <button 
                                    onClick={handleSavePopupConfig}
                                    disabled={isSaving}
                                    className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-xs hover:bg-indigo-700 transition-colors"
                                >
                                    {isSaving ? 'Đang lưu...' : 'Lưu Popup'}
                                </button>
                             </div>
                         </div>
                     </div>

                     {/* Webex Config */}
                     <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                         <div className="mb-4">
                            <h3 className="font-bold text-slate-800 text-lg">Cấu Hình Webex</h3>
                            <p className="text-xs text-slate-500">Thiết lập thông tin đăng nhập chung cho công cụ tạo lịch họp.</p>
                         </div>
                         <div className="space-y-3">
                             <input 
                                type="text"
                                value={webexConfigForm.url}
                                onChange={e => {
                                    isEditingConfig.current = true;
                                    setWebexConfigForm({...webexConfigForm, url: e.target.value});
                                }}
                                placeholder="URL Trang Đăng Nhập (https://signin.webex.com...)"
                                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                             />
                             <div className="grid grid-cols-2 gap-3">
                                 <input 
                                    type="text"
                                    value={webexConfigForm.username}
                                    onChange={e => {
                                        isEditingConfig.current = true;
                                        setWebexConfigForm({...webexConfigForm, username: e.target.value});
                                    }}
                                    placeholder="Username / Email"
                                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                                 />
                                 <input 
                                    type="text"
                                    value={webexConfigForm.password}
                                    onChange={e => {
                                        isEditingConfig.current = true;
                                        setWebexConfigForm({...webexConfigForm, password: e.target.value});
                                    }}
                                    placeholder="Password"
                                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                                 />
                             </div>
                             <button 
                                onClick={handleSaveWebexConfig}
                                disabled={isSaving}
                                className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold text-xs hover:bg-blue-700 transition-colors"
                             >
                                {isSaving ? 'Đang lưu...' : 'Lưu Cấu Hình Webex'}
                             </button>
                         </div>
                     </div>
                  </div>
                )}
                 
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                   {/* WEBEX TOOL */}
                   <div 
                      onClick={() => setActiveTool('webex')}
                      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group relative overflow-hidden"
                   >
                      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                          <svg className="w-16 h-16 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                      </div>
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </div>
                      <h3 className="font-bold text-slate-800 mb-1">Tạo Lịch Họp (Webex)</h3>
                      <p className="text-xs text-slate-500">Truy cập nhanh hệ thống phòng họp.</p>
                   </div>

                   <div 
                      onClick={() => setActiveTool('attendance')}
                      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                   >
                      <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <h3 className="font-bold text-slate-800 mb-1">Quản Lý Điểm Danh</h3>
                      <p className="text-xs text-slate-500">Upload và xử lý file sau đào tạo.</p>
                   </div>
                   
                   <div 
                      onClick={() => setActiveTool('statistics')}
                      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer group"
                   >
                      <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      </div>
                      <h3 className="font-bold text-slate-800 mb-1">Báo Cáo Thống Kê</h3>
                      <p className="text-xs text-slate-500">Xem tiến độ đào tạo vùng.</p>
                   </div>
                 </div>
                 
                 {/* WEBEX LAUNCHER MODAL */}
                 {activeTool === 'webex' && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                       <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl">
                          <div className="p-8">
                             <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                             </div>
                             
                             <h3 className="text-xl font-black text-center text-slate-800 mb-2">Hệ Thống Họp Trực Tuyến</h3>
                             <p className="text-center text-slate-500 text-sm mb-8">
                                Hệ thống sẽ mở trang Webex. Vui lòng sử dụng thông tin tài khoản dưới đây để đăng nhập nếu chưa lưu phiên làm việc.
                             </p>

                             <div className="space-y-4 mb-8">
                                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                     <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Tài khoản (Email)</p>
                                     <div className="flex items-center justify-between">
                                         <p className="font-bold text-slate-800">{systemSettings.webex?.username || 'Chưa cấu hình'}</p>
                                         <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(systemSettings.webex?.username || '');
                                                alert("Đã copy tài khoản!");
                                            }}
                                            className="text-slate-400 hover:text-indigo-600 p-1"
                                         >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                         </button>
                                     </div>
                                 </div>
                                 
                                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                     <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Mật khẩu</p>
                                     <div className="flex items-center justify-between">
                                         <p className="font-bold text-slate-800">
                                            {showWebexPassword ? (systemSettings.webex?.password || 'Chưa cấu hình') : '••••••••'}
                                         </p>
                                         <div className="flex gap-2">
                                            <button 
                                                onClick={() => setShowWebexPassword(!showWebexPassword)}
                                                className="text-slate-400 hover:text-indigo-600 p-1"
                                            >
                                                {showWebexPassword ? (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                )}
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(systemSettings.webex?.password || '');
                                                    alert("Đã copy mật khẩu!");
                                                }}
                                                className="text-slate-400 hover:text-indigo-600 p-1"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                            </button>
                                         </div>
                                     </div>
                                 </div>
                             </div>

                             <div className="flex gap-3">
                                <button 
                                    onClick={() => setActiveTool(null)}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                                >
                                    Đóng
                                </button>
                                <a 
                                    href={systemSettings.webex?.url || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors text-center shadow-lg shadow-blue-200"
                                    onClick={() => setActiveTool(null)}
                                >
                                    Mở Webex
                                </a>
                             </div>
                          </div>
                       </div>
                    </div>
                 )}

                 {/* ATTENDANCE MANAGEMENT MODAL - UPDATED */}
                 {activeTool === 'attendance' && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                       <div className="bg-slate-50 rounded-3xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 shadow-2xl">
                          <div className="bg-white p-4 lg:p-6 border-b border-slate-200 flex justify-between items-center shrink-0">
                             <div>
                                <h3 className="text-xl font-black text-slate-800">Quản Lý Điểm Danh & Đánh Giá</h3>
                                <p className="text-sm text-slate-500 font-medium">Nhập liệu và theo dõi kết quả sau đào tạo</p>
                             </div>
                             <button onClick={() => setActiveTool(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                             </button>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto p-4 lg:p-6 bg-slate-50">
                             <div className="space-y-6">
                                {/* Upload Section */}
                                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                                   <div className="flex justify-between items-start mb-4">
                                       <div>
                                           <h4 className="font-bold text-slate-800 text-lg mb-2">Tải lên danh sách điểm danh</h4>
                                           <p className="text-sm text-slate-500">Hỗ trợ file Excel (.xlsx, .xls) hoặc CSV. File cần có các cột: ID, Ngày, Check in, Check out, Môn học, Họ và Tên, Inside, Địa chỉ shop làm việc, Email, ASM, Email ASM, Feedback.</p>
                                       </div>
                                       <button 
                                           onClick={handleDownloadTemplate}
                                           className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors border border-indigo-100 whitespace-nowrap"
                                       >
                                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                           Tải File Mẫu
                                       </button>
                                   </div>

                                   <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                                      <div className="flex-1 w-full">
                                         <div className="relative group w-full">
                                            <input 
                                               type="file" 
                                               accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                                               onChange={handleFileUpload}
                                               disabled={isProcessingFile || uploadStatus === 'uploading'}
                                               className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                                            />
                                            <div className="flex items-center gap-3 px-6 py-4 border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50/50 group-hover:bg-indigo-50 transition-colors">
                                               <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                                                  {isProcessingFile ? (
                                                     <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                                  ) : (
                                                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                  )}
                                               </div>
                                               <div>
                                                  <p className="text-sm font-bold text-indigo-900">{isProcessingFile ? 'Đang xử lý...' : 'Chọn file từ máy tính'}</p>
                                                  <p className="text-xs text-indigo-400">Kéo thả hoặc nhấn để chọn</p>
                                               </div>
                                            </div>
                                         </div>
                                      </div>
                                      
                                      {attendanceData.length > 0 && (
                                         <div className="flex gap-4 items-center w-full md:w-auto">
                                            <div className="bg-emerald-50 px-5 py-3 rounded-xl border border-emerald-100 text-center min-w-[120px]">
                                               <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Hiện diện</p>
                                               <p className="text-2xl font-black text-emerald-700">{attendanceData.length}</p>
                                            </div>
                                            
                                            <button 
                                                onClick={handleSyncAttendance}
                                                disabled={uploadStatus === 'uploading'}
                                                className={`h-full px-6 rounded-xl font-bold text-sm shadow-lg transition-all flex flex-col items-center justify-center min-w-[140px] ${
                                                    uploadStatus === 'uploading' ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 
                                                    uploadStatus === 'success' ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-200' :
                                                    'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                                                }`}
                                            >
                                                {uploadStatus === 'uploading' ? (
                                                    <>
                                                        <span className="mb-1">Đang lưu...</span>
                                                        <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
                                                            <div className="h-full bg-indigo-500 transition-all duration-300" style={{width: `${uploadProgress}%`}}></div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                                        <span>Lưu vào Database</span>
                                                    </>
                                                )}
                                            </button>
                                         </div>
                                      )}
                                   </div>
                                </div>

                                {/* Table Section - Updated with requested columns */}
                                {attendanceData.length > 0 ? (
                                   <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                      <div className="overflow-x-auto">
                                         <table className="w-full text-left border-collapse">
                                            <thead>
                                               <tr className="bg-slate-50 border-b border-slate-200">
                                                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap sticky left-0 bg-slate-50 z-10 border-r border-slate-100">ID</th>
                                                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap sticky left-[60px] bg-slate-50 z-10 border-r border-slate-100">Họ và Tên</th>
                                                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap">Môn học</th>
                                                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap">Ngày</th>
                                                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap text-center">Check-in</th>
                                                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap text-center">Check-out</th>
                                                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap">Inside</th>
                                                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap">Shop</th>
                                                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap">ASM (Email)</th>
                                                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-wider min-w-[200px]">Feedback</th>
                                               </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 text-sm">
                                               {attendanceData.map((record) => (
                                                  <tr key={record.id} className="hover:bg-slate-50 transition-colors group">
                                                     <td className="px-4 py-3 text-xs font-mono text-slate-500 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100">{record.id}</td>
                                                     <td className="px-4 py-3 font-bold text-slate-800 sticky left-[60px] bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                                        {record.fullName}
                                                        <div className="text-[10px] font-normal text-slate-400">{record.email}</div>
                                                     </td>
                                                     <td className="px-4 py-3 text-slate-700 font-medium text-xs max-w-[150px] truncate" title={record.courseName}>{record.courseName}</td>
                                                     <td className="px-4 py-3 text-slate-600 text-xs">{record.date}</td>
                                                     <td className="px-4 py-3 text-center font-mono text-xs text-slate-500">{record.checkIn}</td>
                                                     <td className="px-4 py-3 text-center font-mono text-xs text-slate-500">{record.checkOut}</td>
                                                     <td className="px-4 py-3 text-slate-600 font-mono text-xs">{record.insideId}</td>
                                                     <td className="px-4 py-3 text-slate-600 text-xs max-w-[150px] truncate" title={record.shopAddress}>{record.shopAddress}</td>
                                                     <td className="px-4 py-3 text-slate-600 text-xs">
                                                        <div className="font-bold">{record.asm}</div>
                                                        <div className="text-[10px] text-slate-400">{record.asmEmail}</div>
                                                     </td>
                                                     <td className="px-4 py-3 text-slate-500 italic text-xs max-w-[200px] truncate" title={record.feedback}>{record.feedback || '-'}</td>
                                                  </tr>
                                               ))}
                                            </tbody>
                                         </table>
                                      </div>
                                   </div>
                                ) : (
                                   <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 border-dashed">
                                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                         <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                      </div>
                                      <h3 className="font-bold text-slate-800">Chưa có dữ liệu</h3>
                                      <p className="text-sm text-slate-500 mt-1">Vui lòng tải lên file điểm danh để xem báo cáo.</p>
                                   </div>
                                )}
                             </div>
                          </div>
                       </div>
                    </div>
                 )}
                 
                 {/* ... Statistics Modal (Unchanged) ... */}
                 {activeTool === 'statistics' && calculateStatistics() && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                       <div className="bg-slate-50 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 shadow-2xl">
                          <div className="bg-white p-4 lg:p-6 border-b border-slate-200 flex justify-between items-center shrink-0">
                             <div>
                                <h3 className="text-xl font-black text-slate-800">Dashboard Thống Kê</h3>
                                <p className="text-sm text-slate-500 font-medium">Tổng quan hoạt động đào tạo toàn quốc</p>
                             </div>
                             <button onClick={() => setActiveTool(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                             </button>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
                             {/* ... KPI Cards & Charts logic remains exactly same as before ... */}
                             {(() => {
                                 const stats = calculateStatistics()!;
                                 return (
                                    <>
                                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                                             <div className="flex items-center justify-between mb-2">
                                                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Tổng Môn Học</span>
                                                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                                                </div>
                                             </div>
                                             <p className="text-3xl font-black text-slate-800">{stats.totalCourses}</p>
                                             <p className="text-xs text-slate-500 mt-1"><span className="text-emerald-500 font-bold">+{stats.upcomingCourses}</span> môn sắp diễn ra</p>
                                          </div>
                                          
                                          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                                             <div className="flex items-center justify-between mb-2">
                                                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Tổng Đăng Ký</span>
                                                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                </div>
                                             </div>
                                             <p className="text-3xl font-black text-slate-800">{stats.totalRegistrations}</p>
                                             <p className="text-xs text-slate-500 mt-1">Học viên tham gia</p>
                                          </div>

                                          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                                             <div className="flex items-center justify-between mb-2">
                                                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Tỉ Lệ Duyệt</span>
                                                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                </div>
                                             </div>
                                             <p className="text-3xl font-black text-slate-800">{stats.approvalRate}%</p>
                                             <p className="text-xs text-slate-500 mt-1">{stats.approvedRegistrations} lượt đã duyệt</p>
                                          </div>

                                          <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-5 rounded-2xl shadow-lg text-white">
                                             <div className="flex items-center justify-between mb-2">
                                                <span className="text-indigo-200 text-xs font-bold uppercase tracking-wider">AI Insight</span>
                                                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                </div>
                                             </div>
                                             <p className="text-sm font-medium leading-snug">
                                                {stats.topRegions[0] 
                                                    ? `${stats.topRegions[0].name} đang dẫn đầu về hoạt động đào tạo. Cần thúc đẩy thêm các vùng khác.`
                                                    : 'Chưa có đủ dữ liệu để phân tích xu hướng.'}
                                             </p>
                                          </div>
                                       </div>

                                       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
                                             <h4 className="font-bold text-slate-800 mb-6">Hoạt Động Theo Khu Vực (Top Racing)</h4>
                                             <div className="space-y-4">
                                                {stats.topRegions.map((region, idx) => (
                                                   <div key={idx} className="group">
                                                      <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                                         <span>{region.name}</span>
                                                         <span>{region.count} lượt</span>
                                                      </div>
                                                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                                         <div 
                                                            className={`h-full rounded-full transition-all duration-1000 ease-out ${
                                                               idx === 0 ? 'bg-indigo-600' : 
                                                               idx === 1 ? 'bg-indigo-500' : 
                                                               idx === 2 ? 'bg-indigo-400' : 'bg-slate-300'
                                                            }`} 
                                                            style={{ width: `${region.percent}%` }}
                                                         ></div>
                                                      </div>
                                                   </div>
                                                ))}
                                             </div>
                                          </div>

                                          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                             <h4 className="font-bold text-slate-800 mb-6">Phân Bổ Nội Dung</h4>
                                             <div className="space-y-5">
                                                {stats.categories.map((cat, idx) => (
                                                   <div key={idx} className="flex items-center gap-3">
                                                      <div className="flex-1">
                                                         <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                                            <span>{cat.name}</span>
                                                            <span className="text-slate-400">{cat.percent}%</span>
                                                         </div>
                                                         <div className="w-full bg-slate-100 rounded-full h-2">
                                                            <div 
                                                               className={`h-full rounded-full ${
                                                                  cat.name === 'Sales' ? 'bg-emerald-500' : 
                                                                  cat.name === 'Product' ? 'bg-blue-500' : 
                                                                  cat.name === 'Soft Skills' ? 'bg-purple-500' : 'bg-orange-500'
                                                               }`} 
                                                               style={{ width: `${cat.percent}%` }}
                                                            ></div>
                                                         </div>
                                                      </div>
                                                   </div>
                                                ))}
                                                {stats.categories.length === 0 && <p className="text-slate-400 text-sm text-center">Chưa có môn học nào.</p>}
                                             </div>
                                          </div>
                                       </div>
                                    </>
                                 );
                             })()}
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
