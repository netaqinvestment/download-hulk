// Extension popup logic
const serverUrlInput = document.getElementById('serverUrl');
const currentUrlDiv = document.getElementById('currentUrl');
const sendBtn = document.getElementById('sendBtn');
const openApp = document.getElementById('openApp');
const statusDiv = document.getElementById('status');

// Load saved server URL
chrome.storage?.local?.get(['serverUrl'], (result) => {
  if (result.serverUrl) serverUrlInput.value = result.serverUrl;
});

serverUrlInput.addEventListener('change', () => {
  chrome.storage?.local?.set({ serverUrl: serverUrlInput.value });
  openApp.href = serverUrlInput.value;
});

// Get current tab URL
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]?.url) {
    currentUrlDiv.textContent = tabs[0].url;
    currentUrlDiv.classList.add('has-url');
  } else {
    currentUrlDiv.textContent = 'No URL detected';
  }
});

// Send to Download Hulk
sendBtn.addEventListener('click', async () => {
  const serverUrl = serverUrlInput.value.replace(/\/$/, '');

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url;

  if (!url) {
    showStatus('No URL detected', 'error');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';

  try {
    const response = await fetch(`${serverUrl}/api/download/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formatId: 'best', title: '' }),
    });

    if (response.ok) {
      showStatus('✅ Download started! Check Download Hulk.', 'success');
    } else {
      const data = await response.json();
      showStatus(`❌ ${data.error || 'Failed'}`, 'error');
    }
  } catch (e) {
    showStatus('❌ Cannot connect to server. Is it running?', 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send to Download Hulk';
  }
});

function showStatus(msg, type) {
  statusDiv.textContent = msg;
  statusDiv.style.color = type === 'error' ? '#ef4444' : '#10b981';
  statusDiv.classList.add('visible');
  setTimeout(() => statusDiv.classList.remove('visible'), 4000);
}
