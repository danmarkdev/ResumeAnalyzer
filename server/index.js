require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const { runHeuristics } = require('./heuristics');
const { getAIFeedback } = require('./aiClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Store uploads temporarily; deleted right after processing (resumes are personal data)
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Only PDF and DOCX files are supported'));
    }
    cb(null, true);
  },
});

async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  throw new Error('Unsupported file type');
}

app.post('/api/analyze', upload.single('resume'), async (req, res) => {
  let filePath;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    filePath = req.file.path;
    const originalName = req.file.originalname;
    const jobDescription = (req.body.jobDescription || '').trim();

    const resumeText = await extractText(filePath, originalName);

    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(422).json({
        error: 'Could not extract enough text from this file. It may be a scanned image rather than selectable text.',
      });
    }

    // Rule-based checks computed independently of the AI call
    const heuristics = runHeuristics(resumeText, jobDescription);

    // AI-generated structured feedback
    const aiFeedback = await getAIFeedback(resumeText, jobDescription);

    res.json({
      heuristics,
      aiFeedback,
      meta: {
        fileName: originalName,
        wordCount: resumeText.trim().split(/\s+/).length,
      },
    });
  } catch (err) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message || 'Something went wrong analyzing the resume.' });
  } finally {
    // Always clean up the uploaded file, success or failure
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {});
    }
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Resume analyzer running at http://localhost:${PORT}`);
});
