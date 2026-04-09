import { showToast, dlBlob } from '../../shared.js';


const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let bgImg = null;
let overlays = [];
let draggingText = false;
let dragOverlay = null;
let textX = 640, textY = 600;

// Elements
const uploadScreen = document.getElementById('upload-screen');
const editorScreen = document.getElementById('editor-screen');
const fileInput = document.getElementById('file-input');
const aiImgPrompt = document.getElementById('ai-img-prompt');
const aiGenBtn = document.getElementById('ai-gen-btn');
const textInput = document.getElementById('text-input');
const fontSizeInput = document.getElementById('font-size');
const textColorInput = document.getElementById('text-color');
const strokeColorInput = document.getElementById('stroke-color');
const brightInput = document.getElementById('bright');
const contrastInput = document.getElementById('contrast');
const aiTitleBtn = document.getElementById('ai-title-btn');
const aiTitleResults = document.getElementById('ai-title-results');
const faceZoomBtn = document.getElementById('face-zoom-btn');
const emojiGrid = document.getElementById('emoji-grid');

// Init Emojis
const emojis = ['🔥', '😱', '💀', '🤯', '⚡', '❤️', '👀', '🚀', '💰', '⬆️', '⭐', '🎯'];
emojis.forEach(e => {
  const btn = document.createElement('button');
  btn.className = 'emoji-btn';
  btn.textContent = e;
  btn.onclick = () => addEmoji(e);
  emojiGrid.appendChild(btn);
});

fileInput.onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.type.startsWith('video/')) {
    const vid = document.createElement('video');
    vid.muted = true; vid.src = URL.createObjectURL(f);
    await new Promise(r => vid.onloadeddata = r);
    vid.currentTime = Math.min(1, vid.duration * 0.1);
    await new Promise(r => vid.onseeked = r);
    const tmpC = document.createElement('canvas');
    tmpC.width = vid.videoWidth; tmpC.height = vid.videoHeight;
    tmpC.getContext('2d').drawImage(vid, 0, 0);
    const img = new Image();
    img.onload = () => loadImg(img);
    img.src = tmpC.toDataURL();
  } else {
    const img = new Image();
    img.onload = () => loadImg(img);
    img.src = URL.createObjectURL(f);
  }
};

aiGenBtn.onclick = async () => {
  const prompt = aiImgPrompt.value.trim();
  if (!prompt) return showToast('Enter prompt');
  aiGenBtn.disabled = true;
  aiGenBtn.textContent = 'Generating...';
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1280&height=720&nologo=true&seed=${Date.now()}`;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    aiGenBtn.disabled = false;
    aiGenBtn.textContent = 'Create Image';
    loadImg(img);
  };
  img.src = url;
};

function loadImg(img) {
  bgImg = img;
  uploadScreen.style.display = 'none';
  editorScreen.style.display = 'grid';
  render();
}

function render() {
  if (!bgImg) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Filters
  ctx.filter = `brightness(${brightInput.value}%) contrast(${contrastInput.value}%)`;
  
  // Draw BG
  const iw = bgImg.naturalWidth, ih = bgImg.naturalHeight;
  const scale = Math.max(canvas.width / iw, canvas.height / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(bgImg, (canvas.width-dw)/2, (canvas.height-dh)/2, dw, dh);
  ctx.filter = 'none';

  // Draw Overlays
  overlays.forEach(o => {
    ctx.font = '64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(o.char, o.x, o.y);
  });

  // Draw Text
  const text = textInput.value;
  if (text) {
    const size = parseInt(fontSizeInput.value);
    ctx.font = `900 ${size}px Inter, Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = size / 8;
    ctx.strokeStyle = strokeColorInput.value;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, textX, textY);
    ctx.fillStyle = textColorInput.value;
    ctx.fillText(text, textX, textY);
  }
}

// Input listeners
[textInput, fontSizeInput, textColorInput, strokeColorInput, brightInput, contrastInput].forEach(i => {
  i.oninput = render;
});

function addEmoji(char) {
  overlays.push({ char, x: 640, y: 360 });
  render();
}

// Interactivity
canvas.onmousedown = (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (canvas.width / r.width);
  const my = (e.clientY - r.top) * (canvas.height / r.height);

  // Check overlays
  for(let i = overlays.length-1; i>=0; i--) {
    const o = overlays[i];
    if (Math.hypot(mx-o.x, my-o.y) < 40) { dragOverlay = i; return; }
  }
  
  // Check text (simple bounding box)
  if (Math.hypot(mx-textX, my-textY) < 100) draggingText = true;
};

window.onmousemove = (e) => {
  if (!draggingText && dragOverlay === null) return;
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (canvas.width / r.width);
  const my = (e.clientY - r.top) * (canvas.height / r.height);

  if (draggingText) { textX = mx; textY = my; }
  else if (dragOverlay !== null) { overlays[dragOverlay].x = mx; overlays[dragOverlay].y = my; }
  render();
};

window.onmouseup = () => { draggingText = false; dragOverlay = null; };

// AI Titles
aiTitleBtn.onclick = async () => {
  const prompt = document.getElementById('ai-title-prompt').value.trim();
  if (!prompt) return showToast('Enter video description');
  aiTitleResults.innerHTML = '<p style="font-size: 0.75rem;">Thinking...</p>';
  try {
    const res = await fetch('/api/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: 'Generate 3 short, punchy clickbait titles for a YT thumbnail. Return only the titles separated by newlines.' }, { role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const titles = data.choices[0].message.content.split('\n').filter(t => t.trim());
    aiTitleResults.innerHTML = '';
    titles.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-ghost';
      btn.style.fontSize = '0.75rem'; btn.style.textAlign = 'left';
      btn.textContent = t.replace(/^\d+[\.\)]\s*/, '');
      btn.onclick = () => { textInput.value = btn.textContent; render(); };
      aiTitleResults.appendChild(btn);
    });
  } catch (err) {
    aiTitleResults.textContent = 'AI Error';
  }
};

// Export
document.getElementById('export-png').onclick = () => dlBlob(canvas.toDataURL('image/png'), 'thumbnail.png');
document.getElementById('export-jpg').onclick = () => dlBlob(canvas.toDataURL('image/jpeg', 0.9), 'thumbnail.jpg');
