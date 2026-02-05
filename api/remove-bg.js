import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const apiKey = process.env.GOOGLE_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);

    const base64Image = buffer.toString("base64");

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
    });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "image/png",
          data: base64Image,
        },
      },
      "Remove background",
    ]);

    const output = result.response.candidates[0].content.parts[0].inlineData;

    const outputBuffer = Buffer.from(output.data, "base64");

    res.setHeader("Content-Type", "image/png");
    return res.send(outputBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI call failed", details: err.message });
  }
}
