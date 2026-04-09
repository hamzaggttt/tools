import { showToast, fmtSize } from '../../shared.js';

let selectedFile = null;
let segments = [];
let originalFileUrl = null;
let activeSegmentIndex = -1;

const videoPlayer = document.getElementById('video-player');
const videoInput = document.getElementById('video-input');
const dropScreen = document.getElementById('drop-screen');
const transcribeBtn = document.getElementById('transcribe-btn');
const exportBtn = document.getElementById('export-btn');
const timeline = document.getElementById('timeline');
const statusText = document.getElementById('status-text');
const progWrap = document.getElementById('prog-wrap');
const progFill = document.getElementById('prog-fill');
const downloadLink = document.getElementById('download-link');
const exportResult = document.getElementById('export-result');

// Elements for styles
const styleInputs = {
  fontSize: document.getElementById('size'),
  primaryColor: document.getElementById('primaryColor'),
  outlineColor: document.getElementById('outlineColor'),
  posY: document.getElementById('posY')
};

videoInput.onchange = (e) => {
  if (e.target.files.length) {
    selectedFile = e.target.files[0];
    videoPlayer.src = URL.createObjectURL(selectedFile);
    videoPlayer.style.display = 'block';
    dropScreen.style.display = 'none';
    transcribeBtn.disabled = false;
    showToast('Video loaded!', 'success');
  }
};

transcribeBtn.onclick = async () => {
  if (!selectedFile) return;
  
  transcribeBtn.disabled = true;
  progWrap.style.display = 'block';
  statusText.textContent = 'Uploading and transcribing...';
  
  const formData = new FormData();
  formData.append('video', selectedFile);

  try {
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData
    });
    
    if (!res.ok) throw new Error('Transcription failed');
    const { jobId } = await res.json();
    
    pollTranscription(jobId);
  } catch (err) {
    showToast(err.message);
    transcribeBtn.disabled = false;
  }
};

async function pollTranscription(jobId) {
  const intv = setInterval(async () => {
    try {
      const res = await fetch(`/api/status/${jobId}`);
      const job = await res.json();
      
      progFill.style.width = job.progress + '%';
      statusText.textContent = job.step || 'Processing...';

      if (job.status === 'completed') {
        clearInterval(intv);
        segments = job.transcription.segments;
        originalFileUrl = job.file;
        renderTimeline();
        exportBtn.disabled = false;
        statusText.textContent = 'Transcription complete!';
        showToast('Transcription finished!', 'success');
      } else if (job.status === 'error') {
        clearInterval(intv);
        showToast('Error: ' + job.error);
        transcribeBtn.disabled = false;
      }
    } catch (err) {
      console.error(err);
    }
  }, 2000);
}

function renderTimeline() {
  timeline.innerHTML = '';
  if (!segments.length) return;

  segments.forEach((seg, i) => {
    const div = document.createElement('div');
    div.className = 'segment-item';
    div.dataset.index = i;
    
    div.innerHTML = `
      <div class="segment-time">${formatTime(seg.start)} - ${formatTime(seg.end)}</div>
      <input class="segment-text-input" value="${seg.text}" />
    `;
    
    const input = div.querySelector('input');
    input.oninput = (e) => {
      segments[i].text = e.target.value;
    };
    
    div.onclick = () => {
      videoPlayer.currentTime = seg.start;
      videoPlayer.play();
    };

    timeline.appendChild(div);
  });
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sc = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sc.toString().padStart(2, '0')}.${ms}`;
}

// Sync video with timeline
videoPlayer.ontimeupdate = () => {
  const time = videoPlayer.currentTime;
  const newIndex = segments.findIndex(s => time >= s.start && time <= s.end);
  
  if (newIndex !== activeSegmentIndex) {
    if (activeSegmentIndex !== -1) {
      timeline.children[activeSegmentIndex]?.classList.remove('active');
    }
    activeSegmentIndex = newIndex;
    if (activeSegmentIndex !== -1) {
      const activeEl = timeline.children[activeSegmentIndex];
      activeEl?.classList.add('active');
      activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
};

exportBtn.onclick = async () => {
  if (!segments.length) return;
  
  exportBtn.disabled = true;
  statusText.textContent = 'Burning captions into video... (may take a minute)';
  progFill.style.width = '5%';
  
  const style = {
    fontSize: styleInputs.fontSize.value,
    primaryColor: styleInputs.primaryColor.value.replace('#', 'FF').toUpperCase(), // Convert to ASS color format
    outlineColor: styleInputs.outlineColor.value.replace('#', '00').toUpperCase(),
    outlineWidth: 2,
    posX: 50,
    posY: styleInputs.posY.value
  };

  try {
    const res = await fetch('/api/burn-captions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'local-res',
        originalFile: originalFileUrl,
        segments: segments,
        style: style
      })
    });
    
    if (!res.ok) throw new Error('Export failed');
    const { jobId } = await res.json();
    
    pollExport(jobId);
  } catch (err) {
    showToast(err.message);
    exportBtn.disabled = false;
  }
};

async function pollExport(jobId) {
  const intv = setInterval(async () => {
    try {
      const res = await fetch(`/api/status/${jobId}`);
      const job = await res.json();
      
      progFill.style.width = job.progress + '%';
      statusText.textContent = job.step || 'Exporting...';

      if (job.status === 'completed') {
        clearInterval(intv);
        downloadLink.href = `${job.file}`;
        exportResult.style.display = 'block';
        exportBtn.disabled = false;
        statusText.textContent = 'Video exported successfully!';
        showToast('Export finished!', 'success');
      } else if (job.status === 'error') {
        clearInterval(intv);
        showToast('Error: ' + job.error);
        exportBtn.disabled = false;
      }
    } catch (err) {
      console.error(err);
    }
  }, 3000);
}
