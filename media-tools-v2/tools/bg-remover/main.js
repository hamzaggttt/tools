import { showToast, dlBlob } from '../../shared.js';

const BACKEND_URL = 'http://localhost:3000';
let resultBlob = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const origImg = document.getElementById('origImg');
const resultImg = document.getElementById('resultImg');
const overlay = document.getElementById('processingOverlay');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

dropzone.onclick = () => fileInput.click();

fileInput.onchange = (e) => handleFile(e.target.files[0]);

dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('dragover'); };
dropzone.ondragleave = () => dropzone.classList.remove('dragover');
dropzone.ondrop = (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
};

function handleFile(file) {
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
    showToast('Please upload a JPG or PNG image.');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showToast('File too large. Max 12 MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    origImg.src = e.target.result;
    previewSection.style.display = 'block';
    dropzone.style.display = 'none';
    processImage(file);
  };
  reader.readAsDataURL(file);
}

async function processImage(file) {
  overlay.style.display = 'flex';
  downloadBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('image_file', file);

    const response = await fetch('/api/remove-bg', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'API error ' + response.status);
    }

    resultBlob = await response.blob();
    const url = URL.createObjectURL(resultBlob);
    resultImg.src = url;
    downloadBtn.disabled = false;
    showToast('Background removed!', 'success');
  } catch (err) {
    console.error(err);
    showToast(err.message);
  } finally {
    overlay.style.display = 'none';
  }
}

downloadBtn.onclick = () => {
  if (resultBlob) dlBlob(URL.createObjectURL(resultBlob), 'bg-removed.png');
};

resetBtn.onclick = () => {
  resultBlob = null;
  fileInput.value = '';
  previewSection.style.display = 'none';
  dropzone.style.display = 'flex';
  origImg.src = '';
  resultImg.src = '';
};
