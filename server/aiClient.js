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
        // Thinking tokens share this budget with the visible answer, so keep it generous.
        maxOutputTokens: 8192,
        // Resume feedback doesn't need deep reasoning. If the API rejects this field
        // with a 400 error, replace it with: thinkingConfig: { thinkingBudget: 0 }
        thinkingConfig: { thinkingLevel: 'minimal' },
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

// Strips markdown fences and anything outside the outermost { ... } before parsing.
function safeParse(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No JSON found in AI response');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
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

  // Retry on transient failures: 503 "overloaded", 429 rate limits, and
  // malformed/truncated JSON from the model (asking again usually fixes it).
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await callGemini(apiKey, userContent);
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.map((p) => p.text || '').join('');

      // Check these logs in Render if errors ever come back.
      // finishReason "MAX_TOKENS" means the reply was cut off.
      console.log(
        `Gemini finishReason: ${candidate?.finishReason} | usage: ${JSON.stringify(data.usageMetadata)}`
      );

      if (!text) {
        const emptyErr = new Error(
          `No text response from Gemini API (finishReason: ${candidate?.finishReason})`
        );
        emptyErr.retryable = true;
        throw emptyErr;
      }

      try {
        return safeParse(text);
      } catch (parseErr) {
        const badJsonErr = new Error(
          `AI returned malformed JSON (finishReason: ${candidate?.finishReason}): ${parseErr.message}`
        );
        badJsonErr.retryable = true;
        throw badJsonErr;
      }
    } catch (err) {
      lastError = err;

      const isRetryable = err.retryable || err.status === 503 || err.status === 429;
      const isLastAttempt = attempt === MAX_RETRIES;

      if (!isRetryable || isLastAttempt) {
        throw err;
      }

      const backoffMs = attempt * 1500; // 1.5s, 3s, 4.5s
      console.log(`Attempt ${attempt}/${MAX_RETRIES} failed (${err.message}). Retrying in ${backoffMs}ms...`);
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

module.exports = { getAIFeedback };
