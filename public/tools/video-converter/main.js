import { showToast, fmtSize, dlBlob } from '../../shared.js';

let vidFile = null;
let ffmpegLoaded = false;
let ffmpegInst = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('vidFileInput');
const vidInfo = document.getElementById('vidInfo');
const vidFileName = document.getElementById('vidFileName');
const vidFileSize = document.getElementById('vidFileSize');
const vidFormat = document.getElementById('vidFormat');
const convertBtn = document.getElementById('convertBtn');
const resetBtn = document.getElementById('resetBtn');
const vidProgress = document.getElementById('vidProgress');
const progressFill = document.getElementById('progressFill');
const progressPct = document.getElementById('progressPct');
const progressLabel = document.getElementById('progressLabel');
const vidResult = document.getElementById('vidResult');
const resultInfo = document.getElementById('resultInfo');
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
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['mp4', 'mov', 'avi', 'webm'].includes(ext)) {
    showToast('Unsupported format. Use MP4, MOV, AVI, or WEBM.');
    return;
  }
  if (file.size > 500 * 1024 * 1024) {
    showToast('File too large. Max 500 MB.');
    return;
  }
  
  vidFile = file;
  vidFileName.textContent = file.name;
  vidFileSize.textContent = fmtSize(file.size);
  vidInfo.style.display = 'block';
  dropzone.style.display = 'none';
  vidResult.style.display = 'none';
  vidProgress.style.display = 'none';
}

async function getFFmpeg() {
  if (!ffmpegLoaded) {
    const { createFFmpeg } = FFmpeg;
    ffmpegInst = createFFmpeg({
      log: false,
      progress: ({ ratio }) => {
        const pct = Math.min(Math.round(ratio * 100), 100);
        progressFill.style.width = pct + '%';
        progressPct.textContent = pct + '%';
        if (pct > 0) progressLabel.textContent = 'Converting...';
      }
    });
    progressLabel.textContent = 'Loading FFmpeg engine...';
    vidProgress.style.display = 'block';
    await ffmpegInst.load();
    ffmpegLoaded = true;
  }
  return ffmpegInst;
}

convertBtn.onclick = async () => {
  if (!vidFile) return;
  
  const format = vidFormat.value;
  vidProgress.style.display = 'block';
  vidResult.style.display = 'none';
  progressFill.style.width = '2%';
  progressPct.textContent = '0%';
  convertBtn.disabled = true;

  try {
    const ff = await getFFmpeg();
    const inExt = vidFile.name.split('.').pop().toLowerCase();
    const inName = 'input.' + inExt;
    const outName = 'output.' + format;

    progressLabel.textContent = 'Reading file...';
    ff.FS('writeFile', inName, await FFmpeg.fetchFile(vidFile));
    
    let args = ['-i', inName];
    if (format === 'mp4') args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart');
    else if (format === 'mov') args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac');
    else if (format === 'webm') args.push('-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-c:a', 'libopus');
    args.push(outName);

    progressLabel.textContent = 'Converting...';
    await ff.run(...args);

    const data = ff.FS('readFile', outName);
    const mimes = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
    const blob = new Blob([data.buffer], { type: mimes[format] });
    const url = URL.createObjectURL(blob);

    try { ff.FS('unlink', inName); ff.FS('unlink', outName); } catch (e) {}

    progressLabel.textContent = 'Done!';
    progressFill.style.width = '100%';
    progressPct.textContent = '100%';
    
    const base = vidFile.name.replace(/\.[^.]+$/, '');
    resultInfo.textContent = `${base}.${format} · ${fmtSize(blob.size)}`;
    downloadBtn.onclick = () => dlBlob(url, `${base}.${format}`);
    
    vidResult.style.display = 'block';
    showToast('Video converted successfully!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Conversion failed: ' + err.message);
  } finally {
    convertBtn.disabled = false;
  }
};

resetBtn.onclick = () => {
  vidFile = null;
  fileInput.value = '';
  vidInfo.style.display = 'none';
  dropzone.style.display = 'flex';
  vidProgress.style.display = 'none';
  vidResult.style.display = 'none';
};
