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
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MAX_RETRIES = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(apiKey, userContent) {
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
    const error = new Error(`Gemini API error (${response.status}): ${errText}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function getAIFeedback(resumeText, jobDescription) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Add it to your .env file (or Render environment variables).');
  }

  const userContent = jobDescription
    ? `TARGET JOB DESCRIPTION:\n${jobDescription}\n\nRESUME TEXT:\n${resumeText}`
    : `RESUME TEXT (no target job description provided — give general feedback):\n${resumeText}`;

  let lastError;

  // Free-tier Gemini models occasionally return 503 "overloaded" under demand spikes.
  // These are transient, so retry a few times with backoff before giving up.
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await callGemini(apiKey, userContent);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('No text response from Gemini API');
      }

      return JSON.parse(text);
    } catch (err) {
      lastError = err;

      const isRetryable = err.status === 503 || err.status === 429;
      const isLastAttempt = attempt === MAX_RETRIES;

      if (!isRetryable || isLastAttempt) {
        throw err;
      }

      const backoffMs = attempt * 1500; // 1.5s, 3s, 4.5s
      console.log(`Gemini returned ${err.status}, retrying in ${backoffMs}ms (attempt ${attempt}/${MAX_RETRIES})...`);
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

module.exports = { getAIFeedback };
