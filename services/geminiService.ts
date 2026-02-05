
import { GoogleGenAI, Type } from "@google/genai";
import { Course } from "../types";

/**
 * Initialization following guidelines: must use named parameter and direct process.env.API_KEY.
 * The instance is created per call to ensure it uses the latest configuration as per best practices.
 */
export const getGeminiAI = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
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
    return "Không thể tạo bản tóm tắt AI lúc này.";
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
