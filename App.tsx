import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole, Course, Registration, SystemSettings, PopupConfig, CourseApprovalStatus } from './types';
import { ASM_REGIONS, TRAINER_REGIONS, INITIAL_USERS, MOCK_COURSES } from './constants';
import DashboardHeader from './components/DashboardHeader';
import CourseCalendar from './components/CourseCalendar';
import BottomNavigation from './components/BottomNavigation';
import { generateTrainingPlanSummary, removeImageBackground } from './services/geminiService';
import { fetchAllData, saveToSheet, seedDatabase } from './services/googleSheetService';

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
  
  // System Settings State (Popup)
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    popup: { isActive: false, imageUrl: '', linkUrl: '' }
  });
  const [showGlobalPopup, setShowGlobalPopup] = useState(false);
  const [popupConfigForm, setPopupConfigForm] = useState<PopupConfig>({ isActive: false, imageUrl: '', linkUrl: '' });
  
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

  // --- TOOL STATES (BG REMOVER) ---
  const [activeTool, setActiveTool] = useState<'bg-remover' | null>(null);
  const [bgRemoverImg, setBgRemoverImg] = useState<string | null>(null);
  const [bgRemoverResult, setBgRemoverResult] = useState<string | null>(null);
  const [isProcessingBg, setIsProcessingBg] = useState(false);

  // --- DATA LOADING ---
  const loadData = async (isBackground = false) => {
    if (isBackground && !isPollingAllowed.current) return;

    if (!isBackground) setIsLoading(true);
    else setIsSyncing(true);

    const data = await fetchAllData();
    if (data) {
      setUsers(data.users || []);
      setCourses(data.courses || []);
      setRegistrations(data.registrations || []);
      
      // Load Settings if available, otherwise defaults
      if (data.settings && data.settings.popup) {
        setSystemSettings({ popup: data.settings.popup });
        setPopupConfigForm(data.settings.popup);
      }
      
      setDbConnected(true);
    } else {
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
    }

    if (!isBackground) setIsLoading(false);
    else setIsSyncing(false);
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'course' | 'user' | 'course_edit' | 'popup' | 'bg_remover') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("Vui lòng chọn file ảnh!");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const MAX_WIDTH = target === 'popup' ? 800 : target === 'bg_remover' ? 1024 : 400; 
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = height * (MAX_WIDTH / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        const base64Data = canvas.toDataURL('image/png', target === 'popup' || target === 'bg_remover' ? 0.9 : 0.7);
        
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
        } else if (target === 'bg_remover') {
          setBgRemoverImg(base64Data);
          setBgRemoverResult(null); // Reset result
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleProcessBgRemoval = async () => {
      if (!bgRemoverImg) return;
      setIsProcessingBg(true);
      
      try {
        const resultImage = await removeImageBackground(bgRemoverImg);
        if (resultImage) {
            setBgRemoverResult(resultImage);
        } else {
            alert("Không thể xử lý ảnh. Vui lòng thử lại với ảnh khác.");
        }
      } catch (error) {
        console.error(error);
        alert("Có lỗi xảy ra khi gọi AI.");
      } finally {
        setIsProcessingBg(false);
      }
  };

  const getLocationPlaceholder = (fmt: string) => {
    switch (fmt) {
        case 'Online': return 'Link Zoom / Google Meet / Teams...';
        case 'Offline': return 'Địa chỉ văn phòng / Tên phòng họp cụ thể';
        case 'Livestream': return 'Link phát trực tiếp (Youtube, Facebook...)';
        default: return 'Địa điểm tổ chức';
    }
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

    try {
      if (isLoginView) {
        const freshData = await fetchAllData();
        let usersToCheck = users;
        
        if (freshData && freshData.users) {
           setUsers(freshData.users);
           setCourses(freshData.courses || []);
           setRegistrations(freshData.registrations || []);
           if (freshData.settings && freshData.settings.popup) {
              setSystemSettings({ popup: freshData.settings.popup });
           }
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
          region: authData.role === UserRole.ADMIN ? '' : authData.region 
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

    // LOGIC: Who creates determines status
    // KA/Admin -> 'approved' directly (optional, usually they are final)
    // Trainer/PM/RSM -> 'trainer_approved' (Meaning: Pending KA Approval)
    // Note: We skip 'pending_trainer' because trainers don't approve anymore.
    
    let initialStatus: CourseApprovalStatus = 'trainer_approved';
    if (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.KA) {
         // Optionally KA can create and auto-approve, but let's stick to draft flow or direct approve.
         // Let's assume KA creates as 'approved' or can edit later.
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

    // If a course was rejected, editing it should reset it to 'trainer_approved' (Pending KA) so KA can review again
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
    // Only verify server side, but client side we just double check role
    // though the button should be hidden for TRAINER.
    if (!confirm("CẢNH BÁO: Bạn có chắc chắn muốn XÓA môn học này?\nHành động này sẽ xóa vĩnh viễn và không thể hoàn tác.")) return;
    
    setIsSaving(true);
    // Optimistic UI update
    setCourses(prev => prev.filter(c => c.id !== courseId));
    
    const success = await saveToSheet("Courses", { id: courseId }, "delete");
    setIsSaving(false);
    
    if (success) {
       setTimeout(() => loadData(true), 1500);
    } else {
       alert("Lỗi: Không thể xóa môn học trên hệ thống.");
       loadData(true); // Revert
    }
  };

  // Logic for approving COURSES (creation flow)
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

  // Logic for approving REGISTRATIONS (Trainer)
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

  // --- SAVE SETTINGS (POPUP) ---
  const handleSavePopupConfig = async () => {
     setIsSaving(true);
     const newSettings: SystemSettings = {
         ...systemSettings,
         popup: popupConfigForm
     };
     setSystemSettings(newSettings);
     await saveToSheet("Settings", newSettings.popup, "update");
     setIsSaving(false);
     alert("Đã lưu cấu hình Popup!");
  };

  // --- RENDER LOADING ---
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center flex-col gap-4">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium animate-pulse">Đang kết nối cơ sở dữ liệu Google Sheets...</p>
      </div>
    );
  }

  // --- RENDER LOGIN ---
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
          <div className="max-w-6xl mx-auto">
            
            {/* ... USERS TAB ... */}
            {activeTab === 'users' && currentUser.role === UserRole.ADMIN && (
               <div className="space-y-6">
                {/* ... User Management Content (Unchanged) ... */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <h2 className="text-2xl font-black text-slate-800">Quản lý người dùng</h2>
                  <div className="flex gap-2 items-center w-full md:w-auto">
                    <button onClick={handleSeedData} className="flex-1 md:flex-none bg-amber-100 text-amber-700 px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-amber-200 transition-colors flex items-center justify-center gap-2">
                       <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                       <span className="hidden sm:inline">Khởi tạo</span> Data Mẫu
                    </button>
                    <button onClick={() => setIsAddingUser(true)} className="flex-1 md:flex-none bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                      Thêm <span className="hidden sm:inline">người dùng</span>
                    </button>
                  </div>
                </div>
                
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

                {/* ADD USER MODAL */}
                {isAddingUser && (
                   <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                      <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                         <h3 className="text-xl font-black mb-4">Thêm Người Dùng Mới</h3>
                         <form onSubmit={handleCreateUser} className="space-y-4">
                            <div>
                               <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Họ Tên</label>
                               <input type="text" required value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Nguyễn Văn A" />
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tên Đăng Nhập</label>
                               <input type="text" required value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="username" />
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Mật Khẩu</label>
                               <input type="password" required value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="••••••••" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                               <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Chức Vụ</label>
                                  <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                                     <option value={UserRole.ASM}>ASM</option>
                                     <option value={UserRole.RSM}>RSM</option>
                                     <option value={UserRole.TRAINER}>Giảng Viên</option>
                                     <option value={UserRole.PM}>PM (Product)</option>
                                     <option value={UserRole.KA}>KA (Key Account)</option>
                                     <option value={UserRole.ADMIN}>Admin</option>
                                  </select>
                               </div>
                               <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Khu Vực</label>
                                  <select 
                                    disabled={newUser.role === UserRole.ADMIN} 
                                    value={newUser.region} 
                                    onChange={e => setNewUser({...newUser, region: e.target.value})} 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                                  >
                                     {(newUser.role === UserRole.TRAINER ? TRAINER_REGIONS : ASM_REGIONS).map(r => (
                                       <option key={r} value={r}>{r}</option>
                                     ))}
                                  </select>
                               </div>
                            </div>
                            <div className="flex gap-4 pt-4 border-t border-slate-100 mt-4">
                               <button type="submit" disabled={isSaving} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-70">
                                   {isSaving ? 'Đang Lưu...' : 'Thêm Người Dùng'}
                               </button>
                               <button type="button" onClick={() => setIsAddingUser(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all">
                                   Hủy Bỏ
                                </button>
                            </div>
                         </form>
                      </div>
                   </div>
                )}

                {/* EDIT USER MODAL */}
                {editingUser && (
                   <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                      <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                         <h3 className="text-xl font-black mb-4">Chỉnh Sửa Thông Tin</h3>
                         <form onSubmit={handleAdminUpdateUser} className="space-y-4">
                            <div>
                               <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tên Đăng Nhập (Không thể đổi)</label>
                               <input type="text" disabled value={editingUser.username} className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed" />
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Họ Tên</label>
                               <input type="text" required value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Mật Khẩu Mới</label>
                               <input type="text" value={editingUser.password} onChange={e => setEditingUser({...editingUser, password: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Nhập mật khẩu mới..." />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                               <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Chức Vụ</label>
                                  <select value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                                     <option value={UserRole.ASM}>ASM</option>
                                     <option value={UserRole.RSM}>RSM</option>
                                     <option value={UserRole.TRAINER}>Giảng Viên</option>
                                     <option value={UserRole.PM}>PM (Product)</option>
                                     <option value={UserRole.KA}>KA (Key Account)</option>
                                     <option value={UserRole.ADMIN}>Admin</option>
                                  </select>
                               </div>
                               <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Khu Vực</label>
                                  <select 
                                    disabled={editingUser.role === UserRole.ADMIN} 
                                    value={editingUser.region} 
                                    onChange={e => setEditingUser({...editingUser, region: e.target.value})} 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                                  >
                                     {(editingUser.role === UserRole.TRAINER ? TRAINER_REGIONS : ASM_REGIONS).map(r => (
                                       <option key={r} value={r}>{r}</option>
                                     ))}
                                  </select>
                               </div>
                            </div>
                            <div className="flex gap-4 pt-4 border-t border-slate-100 mt-4">
                               <button type="submit" disabled={isSaving} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-70">
                                   {isSaving ? 'Đang Lưu...' : 'Cập Nhật'}
                               </button>
                               <button type="button" onClick={() => setEditingUser(null)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all">
                                   Hủy Bỏ
                               </button>
                            </div>
                         </form>
                      </div>
                   </div>
                )}
               </div>
            )}
            
            {/* CALENDAR TAB */}
            {activeTab === 'calendar' && currentUser && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                   <h2 className="text-2xl font-black text-slate-800">Lịch Đào Tạo</h2>
                </div>
                <CourseCalendar registrations={registrations} user={currentUser} courses={courses} />
              </div>
            )}

            {/* CATALOG TAB (RSM Registration) */}
            {activeTab === 'catalog' && currentUser && (
              <div className="space-y-6 pb-24 md:pb-0">
                 {/* ... Catalog Content ... */}
                 <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800">Đăng Ký Đào Tạo</h2>
                 </div>

                 {aiSummary && (
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-900 text-sm leading-relaxed animate-in slide-in-from-top-2">
                       <div className="flex items-center gap-2 font-bold mb-2 text-indigo-700">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          Đánh giá từ AI
                       </div>
                       {aiSummary}
                    </div>
                 )}

                 {courses.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-32">
                       {courses.filter(c => c.approvalStatus === 'approved').map(course => {
                          const isRegistered = registrations.some(r => r.courseId === course.id && r.asmId === currentUser.id);
                          const isSelected = selectedCourseIds.includes(course.id);
                          
                          return (
                             <div key={course.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col transition-all duration-300 ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500 transform scale-[1.02]' : 'border-slate-200 hover:shadow-md'}`}>
                                <div className="relative h-48">
                                   <img src={course.imageUrl} className="w-full h-full object-cover" alt={course.title} onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/400x200?text=No+Image')} />
                                   <div className="absolute top-3 right-3">
                                      <span className="px-2 py-1 bg-white/90 backdrop-blur text-indigo-700 text-[10px] font-black uppercase rounded-lg shadow-sm">
                                         {course.category}
                                      </span>
                                   </div>
                                   {isRegistered && (
                                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-[1px]">
                                         <span className="bg-green-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 transform -rotate-6">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            ĐÃ ĐĂNG KÝ
                                         </span>
                                      </div>
                                   )}
                                </div>
                                
                                <div className="p-5 flex-1 flex flex-col">
                                   <h4 className="font-bold text-slate-800 text-lg mb-2 line-clamp-2 leading-tight">{course.title}</h4>
                                   
                                   <div className="space-y-2 mb-4 flex-1">
                                      <div className="flex items-center gap-2 text-slate-500 text-xs">
                                         <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
                                         <span className="font-medium">{formatDate(course.startDate)}</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-slate-500 text-xs">
                                         <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                         <span className="font-medium line-clamp-1">{course.location}</span>
                                      </div>
                                   </div>

                                   {!isRegistered ? (
                                      <button 
                                         onClick={() => {
                                            if(isSelected) setSelectedCourseIds(selectedCourseIds.filter(id => id !== course.id));
                                            else setSelectedCourseIds([...selectedCourseIds, course.id]);
                                         }}
                                         className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                            isSelected 
                                            ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' 
                                            : 'bg-slate-100 text-slate-600 hover:bg-indigo-600 hover:text-white hover:shadow-lg hover:shadow-indigo-200'
                                         }`}
                                      >
                                         {isSelected ? (
                                            <>
                                               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                               Đã Chọn
                                            </>
                                         ) : (
                                            <>Chọn Môn Học</>
                                         )}
                                      </button>
                                   ) : (
                                      <button disabled className="w-full py-3 rounded-xl font-bold text-sm bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-100">
                                         Đã Đăng Ký
                                      </button>
                                   )}
                                </div>
                             </div>
                          );
                       })}
                    </div>
                 ) : (
                    <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                       <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                       </div>
                       <h3 className="text-lg font-bold text-slate-800">Chưa có môn học mới</h3>
                       <p className="text-slate-500 text-sm mt-2">Hiện tại chưa có môn học nào được duyệt để đăng ký.</p>
                    </div>
                 )}

                 {/* FLOATING BOTTOM BAR FOR REGISTRATION */}
                 {selectedCourseIds.length > 0 && (
                    <div className="fixed bottom-16 lg:bottom-0 left-0 lg:left-64 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-30 flex items-center justify-between animate-in slide-in-from-bottom-5">
                       <div className="text-slate-600 font-medium text-sm sm:text-base">
                          Đã chọn <span className="font-bold text-indigo-600 text-lg">{selectedCourseIds.length}</span> môn học
                       </div>
                       <div className="flex gap-3">
                          <button 
                             onClick={handleGenerateSummary}
                             disabled={isGeneratingAi || isSaving}
                             className="hidden sm:flex items-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-700 rounded-xl font-bold hover:bg-emerald-100 transition-colors text-sm"
                          >
                             {isGeneratingAi ? <span className="animate-spin">✨</span> : <span>✨</span>}
                             {isGeneratingAi ? 'Đang tóm tắt...' : 'AI Summary'}
                          </button>
                          
                          <button 
                             onClick={handleRegister} 
                             disabled={isSaving}
                             className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed transition-all text-sm flex items-center gap-2"
                          >
                             {isSaving ? (
                                <>
                                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Đang gửi...
                                </>
                             ) : (
                                <>Gửi Đăng Ký</>
                             )}
                          </button>
                       </div>
                    </div>
                 )}
              </div>
            )}

            {/* REGISTRATIONS TAB (RSM/User View) - RESTORED */}
            {activeTab === 'registrations' && currentUser && (
                <div className="space-y-6">
                    <h2 className="text-2xl font-black text-slate-800">Môn Học Đã Đăng Ký</h2>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                        {registrations.filter(r => r.asmId === currentUser.id).length > 0 ? (
                            <div className="space-y-4">
                                {registrations.filter(r => r.asmId === currentUser.id).map(reg => {
                                    const course = courses.find(c => c.id === reg.courseId);
                                    if (!course) return null;
                                    
                                    return (
                                        <div key={reg.id} className="flex flex-col sm:flex-row gap-4 p-4 border border-slate-100 rounded-xl bg-slate-50 hover:bg-white hover:border-slate-200 transition-all">
                                            <div className="relative w-full sm:w-32 h-32 sm:h-24 shrink-0">
                                                <img src={course.imageUrl} alt={course.title} className="w-full h-full object-cover rounded-lg" onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/150')} />
                                                <span className={`absolute top-2 left-2 text-[10px] font-black uppercase px-2 py-1 rounded shadow-sm ${
                                                    reg.status === 'confirmed' ? 'bg-green-500 text-white' : 'bg-amber-400 text-white'
                                                }`}>
                                                    {reg.status === 'confirmed' ? 'Đã Duyệt' : 'Chờ Duyệt'}
                                                </span>
                                            </div>
                                            
                                            <div className="flex-1">
                                                <h4 className="font-bold text-slate-800 text-lg">{course.title}</h4>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-1 mb-3">
                                                    <span className="flex items-center gap-1">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
                                                        {formatDate(course.startDate)}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                        {course.location}
                                                    </span>
                                                </div>
                                                
                                                <button 
                                                    onClick={() => handleCancelRegistration(reg.id)}
                                                    className="text-red-500 hover:text-red-700 text-xs font-bold uppercase tracking-wider flex items-center gap-1 hover:bg-red-50 px-2 py-1 -ml-2 rounded-lg transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    Hủy Đăng Ký
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                </div>
                                <p className="text-slate-500 font-medium">Bạn chưa đăng ký môn học nào.</p>
                                <button onClick={() => setActiveTab('catalog')} className="mt-4 text-indigo-600 font-bold hover:underline">
                                    Đến trang đăng ký ngay
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {/* MANAGE COURSES TAB */}
            {activeTab === 'manage-courses' && currentUser && (
              <div className="space-y-6">
                 {/* ... Manage Courses Content (Unchanged) ... */}
                 <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-black text-slate-800">Quản Lý Môn Học</h2>
                    <button onClick={() => setIsAddingCourse(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-700">
                       + Tạo Môn Mới
                    </button>
                 </div>
                 
                 <div className="grid gap-4">
                    {courses.map(course => (
                       <div key={course.id} className={`bg-white p-4 rounded-xl shadow-sm border flex flex-col md:flex-row gap-4 items-start ${course.approvalStatus === 'rejected' ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
                          {/* Image Section */}
                          <div className="w-full md:w-32 h-32 shrink-0 rounded-lg overflow-hidden bg-slate-100 relative group">
                              <img src={course.imageUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={course.title} onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/150')} />
                              <span className="absolute top-1 left-1 bg-white/90 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold uppercase text-slate-700 shadow-sm">
                                  {course.category}
                              </span>
                          </div>
                          
                          {/* Content Section */}
                          <div className="flex-1 w-full">
                             <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                <div>
                                    <h4 className="font-bold text-slate-800 text-lg leading-tight">{course.title}</h4>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                                        course.approvalStatus === 'approved' ? 'bg-green-100 text-green-700' :
                                        course.approvalStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                                        course.approvalStatus === 'trainer_approved' ? 'bg-blue-100 text-blue-700' :
                                        'bg-amber-100 text-amber-700'
                                        }`}>
                                        {course.approvalStatus === 'approved' ? 'Đã Duyệt' : 
                                         course.approvalStatus === 'rejected' ? 'BỊ TỪ CHỐI' :
                                         course.approvalStatus === 'trainer_approved' ? 'Chờ KA Duyệt' : 'Chờ GV Duyệt'}
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                            {course.format}
                                        </span>
                                    </div>
                                </div>
                             </div>

                             {/* Metadata Grid */}
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600 mb-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
                                    <span className="truncate font-medium">{formatDate(course.startDate)} {course.startDate !== course.endDate && `- ${formatDate(course.endDate)}`}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span className="truncate font-medium">{formatTime(course.startTime)} - {formatTime(course.endTime)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    <span className="truncate" title={course.targetAudience}>{course.targetAudience}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    <span className="truncate" title={course.location}>{course.location}</span>
                                </div>
                             </div>
                             
                             <p className="text-xs text-slate-500 line-clamp-2 italic mb-3">{course.description}</p>

                             {/* Buttons */}
                             <div className="flex gap-2 justify-end">
                                <button onClick={() => { setEditingCourse(course); setImagePreview(course.imageUrl); }} className="flex items-center gap-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg text-xs transition-colors">
                                   Sửa
                                </button>
                                {currentUser.role === UserRole.ADMIN && (
                                   <button onClick={() => handleDeleteCourse(course.id)} className="flex items-center gap-1 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg text-xs transition-colors">
                                      Xóa
                                   </button>
                                )}
                             </div>
                          </div>
                       </div>
                    ))}
                 </div>

                 {/* ADD/EDIT COURSE MODALS WOULD GO HERE OR ARE THEY HANDLED? */}
                 {/* Checking state: isAddingCourse, editingCourse */}
                 
                 {isAddingCourse && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                       <div className="bg-white rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                          <h3 className="text-xl font-black mb-4">Tạo Môn Học Mới</h3>
                          <form onSubmit={handleAddCourse} className="space-y-4">
                             {/* Form fields based on newCourse state */}
                             <div className="flex flex-col items-center mb-4">
                                <div className="w-full h-40 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center relative overflow-hidden group cursor-pointer">
                                   <input type="file" onChange={(e) => handleImageUpload(e, 'course')} className="absolute inset-0 opacity-0 cursor-pointer z-10" accept="image/*" />
                                   {imagePreview ? (
                                      <img src={imagePreview} className="w-full h-full object-cover" />
                                   ) : (
                                      <div className="text-center text-slate-400">
                                         <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                         <span className="text-xs font-bold">Tải ảnh bìa</span>
                                      </div>
                                   )}
                                </div>
                             </div>
                             
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tên môn học</label>
                                   <input required type="text" value={newCourse.title} onChange={e => setNewCourse({...newCourse, title: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Kỹ năng..." />
                                </div>
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Danh mục</label>
                                   <input type="text" value={newCourse.category} onChange={e => setNewCourse({...newCourse, category: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Sales, Soft Skills..." />
                                </div>
                             </div>

                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Ngày bắt đầu</label>
                                   <input required type="date" value={newCourse.startDate} onChange={e => setNewCourse({...newCourse, startDate: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Ngày kết thúc</label>
                                   <input required type="date" value={newCourse.endDate} onChange={e => setNewCourse({...newCourse, endDate: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                             </div>

                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Giờ bắt đầu</label>
                                   <input required type="time" value={newCourse.startTime} onChange={e => setNewCourse({...newCourse, startTime: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Giờ kết thúc</label>
                                   <input required type="time" value={newCourse.endTime} onChange={e => setNewCourse({...newCourse, endTime: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                             </div>

                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Hình thức</label>
                                   <select value={newCourse.format} onChange={e => setNewCourse({...newCourse, format: e.target.value as any})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                                      <option value="Online">Online</option>
                                      <option value="Offline">Offline</option>
                                      <option value="Livestream">Livestream</option>
                                   </select>
                                </div>
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Đối tượng</label>
                                   <input type="text" value={newCourse.targetAudience} onChange={e => setNewCourse({...newCourse, targetAudience: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="ASM, RSM..." />
                                </div>
                             </div>
                             
                             <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Địa điểm / Link</label>
                                <input required type="text" value={newCourse.location} onChange={e => setNewCourse({...newCourse, location: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder={getLocationPlaceholder(newCourse.format || 'Online')} />
                             </div>

                             <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Mô tả chi tiết</label>
                                <textarea required value={newCourse.description} onChange={e => setNewCourse({...newCourse, description: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 h-24" placeholder="Nội dung khóa học..." />
                             </div>

                             <div className="flex gap-4 pt-4 border-t border-slate-100 mt-4">
                                <button type="submit" disabled={isSaving} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-70">
                                    {isSaving ? 'Đang Lưu...' : 'Tạo Môn Học'}
                                </button>
                                <button type="button" onClick={() => setIsAddingCourse(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all">
                                    Hủy Bỏ
                                </button>
                             </div>
                          </form>
                       </div>
                    </div>
                 )}

                 {editingCourse && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                       <div className="bg-white rounded-3xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                          <h3 className="text-xl font-black mb-4">Chỉnh Sửa Môn Học</h3>
                          <form onSubmit={handleUpdateCourse} className="space-y-4">
                             {/* Similar fields as Add but using editingCourse state */}
                             <div className="flex flex-col items-center mb-4">
                                <div className="w-full h-40 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center relative overflow-hidden group cursor-pointer">
                                   <input type="file" onChange={(e) => handleImageUpload(e, 'course_edit')} className="absolute inset-0 opacity-0 cursor-pointer z-10" accept="image/*" />
                                   {imagePreview ? (
                                      <img src={imagePreview} className="w-full h-full object-cover" />
                                   ) : (
                                      <div className="text-center text-slate-400">
                                         <span className="text-xs font-bold">Thay đổi ảnh</span>
                                      </div>
                                   )}
                                </div>
                             </div>
                             
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tên môn học</label>
                                   <input required type="text" value={editingCourse.title} onChange={e => setEditingCourse({...editingCourse, title: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Danh mục</label>
                                   <input type="text" value={editingCourse.category} onChange={e => setEditingCourse({...editingCourse, category: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                             </div>
                             
                             {/* Add other fields similarly (Date, Time, Format, Audience, Location, Description) */}
                             {/* Trying to save space, assuming logic is similar to add form but with editingCourse */}
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Ngày bắt đầu</label>
                                   <input required type="date" value={editingCourse.startDate} onChange={e => setEditingCourse({...editingCourse, startDate: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Ngày kết thúc</label>
                                   <input required type="date" value={editingCourse.endDate} onChange={e => setEditingCourse({...editingCourse, endDate: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                             </div>
                             
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Giờ bắt đầu</label>
                                   <input required type="time" value={editingCourse.startTime} onChange={e => setEditingCourse({...editingCourse, startTime: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Giờ kết thúc</label>
                                   <input required type="time" value={editingCourse.endTime} onChange={e => setEditingCourse({...editingCourse, endTime: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                             </div>

                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Hình thức</label>
                                   <select value={editingCourse.format} onChange={e => setEditingCourse({...editingCourse, format: e.target.value as any})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                                      <option value="Online">Online</option>
                                      <option value="Offline">Offline</option>
                                      <option value="Livestream">Livestream</option>
                                   </select>
                                </div>
                                <div>
                                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Đối tượng</label>
                                   <input type="text" value={editingCourse.targetAudience} onChange={e => setEditingCourse({...editingCourse, targetAudience: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                             </div>
                             
                             <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Địa điểm / Link</label>
                                <input required type="text" value={editingCourse.location} onChange={e => setEditingCourse({...editingCourse, location: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder={getLocationPlaceholder(editingCourse.format || 'Online')} />
                             </div>

                             <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Mô tả chi tiết</label>
                                <textarea required value={editingCourse.description} onChange={e => setEditingCourse({...editingCourse, description: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 h-24" />
                             </div>

                             <div className="flex gap-4 pt-4 border-t border-slate-100 mt-4">
                                <button type="submit" disabled={isSaving} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-70">
                                    {isSaving ? 'Đang Lưu...' : 'Cập Nhật'}
                                </button>
                                <button type="button" onClick={() => setEditingCourse(null)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all">
                                    Hủy Bỏ
                                </button>
                             </div>
                          </form>
                       </div>
                    </div>
                 )}
              </div>
            )}

            {/* COURSE APPROVALS TAB (KA/ADMIN) */}
            {activeTab === 'course-approvals' && (currentUser.role === UserRole.KA || currentUser.role === UserRole.ADMIN) && (
               <div className="space-y-8">
                  {/* 1. Pending Courses */}
                  <div className="space-y-4">
                     <h2 className="text-xl font-black text-slate-800">Duyệt Môn Học Mới</h2>
                     {courses.filter(c => c.approvalStatus === 'trainer_approved' || c.approvalStatus === 'pending_trainer').length === 0 ? (
                        <p className="text-slate-500 text-sm">Không có môn học nào chờ duyệt.</p>
                     ) : (
                        <div className="grid gap-4">
                           {courses.filter(c => c.approvalStatus === 'trainer_approved' || c.approvalStatus === 'pending_trainer').map(course => (
                              <div key={course.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
                                 <div className="w-24 h-24 shrink-0 rounded bg-slate-100 overflow-hidden">
                                     <img src={course.imageUrl} className="w-full h-full object-cover" />
                                 </div>
                                 <div className="flex-1">
                                     <h4 className="font-bold text-slate-800">{course.title}</h4>
                                     <p className="text-xs text-slate-500 mt-1">{course.description}</p>
                                     <div className="flex gap-2 mt-2 text-xs font-medium text-slate-600">
                                        <span>{course.format}</span>
                                        <span>•</span>
                                        <span>{formatDate(course.startDate)}</span>
                                        <span>•</span>
                                        <span className="text-indigo-600">{course.creatorRole === UserRole.TRAINER ? 'Giảng viên đề xuất' : 'RSM/PM đề xuất'}</span>
                                     </div>
                                 </div>
                                 <div className="flex flex-col gap-2 justify-center">
                                     <button onClick={() => handleCourseApproval(course, 'approved')} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">Duyệt Đăng</button>
                                     <button onClick={() => handleCourseApproval(course, 'rejected')} className="px-4 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100">Từ Chối</button>
                                 </div>
                              </div>
                           ))}
                        </div>
                     )}
                  </div>

                  {/* 2. Pending Registrations */}
                  <div className="space-y-4 pt-6 border-t border-slate-200">
                     <h2 className="text-xl font-black text-slate-800">Duyệt Đăng Ký Tham Gia</h2>
                     {registrations.filter(r => r.status === 'pending').length === 0 ? (
                        <p className="text-slate-500 text-sm">Không có yêu cầu đăng ký nào chờ xử lý.</p>
                     ) : (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                           <table className="w-full text-left">
                              <thead className="bg-slate-50 border-b border-slate-200">
                                 <tr>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400">Người đăng ký</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400">Môn học</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400">Khu vực</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400">Hành động</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                 {registrations.filter(r => r.status === 'pending').map(reg => {
                                    const course = courses.find(c => c.id === reg.courseId);
                                    const userReg = users.find(u => u.id === reg.asmId);
                                    if (!course) return null;
                                    return (
                                       <tr key={reg.id}>
                                          <td className="px-4 py-3">
                                             <p className="text-sm font-bold text-slate-800">{userReg?.name || 'Unknown'}</p>
                                             <p className="text-xs text-slate-400">{userReg?.username}</p>
                                          </td>
                                          <td className="px-4 py-3">
                                             <p className="text-sm text-slate-700">{course.title}</p>
                                          </td>
                                          <td className="px-4 py-3">
                                             <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">{reg.region}</span>
                                          </td>
                                          <td className="px-4 py-3">
                                             <div className="flex gap-2">
                                                <button onClick={() => handleRegistrationAction(reg, 'confirm')} className="text-green-600 hover:text-green-800 text-xs font-bold">Duyệt</button>
                                                <button onClick={() => handleRegistrationAction(reg, 'reject')} className="text-red-600 hover:text-red-800 text-xs font-bold">Từ chối</button>
                                             </div>
                                          </td>
                                       </tr>
                                    );
                                 })}
                              </tbody>
                           </table>
                        </div>
                     )}
                  </div>
               </div>
            )}

            {/* TOOLS TAB (AI Tools) */}
            {activeTab === 'tools' && currentUser && (
               <div className="space-y-6">
                  <h2 className="text-2xl font-black text-slate-800">Công Cụ & Tiện Ích</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {/* Background Remover Tool Card */}
                     <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                        <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
                           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Xóa Phông Ảnh (AI)</h3>
                        <p className="text-slate-500 text-sm mb-4">Sử dụng AI để tách nền ảnh chân dung hoặc sản phẩm, phục vụ thiết kế banner, slide.</p>
                        <button onClick={() => setActiveTool('bg-remover')} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700">Sử Dụng Ngay</button>
                     </div>
                  </div>
                  
                  {/* Tool Interface Modal/Area */}
                  {activeTool === 'bg-remover' && (
                     <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
                           <div className="flex justify-between items-center mb-6">
                              <h3 className="text-xl font-black">Xóa Phông Ảnh</h3>
                              <button onClick={() => { setActiveTool(null); setBgRemoverImg(null); setBgRemoverResult(null); }} className="p-2 hover:bg-slate-100 rounded-full">
                                 <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                              </button>
                           </div>
                           
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div>
                                 <p className="text-sm font-bold text-slate-500 mb-2">Ảnh Gốc</p>
                                 <div className="w-full aspect-square bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center relative overflow-hidden group">
                                    <input type="file" onChange={(e) => handleImageUpload(e, 'bg_remover')} className="absolute inset-0 opacity-0 cursor-pointer z-10" accept="image/*" />
                                    {bgRemoverImg ? (
                                       <img src={bgRemoverImg} className="w-full h-full object-contain" />
                                    ) : (
                                       <div className="text-center text-slate-400">
                                          <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                          <span className="text-sm font-bold">Chọn ảnh để xử lý</span>
                                       </div>
                                    )}
                                 </div>
                              </div>
                              
                              <div>
                                 <p className="text-sm font-bold text-slate-500 mb-2">Kết Quả AI</p>
                                 <div className="w-full aspect-square bg-[url('https://media.istockphoto.com/id/1145618475/vector/checkered-geometric-vector-background-with-black-and-gray-tile-transparent-grid-empty.jpg?s=612x612&w=0&k=20&c=6F5k2yKx-rT_hA6GqVz5_g_g_g_g_g_g_g_g_g_g_g_g_g_g_g_g_g')] bg-cover rounded-xl border border-slate-200 flex items-center justify-center relative overflow-hidden">
                                    {isProcessingBg ? (
                                       <div className="text-center">
                                          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"></div>
                                          <span className="text-xs font-bold text-slate-600">Đang xử lý...</span>
                                       </div>
                                    ) : bgRemoverResult ? (
                                       <img src={bgRemoverResult} className="w-full h-full object-contain" />
                                    ) : (
                                       <span className="text-slate-400 text-sm">Chưa có kết quả</span>
                                    )}
                                 </div>
                              </div>
                           </div>
                           
                           <div className="mt-6 flex justify-end gap-3">
                              <button onClick={handleProcessBgRemoval} disabled={!bgRemoverImg || isProcessingBg} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                 Xử Lý Ảnh
                              </button>
                              {bgRemoverResult && (
                                 <a href={bgRemoverResult} download="removed-bg.png" className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Tải Về
                                 </a>
                              )}
                           </div>
                        </div>
                     </div>
                  )}
               </div>
            )}
            
            {/* SETTINGS TAB */}
            {activeTab === 'settings' && currentUser && (
               <div className="space-y-6">
                  <h2 className="text-2xl font-black text-slate-800">Cài Đặt Hệ Thống</h2>
                  {currentUser.role === UserRole.ADMIN ? (
                     <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 text-lg mb-4">Cấu Hình Popup Thông Báo</h3>
                        <div className="space-y-4">
                           <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-slate-700">Kích hoạt Popup trang chủ</span>
                              <label className="relative inline-flex items-center cursor-pointer">
                                 <input type="checkbox" checked={popupConfigForm.isActive} onChange={e => setPopupConfigForm({...popupConfigForm, isActive: e.target.checked})} className="sr-only peer" />
                                 <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                              </label>
                           </div>
                           
                           <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Hình ảnh Popup</label>
                              <div className="w-full h-48 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center relative overflow-hidden group cursor-pointer">
                                   <input type="file" onChange={(e) => handleImageUpload(e, 'popup')} className="absolute inset-0 opacity-0 cursor-pointer z-10" accept="image/*" />
                                   {popupConfigForm.imageUrl ? (
                                      <img src={popupConfigForm.imageUrl} className="w-full h-full object-contain" />
                                   ) : (
                                      <div className="text-center text-slate-400">
                                         <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                         <span className="text-xs font-bold">Tải ảnh lên</span>
                                      </div>
                                   )}
                              </div>
                           </div>
                           
                           <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Đường dẫn khi click (tùy chọn)</label>
                              <input type="text" value={popupConfigForm.linkUrl} onChange={e => setPopupConfigForm({...popupConfigForm, linkUrl: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" placeholder="https://..." />
                           </div>
                           
                           <div className="pt-4">
                              <button onClick={handleSavePopupConfig} disabled={isSaving} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-70">
                                 Lưu Cấu Hình
                              </button>
                           </div>
                        </div>
                     </div>
                  ) : (
                     <div className="p-10 text-center bg-white rounded-2xl border border-slate-200">
                        <p className="text-slate-500">Bạn không có quyền truy cập cài đặt hệ thống.</p>
                     </div>
                  )}
               </div>
            )}
            
            {/* PROFILE TAB */}
            {activeTab === 'profile' && currentUser && (
               <div className="space-y-6">
                  <h2 className="text-2xl font-black text-slate-800">Thông Tin Cá Nhân</h2>
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                     <div className="h-32 bg-indigo-600"></div>
                     <div className="px-6 pb-6 relative">
                        <div className="absolute -top-12 left-6 w-24 h-24 rounded-full border-4 border-white bg-white shadow-md overflow-hidden group cursor-pointer">
                           <input type="file" onChange={(e) => handleImageUpload(e, 'user')} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                           {currentUser.avatarUrl ? (
                              <img src={currentUser.avatarUrl} className="w-full h-full object-cover" />
                           ) : (
                              <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-400 font-bold text-2xl">
                                 {currentUser.name.charAt(0)}
                              </div>
                           )}
                           <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                           </div>
                        </div>
                        
                        <div className="ml-28 pt-2 mb-8">
                           <h3 className="text-xl font-bold text-slate-900">{currentUser.name}</h3>
                           <p className="text-slate-500 text-sm">@{currentUser.username} • <span className="uppercase text-indigo-600 font-bold text-xs">{currentUser.role}</span></p>
                        </div>
                        
                        <form onSubmit={handleSaveProfile} className="space-y-4 max-w-2xl">
                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Họ và tên</label>
                                 <input type="text" value={profileData.name || ''} onChange={e => setProfileData({...profileData, name: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>
                              <div>
                                 <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Số điện thoại</label>
                                 <input type="text" value={profileData.phone || ''} onChange={e => setProfileData({...profileData, phone: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="09..." />
                              </div>
                           </div>
                           
                           <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Email</label>
                              <input type="email" value={profileData.email || ''} onChange={e => setProfileData({...profileData, email: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="email@example.com" />
                           </div>
                           
                           <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Giới thiệu bản thân</label>
                              <textarea value={profileData.bio || ''} onChange={e => setProfileData({...profileData, bio: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 h-24" placeholder="Một chút về bạn..." />
                           </div>
                           
                           <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Đổi mật khẩu (Bỏ trống nếu không đổi)</label>
                              <input type="password" value={profileData.password || ''} onChange={e => setProfileData({...profileData, password: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="••••••••" />
                           </div>
                           
                           <div className="pt-4">
                              <button type="submit" disabled={isSaving} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-70">
                                 Lưu Thay Đổi
                              </button>
                           </div>
                        </form>
                     </div>
                  </div>
               </div>
            )}

          </div>
        </section>
      </main>
    </div>
  );
};

export default App;