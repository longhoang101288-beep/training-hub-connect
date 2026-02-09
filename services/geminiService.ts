
import { GoogleGenAI, Type } from "@google/genai";
import { Course } from "../types";

/**
 * Initialization following guidelines.
 * Updated to support Vercel Environment Variables (VITE_API_KEY).
 */
export const getGeminiAI = () => {
  // Ưu tiên lấy từ VITE_API_KEY (Chuẩn cho React/Vite trên Vercel)
  // Fallback sang process.env.API_KEY cho môi trường local cũ
  // @ts-ignore
  const apiKey = import.meta.env?.VITE_API_KEY || process.env.API_KEY;

  if (!apiKey) {
    console.warn("⚠️ API Key chưa được cấu hình. Hãy thêm biến môi trường VITE_API_KEY trên Vercel.");
  }

  return new GoogleGenAI({ apiKey: apiKey || "" });
};

export const generateTrainingPlanSummary = async (selectedCourses: Course[], region: string) => {
  const ai = getGeminiAI();
  const courseList = selectedCourses.map(c => `- ${c.title}: ${c.description}`).join('\n');
  
  const prompt = `
    Analyze the following training courses selected for the region: "${region}".
    Courses:
    ${courseList}
    
    Provide a professional summary (in Vietnamese) of why this training plan is beneficial for the region's performance. 
    Keep it concise (3-4 sentences).
  `;

  try {
    /* Using recommended model 'gemini-3-flash-preview' for basic text tasks */
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    /* Text content is accessed via the .text property as per guidelines */
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Không thể tạo bản tóm tắt AI lúc này. Vui lòng kiểm tra API Key.";
  }
};

export const suggestTrainingSchedule = async (course: Course) => {
  const ai = getGeminiAI();
  const prompt = `Suggest a detailed 1-day training schedule for the course "${course.title}". 
  Format as a JSON object with a list of activities and times.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            schedule: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  time: { type: Type.STRING },
                  activity: { type: Type.STRING }
                },
                required: ["time", "activity"]
              }
            }
          },
          required: ["schedule"]
        }
      }
    });
    /* Text content extraction via property, then parsing the JSON string */
    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini Error:", error);
    return null;
  }
};
