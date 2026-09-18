# Resume Analyzer

An AI-powered resume/CV analyzer that gives you an ATS-readiness score and structured, actionable feedback — combining deterministic rule-based checks with AI-generated review.

## Features

- **Upload PDF or DOCX** resumes — text is extracted server-side (`pdf-parse` / `mammoth`)
- **Rule-based ATS checks** — email/phone detection, section headers, bullet-point usage, keyword match against a pasted job description
- **AI-generated feedback** — strengths, missing keywords, formatting issues, section-by-section commentary, and top recommendations, returned as structured JSON (not free-form chat text)
- **Privacy-conscious** — uploaded files are deleted immediately after processing, never stored long-term
- **No database required** — fully stateless; each analysis is a single request/response

## Why two scores?

The **ATS Score** is computed with deterministic rules (has an email? uses bullet points? matches job keywords?) so it's explainable and doesn't depend on the AI's mood. The **AI Score** reflects a more holistic, human-reader judgment of the resume's quality. Showing both is more honest than pretending a single number captures everything.

## Setup

```bash
git clone <your-repo-url>
cd resume-analyzer
npm install
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=your_api_key_here
```

Get a key at [console.anthropic.com](https://console.anthropic.com/).

## Run

```bash
npm start
```

Visit `http://localhost:3000`.

For development with auto-restart on file changes:

```bash
npm run dev
```

## Project structure

```
resume-analyzer/
├── server/
│   ├── index.js       # Express app, upload handling, route
│   ├── heuristics.js  # Rule-based ATS checks (no AI call needed)
│   └── aiClient.js    # Claude API call + structured JSON prompt
├── public/
│   ├── index.html     # Upload form + results UI
│   ├── style.css
│   └── script.js       # Fetch call, results rendering
├── uploads/            # Temp storage, auto-cleared after each request
├── .env.example
└── package.json
```

## Tech stack

- **Backend:** Node.js, Express, Multer (file upload)
- **Parsing:** `pdf-parse` (PDF), `mammoth` (DOCX)
- **AI:** Anthropic Claude API, prompted for strict structured JSON output
- **Frontend:** Vanilla JS + Tailwind CSS (CDN) — no build step

## Known limitations

- Scanned/image-based PDFs (no selectable text) won't extract properly — OCR is a possible future addition
- Multi-column resume layouts can sometimes extract text out of visual order — this is a real ATS pain point, not just a bug in this tool
- 5MB upload limit (configurable in `server/index.js`)

## Possible next steps

- Job-description match percentage as its own dedicated view
- Before/after comparison when a user re-uploads a revised resume
- Resume rewrite suggestions per bullet point
- Swap Multer's disk storage for in-memory buffers to avoid touching disk at all
