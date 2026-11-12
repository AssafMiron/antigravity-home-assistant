/**
 * Antigravity Terminal for Home Assistant — Web Terminal Helper
 *
 * Fixes three critical browser/terminal limitations in Home Assistant Ingress:
 * 1. Reconstructs multi-line hard-wrapped URLs (such as 600+ char Google OAuth URLs
 *    rendered by `agy`'s TUI) so clicking ANY line of the URL opens the full, unbroken link.
 * 2. Enables reliable clipboard copying over non-HTTPS origins (e.g. http://homeassistant.local:8123)
 *    where browsers disable `navigator.clipboard`, and unwraps multi-line URLs on copy.
 * 3. Displays a one-click "Open Sign-In Link / Copy Link / Paste Auth Code" floating helper bar
 *    whenever an OAuth prompt is active in the terminal.
 */
(function () {
  'use strict';

  let lastKnownOAuthUrl = '';
  let lastOpenedTime = 0;
  let bannerDismissedForUrl = '';
  let cachedWrappedUrls = [];

  // ---------------------------------------------------------------------------
  // 1. Universal Clipboard (works on HTTP http://homeassistant.local:8123 & HTTPS)
  // ---------------------------------------------------------------------------
  function unwrapIfMultilineUrl(text) {
    if (!text) return text;
    const trimmed = text.trim();
    if (!/^https?:\/\//i.test(trimmed)) return text;
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.replace(/^[\s│┃║|]+/, '').replace(/[\s│┃║|]+$/, ''));
    if (lines.length > 1 && lines.every((l) => l.length > 0 && !/\s/.test(l))) {
      return lines.join('');
    }
    return text;
  }

  function execCopyFallback(text) {
    const activeEl = document.activeElement;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_) {
      ok = false;
    }
    document.body.removeChild(ta);
    if (activeEl && typeof activeEl.focus === 'function') {
      try {
        activeEl.focus();
      } catch (_) {}
    }
    return ok;
  }

  function showToast(message) {
    let toast = document.getElementById('agy-copy-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'agy-copy-toast';
      toast.style.cssText = [
        'position:fixed',
        'bottom:16px',
        'right:16px',
        'z-index:99999',
        'background:#1a73e8',
        'color:#ffffff',
        'padding:6px 12px',
        'border-radius:6px',
        'font-family:system-ui,-apple-system,sans-serif',
        'font-size:12px',
        'font-weight:600',
        'box-shadow:0 4px 12px rgba(0,0,0,0.35)',
        'pointer-events:none',
        'transition:opacity 0.2s ease',
        'opacity:0',
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.style.opacity = '0';
    }, 1800);
  }

  function copyToClipboard(rawText, notify) {
    if (!rawText) return Promise.resolve(false);
    const text = unwrapIfMultilineUrl(rawText);
    const shouldNotify = notify !== false;

    const ok = execCopyFallback(text);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard
        .writeText(text)
        .then(() => {
          if (shouldNotify) showToast('✓ Copied to clipboard');
          return true;
        })
        .catch(() => {
          if (ok && shouldNotify) showToast('✓ Copied to clipboard');
          return ok;
        });
    }
    if (ok && shouldNotify) showToast('✓ Copied to clipboard');
    return Promise.resolve(ok);
  }

  // Polyfill navigator.clipboard.writeText on plain HTTP (e.g. http://homeassistant.local:8123)
  try {
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (t) => copyToClipboard(t, false),
        },
      });
    } else if (typeof navigator.clipboard.writeText !== 'function') {
      navigator.clipboard.writeText = (t) => copyToClipboard(t, false);
    }
  } catch (_) {}

  // ---------------------------------------------------------------------------
  // 2. Multi-Line Wrapped URL Scanner (for Ink TUI / tmux hard-wrapped URLs)
  // ---------------------------------------------------------------------------
  const URL_CONT_REGEX = /^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/;

  function cleanTerminalRow(str) {
    if (!str) return '';
    return str.replace(/^[\s│┃║|]+/, '').replace(/[\s│┃║|]+$/, '');
  }

  function scanBufferForWrappedUrls(term) {
    const results = [];
    if (!term || !term.buffer || !term.buffer.active) return results;
    const buf = term.buffer.active;
    const totalLines = buf.length;
    const startScan = Math.max(0, totalLines - 150);

    for (let r = startScan; r < totalLines; r++) {
      const lineObj = buf.getLine(r);
      if (!lineObj) continue;
      const raw = lineObj.translateToString(true);
      const cleaned = cleanTerminalRow(raw);
      const match = cleaned.match(/https?:\/\/[^\s"'<>]+/i);
      if (!match) continue;

      const urlStartPart = match[0];
      const endsAtLineEnd = cleaned.endsWith(urlStartPart);
      const parts = [urlStartPart];
      let endRow = r;

      if (endsAtLineEnd) {
        for (let nextR = r + 1; nextR < Math.min(totalLines, r + 15); nextR++) {
          const nextLineObj = buf.getLine(nextR);
          if (!nextLineObj) break;
          const nextRaw = nextLineObj.translateToString(true);
          const nextClean = cleanTerminalRow(nextRaw);
          if (
            nextClean.length > 0 &&
            !/\s/.test(nextClean) &&
            URL_CONT_REGEX.test(nextClean) &&
            !/^https?:\/\//i.test(nextClean)
          ) {
            parts.push(nextClean);
            endRow = nextR;
          } else {
            break;
          }
        }
      }

      const fullUrl = parts.join('');
      results.push({
        fullUrl,
        firstLineUrl: urlStartPart,
        startRow: r,
        endRow,
      });

      r = endRow;
    }

    cachedWrappedUrls = results;
    return results;
  }

  function resolveFullUrl(candidateUrl) {
    if (!candidateUrl || typeof candidateUrl !== 'string') return candidateUrl;
    const trimmed = candidateUrl.trim();

    if (lastKnownOAuthUrl && lastKnownOAuthUrl.startsWith(trimmed)) {
      return lastKnownOAuthUrl;
    }

    const term = window.term;
    const wrappedList = term ? scanBufferForWrappedUrls(term) : cachedWrappedUrls;
    for (const item of wrappedList) {
      if (
        item.fullUrl.startsWith(trimmed) ||
        item.firstLineUrl === trimmed ||
        item.fullUrl.includes(trimmed)
      ) {
        return item.fullUrl;
      }
    }
    return trimmed;
  }

  function openUrlSafely(url) {
    const now = Date.now();
    if (now - lastOpenedTime < 600) return;
    lastOpenedTime = now;
    const fullUrl = resolveFullUrl(url);
    const a = document.createElement('a');
    a.href = fullUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Intercept window.open (including @xterm/addon-web-links `win = window.open(); win.location.href = uri`)
  const origWindowOpen = window.open ? window.open.bind(window) : null;
  if (origWindowOpen) {
    window.open = function (url, target, features) {
      if (url && typeof url === 'string') {
        const fullUrl = resolveFullUrl(url);
        const now = Date.now();
        if (now - lastOpenedTime < 600) return null;
        lastOpenedTime = now;
        return origWindowOpen(fullUrl, target || '_blank', features);
      }

      const win = origWindowOpen('', target || '_blank', features);
      if (!win) return win;

      try {
        const locProxy = new Proxy(win.location, {
          set(obj, prop, value) {
            if (prop === 'href') {
              const fullUrl = resolveFullUrl(value);
              lastOpenedTime = Date.now();
              obj.href = fullUrl;
              return true;
            }
            obj[prop] = value;
            return true;
          },
          get(obj, prop) {
            const val = obj[prop];
            return typeof val === 'function' ? val.bind(obj) : val;
          },
        });

        return new Proxy(win, {
          get(obj, prop) {
            if (prop === 'location') return locProxy;
            const val = obj[prop];
            return typeof val === 'function' ? val.bind(obj) : val;
          },
          set(obj, prop, value) {
            obj[prop] = value;
            return true;
          },
        });
      } catch (_) {
        return win;
      }
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Floating OAuth Helper Banner (Open Link, Copy Link, Paste Auth Code)
  // ---------------------------------------------------------------------------
  function ensureOAuthBanner() {
    let banner = document.getElementById('agy-oauth-banner');
    if (banner) return banner;

    banner = document.createElement('div');
    banner.id = 'agy-oauth-banner';
    banner.style.cssText = [
      'position:fixed',
      'top:10px',
      'right:14px',
      'z-index:99998',
      'background:#161b22',
      'border:1px solid #30363d',
      'border-left:4px solid #58a6ff',
      'color:#e6edf3',
      'padding:10px 14px',
      'border-radius:8px',
      'font-family:system-ui,-apple-system,sans-serif',
      'font-size:13px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
      'display:none',
      'flex-direction:column',
      'gap:8px',
      'max-width:460px',
    ].join(';');

    banner.innerHTML = [
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">',
      '  <span style="font-weight:600;color:#58a6ff;">🔑 Google Sign-In Detected</span>',
      '  <div style="display:flex;align-items:center;gap:6px;">',
      '    <a id="agy-oauth-open-btn" href="#" target="_blank" rel="noopener noreferrer" style="background:#238636;color:#fff;text-decoration:none;padding:5px 10px;border-radius:5px;font-weight:600;font-size:12px;">↗ Open Sign-In Link</a>',
      '    <button id="agy-oauth-copy-btn" type="button" style="background:#21262d;color:#e6edf3;border:1px solid #30363d;padding:5px 10px;border-radius:5px;cursor:pointer;font-weight:600;font-size:12px;">📋 Copy Link</button>',
      '    <button id="agy-oauth-close-btn" type="button" title="Dismiss" style="background:transparent;color:#8b949e;border:none;cursor:pointer;font-size:15px;padding:0 4px;">✕</button>',
      '  </div>',
      '</div>',
      '<div style="display:flex;align-items:center;gap:6px;">',
      '  <input id="agy-oauth-code-input" type="text" placeholder="Paste authorization code here..." style="flex:1;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:5px;padding:5px 8px;font-size:12px;font-family:monospace;" />',
      '  <button id="agy-oauth-submit-btn" type="button" style="background:#1f6feb;color:#fff;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-weight:600;font-size:12px;">Submit Code</button>',
      '</div>',
    ].join('');

    document.body.appendChild(banner);

    const openBtn = document.getElementById('agy-oauth-open-btn');
    const copyBtn = document.getElementById('agy-oauth-copy-btn');
    const closeBtn = document.getElementById('agy-oauth-close-btn');
    const codeInput = document.getElementById('agy-oauth-code-input');
    const submitBtn = document.getElementById('agy-oauth-submit-btn');

    openBtn.addEventListener('click', () => {
      lastOpenedTime = Date.now();
    });

    copyBtn.addEventListener('click', () => {
      if (lastKnownOAuthUrl) {
        copyToClipboard(lastKnownOAuthUrl, true);
      }
    });

    closeBtn.addEventListener('click', () => {
      bannerDismissedForUrl = lastKnownOAuthUrl;
      banner.style.display = 'none';
    });

    function submitAuthCode() {
      const code = (codeInput.value || '').trim();
      if (!code || !window.term) return;
      if (typeof window.term.paste === 'function') {
        window.term.paste(code);
      }
      setTimeout(() => {
        const ta = document.querySelector('.xterm-helper-textarea');
        if (ta) {
          ta.focus();
          ta.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
            })
          );
          ta.dispatchEvent(
            new KeyboardEvent('keypress', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              charCode: 13,
              bubbles: true,
              cancelable: true,
            })
          );
        }
      }, 60);
      codeInput.value = '';
      showToast('✓ Authorization code sent');
    }

    submitBtn.addEventListener('click', submitAuthCode);
    codeInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        submitAuthCode();
      }
    });
    codeInput.addEventListener('paste', (e) => {
      e.stopPropagation();
    });

    return banner;
  }

  function updateOAuthBanner(oauthUrl, isVisibleOnScreen) {
    const banner = ensureOAuthBanner();
    const openBtn = document.getElementById('agy-oauth-open-btn');
    if (oauthUrl) {
      lastKnownOAuthUrl = oauthUrl;
      if (openBtn) {
        openBtn.href = oauthUrl;
      }
    }
    if (oauthUrl && isVisibleOnScreen && bannerDismissedForUrl !== oauthUrl) {
      banner.style.display = 'flex';
    } else if (!isVisibleOnScreen) {
      banner.style.display = 'none';
    }
  }

  function checkScreenForOAuthPrompt(term) {
    const wrapped = scanBufferForWrappedUrls(term);
    let foundOAuth = '';
    for (const item of wrapped) {
      if (
        item.fullUrl.includes('accounts.google.com/o/oauth2') ||
        item.fullUrl.includes('antigravity.google/oauth') ||
        item.fullUrl.includes('client_id=')
      ) {
        foundOAuth = item.fullUrl;
        break;
      }
    }
    if (foundOAuth) {
      updateOAuthBanner(foundOAuth, true);
    } else {
      updateOAuthBanner(lastKnownOAuthUrl, false);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Attach to `window.term` (xterm.js instance exposed by ttyd)
  // ---------------------------------------------------------------------------
  function attachToTerm(term) {
    if (term._agyHelperAttached) return;
    term._agyHelperAttached = true;

    // 4a. Copy-on-select + unwrap multi-line URLs automatically
    if (typeof term.onSelectionChange === 'function') {
      term.onSelectionChange(() => {
        try {
          const sel = term.getSelection();
          if (sel && sel.trim().length > 0) {
            copyToClipboard(sel, true);
          }
        } catch (_) {}
      });
    }

    // 4b. Keyboard copy shortcuts (Cmd+C, Ctrl+Shift+C, or Ctrl+C when text is selected)
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.target && e.target.id === 'agy-oauth-code-input') return;
        const hasSel = typeof term.hasSelection === 'function' && term.hasSelection();
        if (!hasSel) return;

        const isCmdC = (e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C');
        if (isCmdC) {
          const sel = term.getSelection();
          if (sel) {
            copyToClipboard(sel, true);
            if (e.ctrlKey && !e.shiftKey && !e.metaKey) {
              // Prevent sending SIGINT (^C) when user pressed Ctrl+C to copy selected text
              e.preventDefault();
              e.stopPropagation();
              term.clearSelection();
            }
          }
        }
      },
      true
    );

    // 4c. Register custom OSC 777 handler for `/usr/local/bin/xdg-open` URL broadcasts
    if (term.parser && typeof term.parser.registerOscHandler === 'function') {
      term.parser.registerOscHandler(777, (data) => {
        try {
          if (typeof data === 'string' && data.startsWith('agy-url-b64;')) {
            const b64 = data.slice('agy-url-b64;'.length).trim();
            const decodedUrl = atob(b64);
            if (decodedUrl && /^https?:\/\//i.test(decodedUrl)) {
              lastKnownOAuthUrl = decodedUrl;
              bannerDismissedForUrl = '';
              updateOAuthBanner(decodedUrl, true);
              copyToClipboard(decodedUrl, false);
            }
          }
        } catch (_) {}
        return true;
      });
    }

    // 4d. Register Link Provider so ALL lines (1..N) of a wrapped URL are clickable
    if (typeof term.registerLinkProvider === 'function') {
      term.registerLinkProvider({
        provideLinks(bufferLineNumber, callback) {
          try {
            const row = bufferLineNumber - 1;
            const wrappedList = scanBufferForWrappedUrls(term);
            const links = [];

            for (const item of wrappedList) {
              if (row >= item.startRow && row <= item.endRow && item.endRow > item.startRow) {
                const lineObj = term.buffer.active.getLine(row);
                if (!lineObj) continue;
                const lineStr = lineObj.translateToString(true);
                const trimmed = lineStr.trim();
                if (!trimmed) continue;
                const startCol = lineStr.indexOf(trimmed) + 1;
                const endCol = startCol + trimmed.length - 1;

                links.push({
                  range: {
                    start: { x: startCol, y: bufferLineNumber },
                    end: { x: endCol, y: bufferLineNumber },
                  },
                  text: item.fullUrl,
                  activate(_event, text) {
                    openUrlSafely(text);
                  },
                });
              }
            }
            callback(links);
          } catch (_) {
            callback([]);
          }
        },
      });
    }

    // 4e. Periodically & on-render scan terminal screen for OAuth URLs
    if (typeof term.onRender === 'function') {
      let scanDebounce = null;
      term.onRender(() => {
        clearTimeout(scanDebounce);
        scanDebounce = setTimeout(() => checkScreenForOAuthPrompt(term), 250);
      });
    }
    setInterval(() => checkScreenForOAuthPrompt(term), 1500);
  }

  const pollTimer = setInterval(() => {
    const term =
      window.term ||
      (document.querySelector('.xterm-helper-textarea') &&
        document.querySelector('.xterm-helper-textarea').__xtermTerminal);
    if (term) {
      clearInterval(pollTimer);
      attachToTerm(term);
    }
  }, 150);
})();
