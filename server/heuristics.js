// Simple rule-based checks that mimic what a real ATS parser looks for.
// Kept separate from the AI call so the score isn't purely "the model's opinion" -
// part of it is deterministic and explainable.

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/;
const SECTION_HEADERS = ['experience', 'education', 'skills', 'summary', 'objective', 'projects', 'certifications'];

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'was', 'were',
  'are', 'you', 'your', 'our', 'a', 'an', 'in', 'on', 'of', 'to', 'is', 'as', 'at',
  'or', 'be', 'will', 'we', 'it', 'by', 'their', 'they', 'i',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+.# ]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.]+|[.]+$/g, '')) // strip stray leading/trailing periods, keep node.js/c#/asp.net intact
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function extractKeywords(jobDescription, limit = 25) {
  const tokens = tokenize(jobDescription);
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function runHeuristics(resumeText, jobDescription) {
  const lowerText = resumeText.toLowerCase();
  const lines = resumeText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const hasEmail = EMAIL_REGEX.test(resumeText);
  const hasPhone = PHONE_REGEX.test(resumeText);

  const foundSections = SECTION_HEADERS.filter((h) => lowerText.includes(h));

  const bulletLines = lines.filter((l) => /^[\s]*[-•*▪●]/.test(l));
  const bulletRatio = lines.length ? bulletLines.length / lines.length : 0;

  const wordCount = resumeText.trim().split(/\s+/).length;

  const issues = [];
  if (!hasEmail) issues.push('No email address detected — ATS systems and recruiters both rely on this to reach you.');
  if (!hasPhone) issues.push('No phone number detected.');
  if (foundSections.length < 3) issues.push('Fewer than 3 standard section headers found (Experience, Education, Skills, etc.) — this can confuse ATS parsers.');
  if (bulletLines.length === 0) issues.push('No bullet points detected — dense paragraphs are harder for both ATS and human reviewers to scan.');
  if (wordCount < 150) issues.push('Resume seems very short — may be missing detail recruiters look for.');
  if (wordCount > 1200) issues.push('Resume is quite long — consider trimming to 1-2 pages worth of content.');

  let keywordMatch = null;
  let matchedKeywords = [];
  let missingKeywords = [];

  if (jobDescription && jobDescription.length > 20) {
    const jdKeywords = extractKeywords(jobDescription);
    const resumeTokens = new Set(tokenize(resumeText));

    matchedKeywords = jdKeywords.filter((k) => resumeTokens.has(k));
    missingKeywords = jdKeywords.filter((k) => !resumeTokens.has(k));
    keywordMatch = jdKeywords.length
      ? Math.round((matchedKeywords.length / jdKeywords.length) * 100)
      : null;
  }

  // Deterministic component score (0-100), separate from the AI's holistic score
  let ruleScore = 100;
  ruleScore -= issues.length * 10;
  if (keywordMatch !== null) {
    ruleScore = Math.round(ruleScore * 0.6 + keywordMatch * 0.4);
  }
  ruleScore = Math.max(0, Math.min(100, ruleScore));

  return {
    ruleScore,
    hasEmail,
    hasPhone,
    foundSections,
    bulletPointCount: bulletLines.length,
    bulletRatio: Number(bulletRatio.toFixed(2)),
    wordCount,
    issues,
    keywordMatch,
    matchedKeywords,
    missingKeywords: missingKeywords.slice(0, 15),
  };
}

module.exports = { runHeuristics };
