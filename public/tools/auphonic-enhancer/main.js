import { showToast, fmtSize } from '../../shared.js';

let selectedFile = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('auFileInput');
const auInfo = document.getElementById('auInfo');
const auFileName = document.getElementById('auFileName');
const auFileSize = document.getElementById('auFileSize');
const processBtn = document.getElementById('au-process'); // FIXED: Matches ID in index.html
const resetBtn = document.getElementById('resetBtn');
const auProgress = document.getElementById('auProgress');
const progressFill = document.getElementById('progressFill');
const progressPct = document.getElementById('progressPct');
const progressLabel = document.getElementById('progressLabel');
const auResult = document.getElementById('auResult');
const downloadBtn = document.getElementById('downloadBtn');

dropzone.onclick = () => fileInput.click();
fileInput.onchange = (e) => handleFile(e.target.files[0]);

dropzone.ondragover = (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--fg)'; };
dropzone.ondragleave = () => dropzone.style.borderColor = 'var(--accents-2)';
dropzone.ondrop = (e) => {
  e.preventDefault();
  handleFile(e.dataTransfer.files[0]);
};

function handleFile(file) {
  if (!file) return;
  selectedFile = file;
  auFileName.textContent = file.name;
  auFileSize.textContent = fmtSize(file.size);
  auInfo.style.display = 'block';
  dropzone.style.display = 'none';
  auResult.style.display = 'none';
  processBtn.disabled = false; // FIXED: Enable button after file selection
}

processBtn.onclick = async () => {
  if (!selectedFile) return;
  
  processBtn.disabled = true;
  auProgress.style.display = 'block';
  progressFill.style.width = '5%';
  progressLabel.textContent = 'Uploading to enhancement engine...';
  
  const tone = document.getElementById('au-tone').value;
  const formData = new FormData();
  formData.append('media', selectedFile);
  formData.append('tone', tone);

  try {
    const res = await fetch('/api/auphonic', {
      method: 'POST',
      body: formData
    });
    
    if (!res.ok) throw new Error('Failed to start processing');
    const { jobId } = await res.json();
    
    pollStatus(jobId);
  } catch (err) {
    showToast(err.message);
    processBtn.disabled = false;
  }
};

async function pollStatus(jobId) {
  const intv = setInterval(async () => {
    try {
      const res = await fetch(`/api/auphonic/status/${jobId}`);
      const job = await res.json();
      
      const progress = job.progress || 0;
      progressFill.style.width = progress + '%';
      progressPct.textContent = progress + '%';
      progressLabel.textContent = job.step || 'Processing...';

      if (job.status === 'completed') {
        clearInterval(intv);
        // Important: check if the resultUrl is relative or absolute
        downloadBtn.href = job.resultUrl;
        auResult.style.display = 'block';
        processBtn.disabled = false;
        showToast('Audio enhancement complete!', 'success');
      } else if (job.status === 'error') {
        clearInterval(intv);
        showToast('Error: ' + job.error);
        processBtn.disabled = false;
      }
    } catch (err) {
      console.error(err);
    }
  }, 4000);
}

resetBtn.onclick = () => {
  selectedFile = null;
  fileInput.value = '';
  auInfo.style.display = 'none';
  dropzone.style.display = 'flex';
  auProgress.style.display = 'none';
  auResult.style.display = 'none';
};
