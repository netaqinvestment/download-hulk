/* ═══════════════════════════════════════════════════════════════════════════
   Download Hulk — Complete Frontend Application
   Features: Queue, History, Playlist, Batch, Trim, Schedule, Drag&Drop,
             Clipboard, Dark/Light, Video Preview, Subtitles, Thumbnails
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── DOM References ─────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const urlInput = $('urlInput');
const pasteBtn = $('pasteBtn');
const fetchBtn = $('fetchBtn');
const errorMessage = $('errorMessage');
const errorText = $('errorText');
const videoSection = $('videoSection');
const videoThumbnail = $('videoThumbnail');
const videoTitle = $('videoTitle');
const videoDuration = $('videoDuration');
const platformBadge = $('platformBadge');
const uploaderName = $('uploaderName');
const viewCount = $('viewCount');
const formatGrid = $('formatGrid');
const downloadBtn = $('downloadBtn');
const progressContainer = $('progressContainer');
const progressFill = $('progressFill');
const progressPercent = $('progressPercent');
const progressStatus = $('progressStatus');
const progressSpeed = $('progressSpeed');
const progressEta = $('progressEta');
const platformsGrid = $('platformsGrid');
const toastContainer = $('toastContainer');
const themeToggle = $('themeToggle');
const queueList = $('queueList');
const queueBadge = $('queueBadge');
const queueSubtitle = $('queueSubtitle');
const historyList = $('historyList');
const historySubtitle = $('historySubtitle');

// ─── State ──────────────────────────────────────────────────────────────────
let currentVideoInfo = null;
let selectedFormat = null;
let activeDownloads = {};
let queueSSE = null;

// ─── Utilities ──────────────────────────────────────────────────────────────
function formatDuration(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
}
function formatSize(b) {
  if (!b) return '';
  const u = ['B','KB','MB','GB']; let i = 0, s = b;
  while (s >= 1024 && i < u.length - 1) { s /= 1024; i++; }
  return `${s.toFixed(1)} ${u[i]}`;
}
function formatViews(c) {
  if (!c) return '';
  if (c >= 1e9) return `${(c/1e9).toFixed(1)}B views`;
  if (c >= 1e6) return `${(c/1e6).toFixed(1)}M views`;
  if (c >= 1e3) return `${(c/1e3).toFixed(1)}K views`;
  return `${c} views`;
}
function detectPlatform(url) {
  const p = {
    'youtube.com': {name:'YouTube',color:'#FF0000',icon:'🎬'}, 'youtu.be': {name:'YouTube',color:'#FF0000',icon:'🎬'},
    'instagram.com': {name:'Instagram',color:'#E1306C',icon:'📸'}, 'facebook.com': {name:'Facebook',color:'#1877F2',icon:'👥'},
    'fb.watch': {name:'Facebook',color:'#1877F2',icon:'👥'}, 'tiktok.com': {name:'TikTok',color:'#00F2EA',icon:'🎵'},
    'twitter.com': {name:'Twitter/X',color:'#1DA1F2',icon:'🐦'}, 'x.com': {name:'Twitter/X',color:'#1DA1F2',icon:'🐦'},
    'reddit.com': {name:'Reddit',color:'#FF4500',icon:'🔴'}, 'vimeo.com': {name:'Vimeo',color:'#1AB7EA',icon:'🎥'},
    'dailymotion.com': {name:'Dailymotion',color:'#00AAFF',icon:'📺'}, 'twitch.tv': {name:'Twitch',color:'#9146FF',icon:'🟣'},
    'soundcloud.com': {name:'SoundCloud',color:'#FF5500',icon:'🎧'},
  };
  try { const h = new URL(url).hostname.replace('www.','').replace('m.','');
    for (const [d,info] of Object.entries(p)) { if (h.includes(d)) return info; }
  } catch(e) {}
  return {name:'Video',color:'#a855f7',icon:'🔗'};
}
function isValidUrl(s) { try { const u = new URL(s); return u.protocol==='http:'||u.protocol==='https:'; } catch(_) { return false; } }
function showError(msg) { errorText.textContent=msg; errorMessage.classList.add('visible'); setTimeout(()=>errorMessage.classList.remove('visible'),5000); }
function hideError() { errorMessage.classList.remove('visible'); }
function showToast(msg, type='success') {
  const t = document.createElement('div'); t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${type==='success'?'✅':'❌'}</span><span>${msg}</span>`;
  toastContainer.appendChild(t);
  setTimeout(()=>{ t.classList.add('removing'); setTimeout(()=>t.remove(),300); },4000);
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('panel' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1)).classList.add('active');
    if (btn.dataset.tab === 'queue') startQueueSSE();
    if (btn.dataset.tab === 'history') renderHistory();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DARK / LIGHT THEME
// ═══════════════════════════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('hulk-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('hulk-theme', next);
  showToast(`${next === 'dark' ? '🌙' : '☀️'} ${next.charAt(0).toUpperCase() + next.slice(1)} mode`);
});

// ═══════════════════════════════════════════════════════════════════════════
// CLIPBOARD AUTO-DETECT
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener('focus', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text && isValidUrl(text) && text !== urlInput.value && !currentVideoInfo) {
      urlInput.value = text;
      showToast('📋 URL detected from clipboard!');
    }
  } catch(e) {}
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = text;
    urlInput.focus();
    if (isValidUrl(text)) showToast('Link pasted!');
  } catch(e) { showToast('Cannot access clipboard', 'error'); }
});

// ═══════════════════════════════════════════════════════════════════════════
// DRAG & DROP
// ═══════════════════════════════════════════════════════════════════════════
const inputZone = $('inputZone');
const dropOverlay = $('dropOverlay');
let dragCounter = 0;

document.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; inputZone.classList.add('dragging'); });
document.addEventListener('dragleave', (e) => { e.preventDefault(); dragCounter--; if (dragCounter<=0) { inputZone.classList.remove('dragging'); dragCounter=0; } });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault(); dragCounter=0; inputZone.classList.remove('dragging');
  const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
  if (text && isValidUrl(text.trim())) {
    urlInput.value = text.trim();
    showToast('🔗 URL dropped!');
    fetchVideoInfo();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BATCH URLs
// ═══════════════════════════════════════════════════════════════════════════
const batchToggle = $('batchToggle');
const batchContainer = $('batchContainer');
const batchInput = $('batchInput');
const batchFetchBtn = $('batchFetchBtn');

batchToggle.addEventListener('click', () => {
  const shown = batchContainer.style.display !== 'none';
  batchContainer.style.display = shown ? 'none' : 'block';
  batchToggle.style.borderColor = shown ? '' : 'var(--accent-purple)';
  batchToggle.style.color = shown ? '' : 'var(--accent-purple)';
});

batchFetchBtn.addEventListener('click', async () => {
  const urls = batchInput.value.split('\n').map(u=>u.trim()).filter(u=>isValidUrl(u));
  if (urls.length === 0) { showError('No valid URLs found'); return; }

  try {
    batchFetchBtn.disabled = true;
    const res = await fetch('/api/download/batch', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ items: urls.map(u=>({url:u,formatId:'best',title:''})) }),
    });
    const data = await res.json();
    if (data.downloadIds) {
      showToast(`🚀 Started ${data.downloadIds.length} downloads!`);
      switchToTab('queue');
      startQueueSSE();
    }
  } catch(e) { showToast('Batch download failed', 'error'); }
  finally { batchFetchBtn.disabled = false; }
});

// ═══════════════════════════════════════════════════════════════════════════
// URL INPUT & FETCH
// ═══════════════════════════════════════════════════════════════════════════
urlInput.addEventListener('input', () => { hideError(); });
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchVideoInfo(); });
fetchBtn.addEventListener('click', fetchVideoInfo);

async function fetchVideoInfo() {
  const url = urlInput.value.trim();
  if (!url) { showError('Please enter a video URL'); return; }
  if (!isValidUrl(url)) { showError('Please enter a valid URL'); return; }

  hideError(); fetchBtn.classList.add('loading'); fetchBtn.disabled = true;
  videoSection.style.display = 'none';
  $('playlistSection').style.display = 'none';

  try {
    const response = await fetch('/api/info', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({url}),
    });
    if (!response.ok) { const d = await response.json(); throw new Error(d.error); }

    currentVideoInfo = await response.json();

    // If playlist, show playlist download UI
    if (currentVideoInfo.isPlaylist && currentVideoInfo.playlistCount) {
      showPlaylistDownloadUI(currentVideoInfo);
      showToast(`📋 Playlist detected: ${currentVideoInfo.playlistCount} videos`);
    } else {
      renderVideoInfo();
      showToast('Video info loaded!');
    }
  } catch(e) { showError(e.message); showToast(e.message, 'error'); }
  finally { fetchBtn.classList.remove('loading'); fetchBtn.disabled = false; }
}

function showPlaylistDownloadUI(info) {
  videoSection.style.display = 'block';
  videoThumbnail.src = info.thumbnail || '';
  videoTitle.textContent = info.title;
  videoDuration.textContent = `${info.playlistCount} videos • ${formatDuration(info.duration)}`;
  platformBadge.innerHTML = `📋 ${info.platform}`;
  uploaderName.textContent = info.uploader;
  viewCount.textContent = '';

  // Show simple format options + download all button
  formatGrid.innerHTML = '';
  info.formats.forEach((f, i) => {
    const opt = document.createElement('div');
    opt.className = 'format-option' + (i === 0 ? ' selected recommended' : '');
    opt.innerHTML = `
      <span class="format-type-icon">${f.type === 'audio' ? '🎵' : '🚀'}</span>
      <span class="format-label">${f.label}</span>
      <span class="format-meta">${f.format.toUpperCase()}</span>
    `;
    opt.addEventListener('click', () => {
      formatGrid.querySelectorAll('.format-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedFormat = f;
    });
    formatGrid.appendChild(opt);
  });
  selectedFormat = info.formats[0];

  // Replace download button with playlist download
  downloadBtn.disabled = false;
  document.querySelector('.download-btn-text').textContent = `⬇️ Download All ${info.playlistCount} Videos`;

  // Hide trim/schedule for playlists
  document.querySelector('.trim-section').style.display = 'none';
  document.querySelector('.schedule-section').style.display = 'none';

  // Override download action for playlist
  downloadBtn.onclick = async () => {
    downloadBtn.disabled = true;
    progressContainer.style.display = 'block';
    progressStatus.textContent = `Starting ${info.playlistCount} downloads...`;
    progressFill.style.width = '0%';

    try {
      const res = await fetch('/api/download/playlist', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ url: info.url, formatId: selectedFormat.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`🚀 Started ${data.count} playlist downloads!`);
      progressStatus.textContent = `${data.count} downloads started! Check Queue tab`;
      progressFill.style.width = '100%';
      progressPercent.textContent = '100%';
      switchToTab('queue');
      startQueueSSE();

      setTimeout(() => { progressContainer.style.display = 'none'; downloadBtn.disabled = false; }, 3000);
    } catch(e) {
      showError(e.message || 'Playlist download failed');
      showToast('Playlist download failed', 'error');
      progressContainer.style.display = 'none';
      downloadBtn.disabled = false;
    }
    // Restore normal download handler
    downloadBtn.onclick = null;
    downloadBtn.addEventListener('click', startDownload);
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYLIST
// ═══════════════════════════════════════════════════════════════════════════
let playlistEntries = [];

async function loadPlaylist(url) {
  try {
    const res = await fetch('/api/playlist/info', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({url}),
    });
    const data = await res.json();
    playlistEntries = data.entries || [];
    renderPlaylist();
    showToast(`📃 Playlist found: ${playlistEntries.length} videos`);
  } catch(e) { console.error('Playlist load error:', e); }
}

function renderPlaylist() {
  if (playlistEntries.length === 0) return;
  const section = $('playlistSection');
  const container = $('playlistEntries');
  container.innerHTML = '';

  playlistEntries.forEach((entry, i) => {
    const el = document.createElement('div');
    el.className = 'playlist-entry selected';
    el.innerHTML = `
      <input type="checkbox" checked data-index="${i}">
      <span class="playlist-entry-title">${entry.title}</span>
      <span class="playlist-entry-duration">${formatDuration(entry.duration)}</span>
    `;
    el.querySelector('input').addEventListener('change', (e) => {
      el.classList.toggle('selected', e.target.checked);
    });
    container.appendChild(el);
  });

  section.style.display = 'block';
}

$('selectAllPlaylist').addEventListener('click', () => {
  $('playlistEntries').querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; cb.closest('.playlist-entry').classList.add('selected'); });
});
$('deselectAllPlaylist').addEventListener('click', () => {
  $('playlistEntries').querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; cb.closest('.playlist-entry').classList.remove('selected'); });
});
$('downloadPlaylist').addEventListener('click', async () => {
  const checked = [...$('playlistEntries').querySelectorAll('input[type="checkbox"]:checked')];
  const items = checked.map(cb => {
    const entry = playlistEntries[parseInt(cb.dataset.index)];
    return { url: entry.url, formatId: 'best', title: entry.title };
  });
  if (items.length === 0) { showToast('No videos selected', 'error'); return; }
  try {
    const res = await fetch('/api/download/batch', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({items}),
    });
    const data = await res.json();
    showToast(`🚀 Started ${data.downloadIds.length} playlist downloads!`);
    switchToTab('queue');
    startQueueSSE();
  } catch(e) { showToast('Playlist download failed', 'error'); }
});

// ═══════════════════════════════════════════════════════════════════════════
// RENDER VIDEO INFO
// ═══════════════════════════════════════════════════════════════════════════
function renderVideoInfo() {
  const info = currentVideoInfo;
  const plat = detectPlatform(info.url);

  videoThumbnail.src = info.thumbnail || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" fill="%2312121a"><rect width="640" height="360"/><text x="320" y="180" text-anchor="middle" fill="%23555" font-size="24">No Thumbnail</text></svg>');
  videoThumbnail.alt = info.title;
  videoTitle.textContent = info.title;
  videoDuration.textContent = formatDuration(info.duration);
  platformBadge.innerHTML = `${plat.icon} ${plat.name}`;
  uploaderName.textContent = info.uploader;
  viewCount.textContent = formatViews(info.viewCount);

  // Subtitles
  const subBadges = $('subtitleBadges');
  const subChips = $('subtitleChips');
  if (info.subtitles && info.subtitles.length > 0) {
    subChips.innerHTML = info.subtitles.map(lang =>
      `<span class="sub-chip" data-lang="${lang}" title="Download ${lang} subtitle">${lang}</span>`
    ).join('');
    subBadges.style.display = 'block';
    subChips.querySelectorAll('.sub-chip').forEach(chip => {
      chip.addEventListener('click', () => downloadSubtitle(chip.dataset.lang));
    });
  } else {
    subBadges.style.display = 'none';
  }

  renderFormats(info.formats);
  videoSection.style.display = 'block';
  setTimeout(() => videoSection.scrollIntoView({behavior:'smooth',block:'start'}), 100);
}

function renderFormats(formats) {
  formatGrid.innerHTML = ''; selectedFormat = null; downloadBtn.disabled = true;
  formats.forEach((f, i) => {
    const opt = document.createElement('div');
    opt.className = 'format-option';
    if (f.type === 'recommended') opt.classList.add('recommended');

    const icon = f.type === 'audio' ? '🎵' : f.type === 'recommended' ? '🚀' : '🎬';
    opt.innerHTML = `
      <span class="format-type-icon">${icon}</span>
      <span class="format-label">${f.label}</span>
      <span class="format-meta">${f.format.toUpperCase()}</span>
      ${f.filesize ? `<span class="format-size">~${formatSize(f.filesize)}</span>` : ''}
    `;
    opt.addEventListener('click', () => {
      formatGrid.querySelectorAll('.format-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedFormat = f;
      downloadBtn.disabled = false;
      document.querySelector('.download-btn-text').textContent =
        f.type === 'audio' ? 'Download Audio' : `Download ${f.label}`;
    });
    formatGrid.appendChild(opt);
    opt.style.opacity = '0'; opt.style.transform = 'translateY(8px)';
    setTimeout(() => { opt.style.transition = 'all 0.3s ease'; opt.style.opacity = '1'; opt.style.transform = 'translateY(0)'; }, i * 40);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TRIM CONTROLS
// ═══════════════════════════════════════════════════════════════════════════
$('trimToggle').addEventListener('change', (e) => {
  $('trimControls').style.display = e.target.checked ? 'flex' : 'none';
});

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE CONTROLS
// ═══════════════════════════════════════════════════════════════════════════
$('scheduleToggle').addEventListener('change', (e) => {
  $('scheduleControls').style.display = e.target.checked ? 'block' : 'none';
});

// ═══════════════════════════════════════════════════════════════════════════
// DOWNLOAD (with trim + schedule support)
// ═══════════════════════════════════════════════════════════════════════════
downloadBtn.addEventListener('click', startDownload);

async function startDownload() {
  if (!currentVideoInfo || !selectedFormat) return;

  const isScheduled = $('scheduleToggle').checked;
  const scheduleTime = $('scheduleTime').value;

  if (isScheduled) {
    if (!scheduleTime) { showError('Please select a schedule time'); return; }
    await scheduleDownload(scheduleTime);
    return;
  }

  downloadBtn.disabled = true;
  progressContainer.style.display = 'block';
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
  progressStatus.textContent = 'Starting download...';
  progressSpeed.textContent = '';
  progressEta.textContent = '';

  const body = {
    url: currentVideoInfo.url,
    formatId: selectedFormat.id,
    title: currentVideoInfo.title,
  };

  // Add trim if enabled
  if ($('trimToggle').checked) {
    body.trimStart = $('trimStart').value;
    body.trimEnd = $('trimEnd').value;
  }

  try {
    const res = await fetch('/api/download/start', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    const { downloadId } = await res.json();
    trackProgress(downloadId);
  } catch(e) {
    showError(e.message || 'Download failed');
    showToast('Download failed', 'error');
    progressContainer.style.display = 'none';
    downloadBtn.disabled = false;
  }
}

function trackProgress(downloadId) {
  const es = new EventSource(`/api/progress/${downloadId}`);
  es.onmessage = (event) => {
    try {
      const d = JSON.parse(event.data);
      if (d.percent !== undefined) {
        progressFill.style.width = `${d.percent}%`;
        progressPercent.textContent = `${Math.round(d.percent)}%`;
      }
      if (d.speed) progressSpeed.textContent = `⚡ ${d.speed}`;
      if (d.eta) progressEta.textContent = `⏱️ ETA: ${d.eta}`;
      if (d.status === 'starting') progressStatus.textContent = 'Preparing...';
      else if (d.status === 'downloading') progressStatus.textContent = 'Downloading...';

      if (d.status === 'complete') {
        es.close();
        progressFill.style.width = '100%';
        progressPercent.textContent = '100%';
        progressStatus.textContent = 'Complete! Saving...';
        downloadFile(downloadId);
        addToHistory({ title: currentVideoInfo.title, url: currentVideoInfo.url, format: selectedFormat.label, date: new Date().toISOString() });
      }
      if (d.status === 'error') {
        es.close();
        showError(d.error || 'Download failed');
        showToast(d.error || 'Download failed', 'error');
        progressContainer.style.display = 'none';
        downloadBtn.disabled = false;
      }
    } catch(e) {}
  };
  es.onerror = () => {
    es.close();
    setTimeout(() => {
      if (!progressStatus.textContent.includes('Complete') && !progressStatus.textContent.includes('Saving')) {
        showToast('Connection lost', 'error');
        progressContainer.style.display = 'none';
        downloadBtn.disabled = false;
      }
    }, 1000);
  };
}

async function downloadFile(downloadId) {
  // Trigger native browser download — IDM and download managers will catch this
  const a = document.createElement('a');
  a.href = `/api/download/${downloadId}/file`;
  a.setAttribute('download', '');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  progressStatus.textContent = 'Download complete! 🎉';
  showSuccessAnimation();
  showToast('Download complete! 🎉');
  setTimeout(() => { progressContainer.style.display = 'none'; downloadBtn.disabled = false; }, 3000);
}

// ═══════════════════════════════════════════════════════════════════════════
// SUCCESS ANIMATION
// ═══════════════════════════════════════════════════════════════════════════
function showSuccessAnimation() {
  const overlay = $('successOverlay');
  overlay.style.display = 'flex';
  setTimeout(() => { overlay.style.display = 'none'; }, 2500);
  overlay.addEventListener('click', () => { overlay.style.display = 'none'; }, {once:true});
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════════
async function scheduleDownload(time) {
  try {
    const res = await fetch('/api/download/schedule', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        url: currentVideoInfo.url,
        formatId: selectedFormat.id,
        title: currentVideoInfo.title,
        scheduledAt: new Date(time).toISOString(),
      }),
    });
    const data = await res.json();
    if (data.scheduleId) {
      showToast(`⏰ Download scheduled for ${new Date(time).toLocaleString()}`);
      switchToTab('queue');
      loadScheduled();
    } else {
      throw new Error(data.error || 'Schedule failed');
    }
  } catch(e) { showToast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// THUMBNAIL DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════════
$('thumbDlBtn').addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!currentVideoInfo?.thumbnail) return;
  try {
    const res = await fetch('/api/download/thumbnail', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        thumbnailUrl: currentVideoInfo.thumbnail,
        title: currentVideoInfo.title,
      }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentVideoInfo.title || 'thumbnail'}.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('🖼️ Thumbnail downloaded!');
  } catch(e) { showToast('Failed to download thumbnail', 'error'); }
});

// ═══════════════════════════════════════════════════════════════════════════
// SUBTITLE DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════════
async function downloadSubtitle(lang) {
  if (!currentVideoInfo) return;
  try {
    showToast(`📝 Downloading ${lang} subtitle...`);
    const res = await fetch('/api/download/subtitle', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ url: currentVideoInfo.url, lang, title: currentVideoInfo.title }),
    });
    if (!res.ok) throw new Error('Not found');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentVideoInfo.title}.${lang}.srt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`✅ ${lang.toUpperCase()} subtitle downloaded!`);
  } catch(e) { showToast(`Subtitle ${lang} not available`, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO PREVIEW
// ═══════════════════════════════════════════════════════════════════════════
$('thumbnailContainer').addEventListener('click', () => {
  if (!currentVideoInfo?.url) return;
  const player = $('previewPlayer');
  const video = $('previewVideo');
  if (player.style.display === 'none' || !player.style.display) {
    // Try to use the video URL for preview (works for some platforms)
    video.src = currentVideoInfo.url;
    player.style.display = 'block';
    video.play().catch(() => {
      // If direct play fails, hide preview
      player.style.display = 'none';
      showToast('Preview not available for this platform', 'error');
    });
  } else {
    video.pause();
    video.src = '';
    player.style.display = 'none';
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE (SSE for all downloads)
// ═══════════════════════════════════════════════════════════════════════════
function startQueueSSE() {
  if (queueSSE) queueSSE.close();
  queueSSE = new EventSource('/api/progress/all/stream');
  queueSSE.onmessage = (event) => {
    try {
      activeDownloads = JSON.parse(event.data);
      renderQueue();
    } catch(e) {}
  };
}

function renderQueue() {
  const entries = Object.entries(activeDownloads);
  const active = entries.filter(([_,d]) => d.status !== 'complete' && d.status !== 'error' && d.status !== 'cancelled');
  const completed = entries.filter(([_,d]) => d.status === 'complete');
  const errored = entries.filter(([_,d]) => d.status === 'error' || d.status === 'cancelled');

  // Update badge
  if (active.length > 0) {
    queueBadge.style.display = 'inline-flex';
    queueBadge.textContent = active.length;
  } else {
    queueBadge.style.display = 'none';
  }

  queueSubtitle.textContent = entries.length === 0
    ? 'No active downloads — downloads continue even if you close this page!'
    : `${active.length} downloading, ${completed.length} complete, ${errored.length} failed`;

  queueList.innerHTML = '';

  // Background download notice
  if (entries.length > 0) {
    const notice = document.createElement('div');
    notice.className = 'queue-notice';
    notice.innerHTML = `💡 <strong>Downloads run on the server</strong> — you can close this tab and come back later to save your files!`;
    queueList.appendChild(notice);
  }

  // Clear completed button
  if (completed.length + errored.length > 0) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'pill-btn secondary clear-completed-btn';
    clearBtn.textContent = `🗑️ Clear ${completed.length + errored.length} finished`;
    clearBtn.addEventListener('click', clearCompleted);
    queueList.appendChild(clearBtn);
  }

  entries.forEach(([id, dl]) => {
    const isActive = dl.status === 'downloading' || dl.status === 'starting';
    const isComplete = dl.status === 'complete';
    const isError = dl.status === 'error' || dl.status === 'cancelled';
    const icon = isComplete ? '✅' : isError ? '❌' : dl.status === 'downloading' ? '⬇️' : '⏳';

    const item = document.createElement('div');
    item.className = `queue-item ${isComplete ? 'complete' : ''} ${isError ? 'failed' : ''}`;
    item.innerHTML = `
      <span class="queue-item-icon">${icon}</span>
      <div class="queue-item-info">
        <div class="queue-item-title">${dl.title || 'Unknown'}</div>
        <div class="queue-item-status">${dl.status}${dl.speed ? ' • '+dl.speed : ''}${dl.eta ? ' • ETA '+dl.eta : ''}${dl.fileSize ? ' • '+formatSize(dl.fileSize) : ''}</div>
      </div>
      <div class="queue-item-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${dl.percent||0}%"></div></div>
        <div class="queue-item-percent">${Math.round(dl.percent||0)}%</div>
      </div>
      <div class="queue-item-actions">
        ${isComplete ? `<button class="pill-btn save-btn" onclick="window.open('/api/download/${id}/file')">💾 Save</button>` : ''}
        ${isActive ? `<button class="pill-btn danger cancel-btn" onclick="cancelDownload('${id}')">✕ Cancel</button>` : ''}
        ${isComplete || isError ? `<button class="pill-btn secondary delete-btn" onclick="deleteDownload('${id}')">🗑️</button>` : ''}
      </div>
    `;
    queueList.appendChild(item);
  });

  loadScheduled();
}

async function loadScheduled() {
  try {
    const res = await fetch('/api/download/scheduled');
    const data = await res.json();
    const section = $('scheduledSection');
    const list = $('scheduledList');
    if (data.scheduled && data.scheduled.length > 0) {
      section.style.display = 'block';
      list.innerHTML = data.scheduled.map(s => `
        <div class="scheduled-item">
          <div class="scheduled-info">
            <div class="scheduled-title">${s.title || s.url}</div>
            <div class="scheduled-time">⏰ ${new Date(s.scheduledAt).toLocaleString()} • ${s.status}</div>
          </div>
          <button class="scheduled-cancel" onclick="cancelScheduled('${s.id}')">Cancel</button>
        </div>
      `).join('');
    } else {
      section.style.display = 'none';
    }
  } catch(e) {}
}

window.cancelScheduled = async function(id) {
  try {
    await fetch(`/api/download/schedule/${id}`, {method:'DELETE'});
    showToast('Schedule cancelled');
    loadScheduled();
  } catch(e) { showToast('Failed to cancel', 'error'); }
};

window.cancelDownload = async function(id) {
  try {
    await fetch(`/api/download/${id}/cancel`, {method:'DELETE'});
    showToast('⏹️ Download cancelled');
  } catch(e) { showToast('Failed to cancel', 'error'); }
};

window.deleteDownload = async function(id) {
  try {
    await fetch(`/api/download/${id}`, {method:'DELETE'});
    showToast('🗑️ Removed');
  } catch(e) { showToast('Failed to remove', 'error'); }
};

async function clearCompleted() {
  try {
    const res = await fetch('/api/downloads/completed', {method:'DELETE'});
    const data = await res.json();
    showToast(`🗑️ Cleared ${data.cleared} items`);
  } catch(e) { showToast('Failed to clear', 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY (localStorage)
// ═══════════════════════════════════════════════════════════════════════════
function getHistory() {
  try { return JSON.parse(localStorage.getItem('hulk-history') || '[]'); } catch(e) { return []; }
}
function saveHistory(history) {
  localStorage.setItem('hulk-history', JSON.stringify(history.slice(0, 100)));
}
function addToHistory(entry) {
  const history = getHistory();
  history.unshift(entry);
  saveHistory(history);
}
function renderHistory() {
  const history = getHistory();
  historySubtitle.textContent = history.length === 0 ? 'No download history yet' : `${history.length} downloads`;
  historyList.innerHTML = '';

  history.forEach((item, i) => {
    const plat = detectPlatform(item.url);
    const el = document.createElement('div');
    el.className = 'history-item';
    el.innerHTML = `
      <span class="history-item-icon">${plat.icon}</span>
      <div class="history-item-info">
        <div class="history-item-title">${item.title}</div>
        <div class="history-item-meta">${plat.name} • ${item.format || 'Best'} • ${new Date(item.date).toLocaleDateString()}</div>
      </div>
      <div class="history-item-actions">
        <button class="pill-btn secondary" onclick="redownload(${i})">↻</button>
      </div>
    `;
    historyList.appendChild(el);
  });
}

window.redownload = function(index) {
  const history = getHistory();
  const item = history[index];
  if (item) {
    urlInput.value = item.url;
    switchToTab('download');
    fetchVideoInfo();
  }
};

$('clearHistory').addEventListener('click', () => {
  localStorage.removeItem('hulk-history');
  renderHistory();
  showToast('History cleared');
});

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORMS
// ═══════════════════════════════════════════════════════════════════════════
async function loadPlatforms() {
  try {
    const res = await fetch('/api/platforms');
    const data = await res.json();
    renderPlatforms(data.platforms);
  } catch(e) {
    renderPlatforms([
      {name:'YouTube',icon:'🎬',color:'#FF0000'},{name:'Instagram',icon:'📸',color:'#E1306C'},
      {name:'Facebook',icon:'👥',color:'#1877F2'},{name:'TikTok',icon:'🎵',color:'#00F2EA'},
      {name:'Twitter/X',icon:'🐦',color:'#1DA1F2'},{name:'Reddit',icon:'🔴',color:'#FF4500'},
      {name:'Vimeo',icon:'🎥',color:'#1AB7EA'},{name:'Dailymotion',icon:'📺',color:'#00AAFF'},
      {name:'Twitch',icon:'🟣',color:'#9146FF'},{name:'SoundCloud',icon:'🎧',color:'#FF5500'},
    ]);
  }
}

function renderPlatforms(platforms) {
  platformsGrid.innerHTML = '';
  platforms.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'platform-card';
    card.innerHTML = `<span class="platform-icon">${p.icon}</span><span class="platform-name">${p.name}</span>`;
    card.addEventListener('mouseenter', () => { card.style.boxShadow = `0 0 20px ${p.color}20`; card.style.borderColor = `${p.color}40`; });
    card.addEventListener('mouseleave', () => { card.style.boxShadow = ''; card.style.borderColor = ''; });
    platformsGrid.appendChild(card);
    card.style.opacity = '0'; card.style.transform = 'translateY(16px)';
    setTimeout(() => { card.style.transition = 'all 0.4s ease'; card.style.opacity = '1'; card.style.transform = 'translateY(0)'; }, i * 60);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SCROLL ANIMATIONS
// ═══════════════════════════════════════════════════════════════════════════
function initScrollAnimations() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; } });
  }, {threshold: 0.1});
  document.querySelectorAll('.feature-card').forEach((card, i) => {
    card.style.opacity = '0'; card.style.transform = 'translateY(24px)';
    card.style.transition = `all 0.5s ease ${i*0.1}s`;
    obs.observe(card);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function switchToTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  $('panel' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
}

window.addEventListener('scroll', () => {
  const nav = $('navbar');
  nav.style.background = window.scrollY > 20
    ? (document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(10,10,15,0.9)' : 'rgba(245,245,250,0.95)')
    : '';
});

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadPlatforms();
  initScrollAnimations();
  renderHistory();
  setTimeout(() => urlInput.focus(), 500);
});
