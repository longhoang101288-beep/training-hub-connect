
import { User, Course, Registration } from "../types";

// URL API của bạn
const API_URL = "https://script.google.com/macros/s/AKfycbyJaFKR_eixxyLpFciqcgEc7qI6MJNA3hBqZdRbgQS0DsElntV87LfGZJY1ZuFb07dncg/exec"; 

export const fetchAllData = async () => {
  try {
    const response = await fetch(`${API_URL}?action=read&t=${new Date().getTime()}`, {
      method: "GET",
      mode: "cors", 
      credentials: "omit",
      redirect: "follow",
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      if (data.status === 'error') {
        throw new Error(data.message);
      }
      
      // Parse nested JSON strings back to objects if needed (for preferences)
      if (data.users) {
        data.users = data.users.map((u: any) => ({
          ...u,
          preferences: (typeof u.preferences === 'string' && u.preferences.startsWith('{')) 
            ? JSON.parse(u.preferences) 
            : u.preferences
        }));
      }

      return data;
    } catch (e) {
      console.warn("Response is not JSON:", text.substring(0, 100));
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi tải dữ liệu từ Google Sheets:", error);
    return null;
  }
};

export const saveToSheet = async (sheetName: "Users" | "Courses" | "Registrations" | "Settings", payload: any, action: "add" | "update" | "delete" = "add") => {
  try {
    // Sanitize payload: Stringify nested objects (like preferences) before sending
    const sanitizedPayload = { ...payload };
    Object.keys(sanitizedPayload).forEach(key => {
      const val = sanitizedPayload[key];
      if (typeof val === 'object' && val !== null) {
        sanitizedPayload[key] = JSON.stringify(val);
      }
    });

    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors", 
      credentials: "omit",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        sheetName,
        action,
        payload: sanitizedPayload
      })
    });
    return true;
  } catch (error) {
    console.error("Lỗi khi lưu vào Google Sheets:", error);
    return false;
  }
};

export const seedDatabase = async (users: User[], courses: Course[]) => {
  try {
    // Prepare mock data
    const mockRegistrations = [
      {
        id: 'reg_seed_1',
        courseId: courses[0]?.id || 'c1',
        asmId: users.find(u => u.role === 'ASM')?.id || 'u2',
        region: users.find(u => u.role === 'ASM')?.region || 'Hà Nội',
        date: courses[0]?.startDate || '2024-06-15',
        status: 'pending'
      }
    ];

    // Sanitize Users for Seed
    const sanitizedUsers = users.map(u => {
        const su: any = { ...u };
        if (su.preferences) su.preferences = JSON.stringify(su.preferences);
        return su;
    });

    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      credentials: "omit",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "seed",
        payload: {
          users: sanitizedUsers,
          courses,
          registrations: mockRegistrations
        }
      })
    });
    return true;
  } catch (error) {
    console.error("Lỗi khi khởi tạo dữ liệu:", error);
    return false;
  }
};
