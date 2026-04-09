import { showToast, fmtSize, dlBlob } from '../../shared.js';

let imgFile = null;
let imgOrigDataUrl = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('imgFileInput');
const imgOptions = document.getElementById('imgOptions');
const previewThumb = document.getElementById('previewThumb');
const imgFileName = document.getElementById('imgFileName');
const imgFileSize = document.getElementById('imgFileSize');
const imgFormat = document.getElementById('imgFormat');
const imgQuality = document.getElementById('imgQuality');
const qualityVal = document.getElementById('qualityVal');
const convertBtn = document.getElementById('convertBtn');
const resetBtn = document.getElementById('resetBtn');
const imgResult = document.getElementById('imgResult');
const resOrigImg = document.getElementById('resOrigImg');
const resConvImg = document.getElementById('resConvImg');
const resInfo = document.getElementById('resInfo');
const downloadBtn = document.getElementById('downloadBtn');

dropzone.onclick = () => fileInput.click();
fileInput.onchange = (e) => handleFile(e.target.files[0]);

imgQuality.oninput = () => qualityVal.textContent = imgQuality.value + '%';

dropzone.ondragover = (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--fg)'; };
dropzone.ondragleave = () => dropzone.style.borderColor = 'var(--accents-2)';
dropzone.ondrop = (e) => {
  e.preventDefault();
  handleFile(e.dataTransfer.files[0]);
};

function handleFile(file) {
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showToast('Use JPG, PNG, or WEBP.');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('File too large. Max 20 MB.');
    return;
  }
  
  imgFile = file;
  const rd = new FileReader();
  rd.onload = (e) => {
    imgOrigDataUrl = e.target.result;
    previewThumb.src = imgOrigDataUrl;
    imgFileName.textContent = file.name;
    imgFileSize.textContent = fmtSize(file.size);
    imgOptions.style.display = 'block';
    dropzone.style.display = 'none';
    imgResult.style.display = 'none';
  };
  rd.readAsDataURL(file);
}

convertBtn.onclick = () => {
  if (!imgFile || !imgOrigDataUrl) return;

  const mime = imgFormat.value;
  const q = parseInt(imgQuality.value) / 100;
  const exts = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const ext = exts[mime] || 'jpg';

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.drawImage(img, 0, 0);
    const result = canvas.toDataURL(mime, q);
    
    resOrigImg.src = imgOrigDataUrl;
    resConvImg.src = result;
    imgResult.style.display = 'block';
    
    const approx = Math.round(result.split(',')[1].length * 0.75);
    resInfo.textContent = `${fmtSize(imgFile.size)} → ~${fmtSize(approx)}`;
    
    const base = imgFile.name.replace(/\.[^.]+$/, '');
    downloadBtn.onclick = () => dlBlob(result, `${base}_converted.${ext}`);
    
    showToast('Image converted successfully!', 'success');
  };
  img.src = imgOrigDataUrl;
};

resetBtn.onclick = () => {
  imgFile = null;
  imgOrigDataUrl = null;
  fileInput.value = '';
  imgOptions.style.display = 'none';
  dropzone.style.display = 'flex';
  imgResult.style.display = 'none';
};
