// Content script: adds a floating "Download" button on supported video platforms
(function() {
  'use strict';

  // Don't inject on the Download Hulk app itself
  if (window.location.hostname === 'localhost') return;

  let button = null;

  function createButton() {
    if (button) return;
    button = document.createElement('div');
    button.id = 'hulk-download-btn';
    button.innerHTML = '⬇️ Hulk';
    document.body.appendChild(button);

    button.addEventListener('click', async () => {
      const serverUrl = 'http://localhost:4000';
      const url = window.location.href;

      button.innerHTML = '⏳';
      button.style.pointerEvents = 'none';

      try {
        const response = await fetch(`${serverUrl}/api/download/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, formatId: 'best', title: document.title }),
        });

        if (response.ok) {
          button.innerHTML = '✅';
          button.style.background = 'linear-gradient(135deg, #10b981, #06b6d4)';
          setTimeout(() => resetButton(), 3000);
        } else {
          button.innerHTML = '❌';
          setTimeout(() => resetButton(), 2000);
        }
      } catch (e) {
        button.innerHTML = '❌';
        button.title = 'Server not running';
        setTimeout(() => resetButton(), 2000);
      }
    });
  }

  function resetButton() {
    if (!button) return;
    button.innerHTML = '⬇️ Hulk';
    button.style.pointerEvents = 'auto';
    button.style.background = 'linear-gradient(135deg, #a855f7, #7c3aed)';
  }

  // Create button after page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createButton);
  } else {
    createButton();
  }
})();
