const express = require('express');
const cors = require('cors');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const contentDisposition = require('content-disposition');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── yt-dlp binary management ───────────────────────────────────────────────
const BIN_DIR = path.join(__dirname, 'bin');
const YTDLP_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const TMP_DIR = path.join(os.tmpdir(), 'download-hulk');

// Active downloads map
const downloads = new Map();
// Scheduled downloads
const scheduledDownloads = new Map();

// Ensure tmp dir
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (urlStr) => {
      const client = urlStr.startsWith('https') ? https : http;
      client.get(urlStr, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          request(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', reject);
    };
    request(url);
  });
}

async function ensureYtDlp() {
  if (fs.existsSync(YTDLP_PATH)) {
    console.log('✅ yt-dlp binary found');
    return;
  }
  console.log('📥 Downloading yt-dlp binary...');
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
  const platform = process.platform;
  let url;
  if (platform === 'win32') url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
  else if (platform === 'darwin') url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
  else url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
  await downloadFile(url, YTDLP_PATH);
  if (platform !== 'win32') fs.chmodSync(YTDLP_PATH, '755');
  console.log('✅ yt-dlp downloaded successfully');
}

// ─── Helper: run yt-dlp command ─────────────────────────────────────────────
function runYtDlp(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP_PATH, args, { maxBuffer: 1024 * 1024 * 50, timeout }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}

// ─── Parse progress from yt-dlp output ──────────────────────────────────────
function parseYtDlpProgress(line, progress) {
  if (!progress) return;
  const percentMatch = line.match(/(\d+\.?\d*)%/);
  if (percentMatch) {
    progress.percent = parseFloat(percentMatch[1]);
    progress.status = 'downloading';
  }
  const speedMatch = line.match(/([\d.]+\s*\w+\/s)/i);
  if (speedMatch) progress.speed = speedMatch[1];
  const etaMatch = line.match(/ETA\s+(\S+)/);
  if (etaMatch) progress.eta = etaMatch[1];
}

// ─── Start a single download (core function) ───────────────────────────────
function startSingleDownload({ url, formatId, title, trimStart, trimEnd, subtitleLang, downloadId }) {
  const id = downloadId || uuidv4();
  const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9_\-\u0600-\u06FF ]/g, '_').substring(0, 80);
  const isAudio = formatId === 'bestaudio';
  const ext = isAudio ? 'mp3' : 'mp4';
  const tmpFile = path.join(TMP_DIR, `${safeTitle}_${id}.${ext}`);

  downloads.set(id, {
    percent: 0, speed: '', eta: '', status: 'starting',
    tmpFile, safeTitle, ext, error: null,
    url, title: title || 'Untitled', formatId,
    startedAt: Date.now(),
  });

  const dlArgs = ['--no-warnings', '--no-playlist', '--newline', '--progress', '-o', tmpFile];

  if (formatId === 'best') {
    dlArgs.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best');
    dlArgs.push('--merge-output-format', 'mp4');
  } else if (isAudio) {
    dlArgs.push('-f', 'bestaudio', '-x', '--audio-format', 'mp3');
  } else if (formatId && formatId.includes('+')) {
    dlArgs.push('-f', formatId, '--merge-output-format', 'mp4');
  } else {
    dlArgs.push('-f', formatId);
  }

  // Trimming support
  if (trimStart !== undefined && trimEnd !== undefined && trimStart !== '' && trimEnd !== '') {
    dlArgs.push('--download-sections', `*${trimStart}-${trimEnd}`);
    dlArgs.push('--force-keyframes-at-cuts');
  }

  // Subtitle support
  if (subtitleLang) {
    dlArgs.push('--write-sub', '--sub-lang', subtitleLang, '--convert-subs', 'srt');
  }

  dlArgs.push(url);
  console.log(`[${id}] Starting: ${url} (format: ${formatId})`);

  const proc = spawn(YTDLP_PATH, dlArgs);

  proc.stdout.on('data', (data) => parseYtDlpProgress(data.toString(), downloads.get(id)));
  proc.stderr.on('data', (data) => {
    parseYtDlpProgress(data.toString(), downloads.get(id));
  });

  proc.on('close', (code) => {
    const progress = downloads.get(id);
    if (!progress) return;
    if (code !== 0) {
      progress.status = 'error';
      progress.error = 'Download failed. Please try again.';
      return;
    }
    const dir = path.dirname(tmpFile);
    const baseName = path.basename(tmpFile, path.extname(tmpFile));
    const files = fs.readdirSync(dir).filter(f => f.startsWith(baseName));
    const videoFile = files.find(f => !f.endsWith('.srt') && !f.endsWith('.vtt')) || files[0];
    const actualFile = videoFile ? path.join(dir, videoFile) : tmpFile;

    if (!fs.existsSync(actualFile)) {
      progress.status = 'error';
      progress.error = 'Downloaded file not found.';
      return;
    }
    progress.percent = 100;
    progress.status = 'complete';
    progress.tmpFile = actualFile;
    progress.ext = path.extname(actualFile).slice(1) || ext;
    progress.fileSize = fs.statSync(actualFile).size;

    // Check for subtitle file
    const srtFile = files.find(f => f.endsWith('.srt') || f.endsWith('.vtt'));
    if (srtFile) progress.subtitleFile = path.join(dir, srtFile);

    console.log(`[${id}] Complete: ${actualFile} (${(progress.fileSize / 1024 / 1024).toFixed(1)} MB)`);
  });

  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Get video info (enhanced: detect playlists, subtitles, thumbnails) ──────
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    // Check if it's a playlist
    let isPlaylist = false;
    try {
      const flatOutput = await runYtDlp(['--flat-playlist', '--dump-json', '--no-warnings', url], 15000);
      const lines = flatOutput.trim().split('\n');
      if (lines.length > 1) isPlaylist = true;
    } catch (e) {}

    const output = await runYtDlp(['--dump-json', '--no-warnings', '--no-playlist', url]);
    const info = JSON.parse(output);

    // Process formats
    const formats = (info.formats || []).filter(f => f.filesize || f.filesize_approx).map(f => ({
      formatId: f.format_id, ext: f.ext,
      quality: f.format_note || f.resolution || 'unknown',
      resolution: f.resolution || (f.height ? `${f.width}x${f.height}` : null),
      height: f.height || null, fps: f.fps || null,
      filesize: f.filesize || f.filesize_approx || 0,
      vcodec: f.vcodec !== 'none' ? f.vcodec : null,
      acodec: f.acodec !== 'none' ? f.acodec : null,
      hasVideo: f.vcodec && f.vcodec !== 'none',
      hasAudio: f.acodec && f.acodec !== 'none',
      tbr: f.tbr || 0,
    }));

    const combined = formats.filter(f => f.hasVideo && f.hasAudio).sort((a, b) => (b.height || 0) - (a.height || 0));
    const videoOnly = formats.filter(f => f.hasVideo && !f.hasAudio).sort((a, b) => (b.height || 0) - (a.height || 0));

    const recommendations = [];
    recommendations.push({ id: 'best', label: 'Best Quality (Video + Audio)', quality: 'best', type: 'recommended', format: 'mp4' });

    const seenHeights = new Set();
    for (const f of combined) {
      if (f.height && !seenHeights.has(f.height)) {
        seenHeights.add(f.height);
        recommendations.push({
          id: f.formatId, label: `${f.height}p${f.fps > 30 ? f.fps : ''}`,
          quality: f.quality, type: 'video', format: f.ext,
          resolution: f.resolution, filesize: f.filesize, hasAudio: true,
        });
      }
    }
    for (const f of videoOnly) {
      if (f.height && !seenHeights.has(f.height) && f.height >= 720) {
        seenHeights.add(f.height);
        recommendations.push({
          id: f.formatId + '+bestaudio', label: `${f.height}p${f.fps > 30 ? f.fps : ''} (merge)`,
          quality: f.quality, type: 'video', format: f.ext,
          resolution: f.resolution, filesize: f.filesize, hasAudio: false,
        });
      }
    }
    recommendations.push({ id: 'bestaudio', label: 'Audio Only (Best)', quality: 'audio', type: 'audio', format: 'mp3' });

    // Get available subtitles
    let subtitles = [];
    try {
      const subOutput = await runYtDlp(['--list-subs', '--no-warnings', '--no-playlist', url], 15000);
      const subLines = subOutput.split('\n');
      for (const line of subLines) {
        const match = line.match(/^(\w{2,5})\s+/);
        if (match && !line.startsWith('[') && !line.includes('Available') && !line.includes('Language')) {
          const code = match[1];
          subtitles.push(code);
        }
      }
    } catch (e) {}

    res.json({
      title: info.title || 'Untitled',
      thumbnail: info.thumbnail || null,
      thumbnails: info.thumbnails || [],
      duration: info.duration || 0,
      uploader: info.uploader || info.channel || 'Unknown',
      viewCount: info.view_count || 0,
      platform: info.extractor_key || info.extractor || 'Unknown',
      url, formats: recommendations,
      isPlaylist, subtitles,
      description: (info.description || '').substring(0, 300),
    });
  } catch (error) {
    console.error('Info error:', error.message);
    res.status(500).json({ error: 'Failed to fetch video info. Please check the URL.' });
  }
});

// ─── Get playlist info ──────────────────────────────────────────────────────
app.post('/api/playlist/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const output = await runYtDlp([
      '--flat-playlist', '--dump-json', '--no-warnings', url
    ], 120000);

    const entries = output.trim().split('\n').map(line => {
      try {
        const entry = JSON.parse(line);
        return {
          id: entry.id,
          title: entry.title || 'Untitled',
          url: entry.url || entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`,
          duration: entry.duration || 0,
          thumbnail: entry.thumbnails?.[0]?.url || null,
        };
      } catch (e) { return null; }
    }).filter(Boolean);

    res.json({ entries, count: entries.length });
  } catch (error) {
    console.error('Playlist error:', error.message);
    res.status(500).json({ error: 'Failed to fetch playlist info.' });
  }
});

// ─── Start single download ─────────────────────────────────────────────────
app.post('/api/download/start', (req, res) => {
  const { url, formatId, title, trimStart, trimEnd, subtitleLang } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const downloadId = startSingleDownload({ url, formatId, title, trimStart, trimEnd, subtitleLang });
  res.json({ downloadId });
});

// ─── Start batch download (multiple URLs) ───────────────────────────────────
app.post('/api/download/batch', (req, res) => {
  const { items } = req.body; // [{ url, formatId, title }]
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items array is required' });
  }

  const downloadIds = items.map(item => startSingleDownload({
    url: item.url,
    formatId: item.formatId || 'best',
    title: item.title || 'video',
  }));

  res.json({ downloadIds });
});

// ─── Schedule a download ────────────────────────────────────────────────────
app.post('/api/download/schedule', (req, res) => {
  const { url, formatId, title, scheduledAt } = req.body;
  if (!url || !scheduledAt) return res.status(400).json({ error: 'URL and scheduledAt required' });

  const scheduleId = uuidv4();
  const delay = new Date(scheduledAt).getTime() - Date.now();
  if (delay < 0) return res.status(400).json({ error: 'Scheduled time must be in the future' });

  const scheduleInfo = {
    id: scheduleId, url, formatId, title, scheduledAt,
    status: 'scheduled', downloadId: null,
  };
  scheduledDownloads.set(scheduleId, scheduleInfo);

  const timer = setTimeout(() => {
    const info = scheduledDownloads.get(scheduleId);
    if (info) {
      const dlId = startSingleDownload({ url, formatId: formatId || 'best', title });
      info.downloadId = dlId;
      info.status = 'started';
    }
  }, delay);

  scheduleInfo.timer = timer;
  console.log(`[Schedule] ${scheduleId}: ${url} at ${scheduledAt} (in ${Math.round(delay / 1000)}s)`);
  res.json({ scheduleId, scheduledAt });
});

// ─── Get scheduled downloads ────────────────────────────────────────────────
app.get('/api/download/scheduled', (req, res) => {
  const list = [];
  scheduledDownloads.forEach((info, id) => {
    list.push({ id, url: info.url, title: info.title, scheduledAt: info.scheduledAt, status: info.status, downloadId: info.downloadId });
  });
  res.json({ scheduled: list });
});

// ─── Cancel scheduled download ──────────────────────────────────────────────
app.delete('/api/download/schedule/:id', (req, res) => {
  const info = scheduledDownloads.get(req.params.id);
  if (!info) return res.status(404).json({ error: 'Schedule not found' });
  if (info.timer) clearTimeout(info.timer);
  scheduledDownloads.delete(req.params.id);
  res.json({ success: true });
});

// ─── Serve completed download file ──────────────────────────────────────────
app.get('/api/download/:id/file', (req, res) => {
  const progress = downloads.get(req.params.id);
  if (!progress) return res.status(404).json({ error: 'Download not found' });
  if (progress.status !== 'complete') return res.status(400).json({ error: 'Download not ready' });

  const filePath = progress.tmpFile;
  if (!fs.existsSync(filePath)) {
    downloads.delete(req.params.id);
    return res.status(404).json({ error: 'File not found' });
  }

  const ext = progress.ext || 'mp4';
  const fileName = `${progress.safeTitle}.${ext}`;
  res.setHeader('Content-Disposition', contentDisposition(fileName));
  res.setHeader('Content-Type', ext === 'mp3' ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Length', fs.statSync(filePath).size);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('end', () => {
    setTimeout(() => {
      try { fs.unlinkSync(filePath); } catch (e) {}
      downloads.delete(req.params.id);
    }, 30000);
  });
});

// ─── Download thumbnail ─────────────────────────────────────────────────────
app.post('/api/download/thumbnail', async (req, res) => {
  const { url, thumbnailUrl, title } = req.body;
  if (!thumbnailUrl) return res.status(400).json({ error: 'Thumbnail URL required' });

  try {
    const safeTitle = (title || 'thumbnail').replace(/[^a-zA-Z0-9_\-\u0600-\u06FF ]/g, '_').substring(0, 80);
    const ext = thumbnailUrl.includes('.webp') ? 'webp' : thumbnailUrl.includes('.png') ? 'png' : 'jpg';
    const tmpFile = path.join(TMP_DIR, `${safeTitle}_thumb_${uuidv4()}.${ext}`);
    await downloadFile(thumbnailUrl, tmpFile);

    res.setHeader('Content-Disposition', contentDisposition(`${safeTitle}_thumbnail.${ext}`));
    res.setHeader('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on('end', () => { try { fs.unlinkSync(tmpFile); } catch (e) {} });
  } catch (error) {
    res.status(500).json({ error: 'Failed to download thumbnail' });
  }
});

// ─── Download subtitle ──────────────────────────────────────────────────────
app.post('/api/download/subtitle', async (req, res) => {
  const { url, lang, title } = req.body;
  if (!url || !lang) return res.status(400).json({ error: 'URL and language required' });

  try {
    const safeTitle = (title || 'subtitle').replace(/[^a-zA-Z0-9_\-\u0600-\u06FF ]/g, '_').substring(0, 80);
    const tmpFile = path.join(TMP_DIR, `${safeTitle}_${lang}_${uuidv4()}`);

    await runYtDlp([
      '--no-warnings', '--no-playlist', '--skip-download',
      '--write-sub', '--sub-lang', lang, '--convert-subs', 'srt',
      '-o', tmpFile, url
    ], 30000);

    // Find the generated subtitle file
    const dir = path.dirname(tmpFile);
    const baseName = path.basename(tmpFile);
    const files = fs.readdirSync(dir).filter(f => f.startsWith(baseName) && (f.endsWith('.srt') || f.endsWith('.vtt')));

    if (files.length === 0) return res.status(404).json({ error: 'Subtitle not found' });

    const srtFile = path.join(dir, files[0]);
    res.setHeader('Content-Disposition', contentDisposition(`${safeTitle}.${lang}.srt`));
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const stream = fs.createReadStream(srtFile);
    stream.pipe(res);
    stream.on('end', () => { try { fs.unlinkSync(srtFile); } catch (e) {} });
  } catch (error) {
    res.status(500).json({ error: 'Failed to download subtitle' });
  }
});

// ─── Single download progress via SSE ───────────────────────────────────────
app.get('/api/progress/:id', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const interval = setInterval(() => {
    const p = downloads.get(req.params.id);
    if (p) {
      res.write(`data: ${JSON.stringify({
        percent: p.percent, speed: p.speed, eta: p.eta,
        status: p.status, error: p.error || null,
      })}\n\n`);
      if (p.status === 'complete' || p.status === 'error') {
        clearInterval(interval);
        res.end();
      }
    } else {
      res.write(`data: ${JSON.stringify({ status: 'error', error: 'Download not found' })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 500);
  req.on('close', () => clearInterval(interval));
});

// ─── All active downloads progress via SSE ──────────────────────────────────
app.get('/api/progress/all/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const interval = setInterval(() => {
    const all = {};
    downloads.forEach((p, id) => {
      all[id] = {
        percent: p.percent, speed: p.speed, eta: p.eta,
        status: p.status, error: p.error, title: p.title,
        fileSize: p.fileSize || 0,
      };
    });
    res.write(`data: ${JSON.stringify(all)}\n\n`);
  }, 800);
  req.on('close', () => clearInterval(interval));
});

// ─── Platforms list ─────────────────────────────────────────────────────────
app.get('/api/platforms', (req, res) => {
  res.json({
    platforms: [
      { name: 'YouTube', icon: '🎬', color: '#FF0000' },
      { name: 'Instagram', icon: '📸', color: '#E1306C' },
      { name: 'Facebook', icon: '👥', color: '#1877F2' },
      { name: 'TikTok', icon: '🎵', color: '#00F2EA' },
      { name: 'Twitter/X', icon: '🐦', color: '#1DA1F2' },
      { name: 'Reddit', icon: '🔴', color: '#FF4500' },
      { name: 'Vimeo', icon: '🎥', color: '#1AB7EA' },
      { name: 'Dailymotion', icon: '📺', color: '#00AAFF' },
      { name: 'Twitch', icon: '🟣', color: '#9146FF' },
      { name: 'SoundCloud', icon: '🎧', color: '#FF5500' },
    ]
  });
});

// ─── Start server ───────────────────────────────────────────────────────────
async function start() {
  try {
    await ensureYtDlp();
    app.listen(PORT, () => {
      console.log(`\n🚀 Download Hulk is running at http://localhost:${PORT}\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start:', error.message);
    console.log(`\n💡 Download yt-dlp manually: https://github.com/yt-dlp/yt-dlp/releases/latest`);
    console.log(`   Place it in: ${BIN_DIR}\n`);
    process.exit(1);
  }
}

start();
