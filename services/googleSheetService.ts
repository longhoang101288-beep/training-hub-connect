
import { User, Course, Registration } from "../types";
import { MOCK_REGISTRATIONS } from "../constants";

// =============================================================================================
// QUAN TRỌNG: BẠN CẦN CẬP NHẬT URL NÀY SAU KHI DEPLOY GOOGLE APPS SCRIPT
// 1. Vào Google Apps Script -> Deploy -> New Deployment
// 2. Select type: Web App
// 3. Execute as: Me
// 4. Who has access: Anyone (Bất kỳ ai) -> CỰC KỲ QUAN TRỌNG để tránh lỗi Failed to fetch
// 5. Deploy -> Copy "Web App URL" và dán vào biến API_URL dưới đây thay cho link mẫu
// =============================================================================================
const API_URL = "https://script.google.com/macros/s/AKfycbztENA5mooO8zHeRbgYoqkE95gW5-yE-7bSnzarbqPuirBb3pUr--lgPIutSU2c8VBkkw/exec"; 

export const fetchAllData = async () => {
  try {
    // GET Request: Không gửi Header Content-Type để tránh CORS Preflight (OPTIONS request) từ trình duyệt
    // Google Apps Script xử lý Simple GET tốt hơn khi không có custom headers
    const response = await fetch(`${API_URL}?action=read&t=${new Date().getTime()}`, {
      method: "GET",
      credentials: "omit", 
      redirect: "follow",
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    
    // Kiểm tra xem có phải HTML (Lỗi trả về trang login Google do chưa set quyền Anyone) không
    if (text.trim().startsWith("<!DOCTYPE html>") || text.includes("Google Accounts")) {
       throw new Error("Lỗi quyền truy cập: Hãy đảm bảo Script được Deploy với quyền 'Anyone' (Bất kỳ ai).");
    }

    try {
      const data = JSON.parse(text);
      if (data.status === 'error') {
        throw new Error(data.message);
      }
      
      // Parse nested JSON strings (như preferences)
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

export const saveToSheet = async (
  sheetName: "Users" | "Courses" | "Registrations" | "Settings" | "Attendance" | "Webex", 
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

    // POST Request: Sử dụng mode 'no-cors' để browser cho phép gửi data đi domain khác mà không chặn
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
    // Sử dụng MOCK_REGISTRATIONS từ constants để đảm bảo dữ liệu phong phú
    const mockRegistrations = MOCK_REGISTRATIONS;

    const sanitizedUsers = users.map(u => {
        const su: any = { ...u };
        if (su.preferences) su.preferences = JSON.stringify(su.preferences);
        return su;
    });

    // Gửi payload seed
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
