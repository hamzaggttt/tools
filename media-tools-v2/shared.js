export function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

export function dlBlob(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

export function showToast(msg, type = 'error') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const t = document.createElement('div');
  t.id = 'toast';
  t.textContent = msg;
  t.style.cssText = `
    position: fixed; bottom: 2rem; right: 2rem;
    padding: 0.75rem 1.25rem; border-radius: 8px;
    font-size: 0.875rem; font-weight: 500; z-index: 1000;
    background: ${type === 'success' ? '#0070f3' : '#ee0000'};
    color: #fff; box-shadow: 0 8px 30px rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.1);
    animation: slideIn 0.3s ease-out;
  `;
  document.body.appendChild(t);

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(100%)';
    t.style.transition = 'all 0.3s ease-in';
    setTimeout(() => t.remove(), 300);
  }, 4000);
}
