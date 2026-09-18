const SYSTEM_PROMPT = `You are a resume/CV reviewer used inside an automated tool.
You must respond with ONLY a single valid JSON object — no markdown fences, no preamble, no explanation text outside the JSON.

The JSON must match this exact shape:
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
- overall_score should reflect ATS-readiness AND how compelling the resume is to a human reader.
- Never include commentary outside the JSON object.`;

async function getAIFeedback(resumeText, jobDescription) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to your .env file.');
  }

  const userContent = jobDescription
    ? `TARGET JOB DESCRIPTION:\n${jobDescription}\n\nRESUME TEXT:\n${resumeText}`
    : `RESUME TEXT (no target job description provided — give general feedback):\n${resumeText}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((c) => c.type === 'text');
  if (!textBlock) {
    throw new Error('No text response from Claude API');
  }

  const cleaned = textBlock.text.trim().replace(/^```json\s*|```$/g, '');

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Failed to parse AI response as JSON: ' + e.message);
  }
}

module.exports = { getAIFeedback };
