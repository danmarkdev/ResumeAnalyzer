const SYSTEM_PROMPT = `You are a resume/CV reviewer used inside an automated tool.
Respond with a single JSON object matching this exact shape:
{
  "overall_score": <integer 0-100>,
  "summary": "<2-3 sentence overall impression>",
  "strengths": ["<short strength>", ...],
  "missing_keywords": ["<keyword>", ...],
  "formatting_issues": ["<issue>", ...],
  "section_feedback": {
    "summary_or_objective": "<feedback or 'Not present' if missing>",
    "experience": "<feedback>",
    "skills": "<feedback>",
    "education": "<feedback>"
  },
  "top_recommendations": ["<actionable recommendation>", ...]
}

Guidelines:
- Be specific and reference actual content from the resume where possible, not generic advice.
- If a job description is provided, tailor missing_keywords and recommendations to it directly.
- Keep each array to 3-6 items.
- overall_score should reflect ATS-readiness AND how compelling the resume is to a human reader.`;

// Google AI Studio's free tier for this model: no credit card required.
// See https://ai.google.dev/gemini-api/docs/rate-limits for current limits.
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function getAIFeedback(resumeText, jobDescription) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to your .env file (or Render environment variables).');
  }

  const userContent = jobDescription
    ? `TARGET JOB DESCRIPTION:\n${jobDescription}\n\nRESUME TEXT:\n${resumeText}`
    : `RESUME TEXT (no target job description provided — give general feedback):\n${resumeText}`;

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userContent }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 1500,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No text response from Gemini API');
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Failed to parse AI response as JSON: ' + e.message);
  }
}

module.exports = { getAIFeedback };
