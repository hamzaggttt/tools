import { showToast, fmtSize } from '../../shared.js';

let selectedFile = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('auFileInput');
const auInfo = document.getElementById('auInfo');
const auFileName = document.getElementById('auFileName');
const auFileSize = document.getElementById('auFileSize');
const processBtn = document.getElementById('au-process');
const resetBtn = document.getElementById('resetBtn');
const auProgress = document.getElementById('auProgress');
const progressFill = document.getElementById('progressFill');
const progressPct = document.getElementById('progressPct');
const progressLabel = document.getElementById('progressLabel');
const auResult = document.getElementById('auResult');
const downloadBtn = document.getElementById('downloadBtn');

// Range slider live value displays
const denoiseSlider = document.getElementById('au-denoise');
const denoiseVal = document.getElementById('au-denoise-val');
const levelerSlider = document.getElementById('au-leveler');
const levelerVal = document.getElementById('au-leveler-val');

denoiseSlider.oninput = () => denoiseVal.textContent = denoiseSlider.value;
levelerSlider.oninput = () => levelerVal.textContent = levelerSlider.value + '%';

// Preset auto-fill
document.getElementById('au-tone').onchange = (e) => {
  const preset = e.target.value;
  if (preset === 'natural') {
    denoiseSlider.value = 8; denoiseVal.textContent = '8';
    levelerSlider.value = 60; levelerVal.textContent = '60%';
    document.getElementById('au-loudness').value = '-16';
    document.getElementById('au-denoise-method').value = 'auto';
  } else if (preset === 'medium') {
    denoiseSlider.value = 12; denoiseVal.textContent = '12';
    levelerSlider.value = 80; levelerVal.textContent = '80%';
    document.getElementById('au-loudness').value = '-16';
    document.getElementById('au-denoise-method').value = 'speech_isolation';
  } else if (preset === 'hard') {
    denoiseSlider.value = 18; denoiseVal.textContent = '18';
    levelerSlider.value = 95; levelerVal.textContent = '95%';
    document.getElementById('au-loudness').value = '-14';
    document.getElementById('au-denoise-method').value = 'speech_isolation';
  }
};

// File handling
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
  processBtn.disabled = false;
}

// Process
processBtn.onclick = async () => {
  if (!selectedFile) return;
  
  processBtn.disabled = true;
  auProgress.style.display = 'block';
  progressFill.style.width = '5%';
  progressPct.textContent = '5%';
  progressLabel.textContent = 'Uploading to Auphonic servers...';
  
  const formData = new FormData();
  formData.append('media', selectedFile);
  formData.append('tone', document.getElementById('au-tone').value);
  formData.append('loudness', document.getElementById('au-loudness').value);
  formData.append('denoise', denoiseSlider.value);
  formData.append('leveler', levelerSlider.value);
  formData.append('denoiseMethod', document.getElementById('au-denoise-method').value);
  formData.append('filtering', document.getElementById('au-filtering').value);

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
