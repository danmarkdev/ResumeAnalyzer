const form = document.getElementById('analyze-form');
const fileInput = document.getElementById('resume-file');
const dropZone = document.getElementById('drop-zone');
const dropText = document.getElementById('drop-text');
const submitBtn = document.getElementById('submit-btn');

const loadingSection = document.getElementById('loading-section');
const errorSection = document.getElementById('error-section');
const resultsSection = document.getElementById('results-section');

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('border-indigo-400');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('border-indigo-400');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-indigo-400');
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    updateDropText();
  }
});

fileInput.addEventListener('change', updateDropText);

function updateDropText() {
  if (fileInput.files.length) {
    dropText.textContent = `Selected: ${fileInput.files[0].name}`;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!fileInput.files.length) return;

  errorSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  resultsSection.innerHTML = '';
  loadingSection.classList.remove('hidden');
  submitBtn.disabled = true;

  const formData = new FormData();
  formData.append('resume', fileInput.files[0]);
  formData.append('jobDescription', document.getElementById('job-description').value);

  try {
    const res = await fetch('/api/analyze', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong.');
    }

    renderResults(data);
  } catch (err) {
    errorSection.textContent = err.message;
    errorSection.classList.remove('hidden');
  } finally {
    loadingSection.classList.add('hidden');
    submitBtn.disabled = false;
  }
});

function scoreColor(score) {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#ca8a04';
  return '#dc2626';
}

function scoreRingSVG(score, label) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);

  return `
    <div class="flex flex-col items-center">
      <svg width="100" height="100" viewBox="0 0 100 100" class="score-ring">
        <circle cx="50" cy="50" r="${radius}" stroke="#3f3f46" stroke-width="10" fill="none" />
        <circle cx="50" cy="50" r="${radius}" stroke="${color}" stroke-width="10" fill="none"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" />
      </svg>
      <div class="-mt-16 text-2xl font-bold" style="color:${color}">${score}</div>
      <div class="mt-16 text-xs text-neutral-400 uppercase tracking-wide">${label}</div>
    </div>
  `;
}

function listBlock(title, items, tagClass) {
  if (!items || !items.length) return '';
  return `
    <div>
      <h4 class="text-sm font-semibold text-neutral-200 mb-2">${title}</h4>
      <div class="flex flex-wrap gap-2">
        ${items.map((i) => `<span class="tag ${tagClass}">${escapeHtml(i)}</span>`).join('')}
      </div>
    </div>
  `;
}

function bulletBlock(title, items) {
  if (!items || !items.length) return '';
  return `
    <div>
      <h4 class="text-sm font-semibold text-neutral-200 mb-2">${title}</h4>
      <ul class="list-disc list-inside space-y-1 text-sm text-neutral-300">
        ${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}
      </ul>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderResults(data) {
  const { heuristics, aiFeedback, meta } = data;

  resultsSection.innerHTML = `
    <div class="bg-neutral-900 rounded-xl border border-neutral-800 p-6 shadow-lg">
      <div class="flex flex-col sm:flex-row items-center gap-8 justify-center">
        ${scoreRingSVG(aiFeedback.overall_score, 'AI Score')}
        ${scoreRingSVG(heuristics.ruleScore, 'ATS Score')}
      </div>
      <p class="mt-6 text-neutral-200 text-sm leading-relaxed border-t border-neutral-800 pt-4">${escapeHtml(aiFeedback.summary)}</p>
      <p class="mt-2 text-xs text-neutral-500">${meta.fileName} · ${meta.wordCount} words</p>
    </div>

    <div class="bg-neutral-900 rounded-xl border border-neutral-800 p-6 shadow-lg space-y-4">
      <h3 class="font-semibold text-white">Rule-based checks</h3>
      <div class="grid sm:grid-cols-2 gap-4 text-sm">
        <div class="flex items-center gap-2">${heuristics.hasEmail ? '✅' : '⚠️'} Email address detected</div>
        <div class="flex items-center gap-2">${heuristics.hasPhone ? '✅' : '⚠️'} Phone number detected</div>
        <div class="flex items-center gap-2">${heuristics.bulletPointCount > 0 ? '✅' : '⚠️'} Bullet points used (${heuristics.bulletPointCount})</div>
        <div class="flex items-center gap-2">${heuristics.foundSections.length >= 3 ? '✅' : '⚠️'} Section headers found (${heuristics.foundSections.length})</div>
      </div>
      ${heuristics.keywordMatch !== null ? `<p class="text-sm text-neutral-300">Keyword match with job description: <strong>${heuristics.keywordMatch}%</strong></p>` : ''}
      ${bulletBlock('Detected issues', heuristics.issues)}
    </div>

    <div class="bg-neutral-900 rounded-xl border border-neutral-800 p-6 shadow-lg space-y-5">
      <h3 class="font-semibold text-white">AI feedback</h3>
      ${listBlock('Strengths', aiFeedback.strengths, 'bg-green-950 text-green-400 border border-green-900')}
      ${listBlock('Missing keywords', aiFeedback.missing_keywords, 'bg-amber-950 text-amber-400 border border-amber-900')}
      ${bulletBlock('Formatting issues', aiFeedback.formatting_issues)}
      <div>
        <h4 class="text-sm font-semibold text-neutral-200 mb-2">Section-by-section feedback</h4>
        <div class="space-y-2 text-sm text-neutral-300">
          ${Object.entries(aiFeedback.section_feedback || {}).map(([section, feedback]) => `
            <div class="border-l-2 border-indigo-700 pl-3">
              <span class="font-medium capitalize text-white">${section.replace(/_/g, ' ')}:</span> ${escapeHtml(feedback)}
            </div>
          `).join('')}
        </div>
      </div>
      ${bulletBlock('Top recommendations', aiFeedback.top_recommendations)}
    </div>
  `;

  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth' });
}
