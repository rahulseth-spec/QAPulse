import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const geminiService = {
  async summarizeBottlenecks(bottlenecks: string[], goals: string[]): Promise<string> {
    try {
      const prompt = `Based on these goals: [${goals.join(', ')}] and these bottlenecks: [${bottlenecks.join(', ')}], provide a concise executive summary (max 2 sentences) for a QA Weekly Report.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      return response.text || "No summary generated.";
    } catch (err) {
      console.error("Gemini Error:", err);
      return "Failed to generate AI summary.";
    }
  },

  async suggestLoadStatus(planned: number, committed: number): Promise<string> {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Given planned hours of ${planned} and committed hours of ${committed}, classify the team load status as one of: Normal, Overloaded, Underutilized. Reply with only the word.`,
      });
      return response.text?.trim().toUpperCase() || "NORMAL";
    } catch (err) {
      console.error("Gemini suggestLoadStatus Error:", err);
      return "NORMAL";
    }
  },

  async generateSuccessMetric(goal: string): Promise<string> {
    try {
      if (!goal.trim()) return "";
      const prompt = `Task: Suggest a single, concise, measurable success metric for this QA goal: "${goal}". 
      Requirements: Short, professional, and directly related. 
      Example: If goal is "Improve automation coverage", metric might be "85% coverage reached".
      Return only the metric string.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      return response.text?.trim() || "";
    } catch (err) {
      console.error("Gemini generateSuccessMetric Error:", err);
      return "";
    }
  }
};
