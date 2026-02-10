
import { User, Course, Registration } from "../types";
import { MOCK_REGISTRATIONS, DEFAULT_ROLE_PERMISSIONS } from "../constants";

// =============================================================================================
// QUAN TRỌNG: BẠN CẦN CẬP NHẬT URL NÀY SAU KHI DEPLOY GOOGLE APPS SCRIPT
// =============================================================================================
const API_URL = "https://script.google.com/macros/s/AKfycbwQNRUvTgNa6fVOFjN5ucBN3uYazyFGDRwBgwtSRejgaDX8qmJl36vj-gDtp5FBx7w6Mg/exec"; 

export const fetchAllData = async () => {
  try {
    const response = await fetch(`${API_URL}?action=read&t=${new Date().getTime()}`, {
      method: "GET",
      credentials: "omit", 
      redirect: "follow",
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    
    if (text.trim().startsWith("<!DOCTYPE html>") || text.includes("Google Accounts")) {
       throw new Error("Lỗi quyền truy cập: Hãy đảm bảo Script được Deploy với quyền 'Anyone' (Bất kỳ ai).");
    }

    try {
      const data = JSON.parse(text);
      if (data.status === 'error') {
        throw new Error(data.message);
      }
      
      // Parse nested JSON strings (users preferences)
      if (data.users) {
        data.users = data.users.map((u: any) => ({
          ...u,
          preferences: (typeof u.preferences === 'string' && u.preferences.startsWith('{')) 
            ? JSON.parse(u.preferences) 
            : u.preferences
        }));
      }

      // Parse nested JSON strings (role permissions)
      if (data.rolepermissions) {
         data.rolePermissions = data.rolepermissions.map((rp: any) => ({
            ...rp,
            features: (typeof rp.features === 'string' && rp.features.startsWith('['))
               ? JSON.parse(rp.features)
               : []
         }));
      }
      
      // Parse nested JSON strings (work schedules)
      if (data.workschedules) {
          data.workSchedules = data.workschedules.map((ws: any) => ({
              ...ws,
              days: (typeof ws.days === 'string' && ws.days.startsWith('{')) ? JSON.parse(ws.days) : ws.days
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

export const saveToSheet = async (
  sheetName: "Users" | "Courses" | "Registrations" | "Settings" | "Attendance" | "Webex" | "RolePermissions" | "WorkSchedules", 
  payload: any, 
  action: "add" | "update" | "delete" = "add"
) => {
  try {
    // Sanitize payload
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
    console.error(`Lỗi khi lưu vào Sheet ${sheetName}:`, error);
    return false;
  }
};

export const seedDatabase = async (users: User[], courses: Course[]) => {
  try {
    const mockRegistrations = MOCK_REGISTRATIONS;
    
    const sanitizedUsers = users.map(u => {
        const su: any = { ...u };
        if (su.preferences) su.preferences = JSON.stringify(su.preferences);
        return su;
    });

    // Sanitize Role Permissions
    const sanitizedPermissions = DEFAULT_ROLE_PERMISSIONS.map(rp => ({
        role: rp.role,
        features: JSON.stringify(rp.features)
    }));

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
          registrations: mockRegistrations,
          rolePermissions: sanitizedPermissions
        }
      })
    });
    return true;
  } catch (error) {
    console.error("Lỗi khi khởi tạo dữ liệu:", error);
    return false;
  }
};
