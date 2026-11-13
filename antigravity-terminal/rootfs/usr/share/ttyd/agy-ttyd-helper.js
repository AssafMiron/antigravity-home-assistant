/**
 * Antigravity Terminal for Home Assistant — Web Terminal Helper
 *
 * Keeps ttyd's built-in page thin and dependency-free while fixing two
 * browser terminal limitations in Home Assistant Ingress:
 * 1. Reconstructs multi-line hard-wrapped URLs (such as 400+ char Google OAuth URLs
 *    rendered by `agy`'s TUI) on demand so clicking ANY line of the wrapped URL in
 *    the terminal opens the complete, unbroken URL.
 * 2. Handles OSC 52 clipboard writes from tmux / CLI tools (and explicit Cmd+C /
 *    Ctrl+Shift+C copy shortcuts) without stealing focus from the terminal,
 *    with a plain-HTTP fallback and multi-line URL unwrapping.
 */
(function () {
  'use strict';

  const OSC52_MAX = 1000000;
  const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  const URL_CONT_REGEX = /^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/;

  let lastOpenedTime = 0;
  let cachedWrappedUrls = [];

  // ---------------------------------------------------------------------------
  // 1. Multi-Line Wrapped URL Scanner (on-demand when hovering/clicking links)
  // ---------------------------------------------------------------------------
  function cleanTerminalRow(str) {
    if (!str) return '';
    return str
      .replace(/^[\s│┃║|╭╮╯╰┌┐└┘├┤┬┴┼─━]+/, '')
      .replace(/[\s│┃║|╭╮╯╰┌┐└┘├┤┬┴┼─━]+$/, '');
  }

  function unwrapIfMultilineUrl(text) {
    if (!text) return text;
    const trimmed = text.trim();
    if (!/^https?:\/\//i.test(trimmed)) return text;
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => cleanTerminalRow(l));
    if (lines.length > 1 && lines.every((l) => l.length > 0 && !/\s/.test(l))) {
      return lines.join('');
    }
    return text;
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
      const match = cleaned.match(/https?:\/\/[^\s"'<>│┃║|]+/i);
      if (!match) continue;

      const urlStartPart = match[0];
      const endsAtLineEnd = cleaned.endsWith(urlStartPart);
      const parts = [urlStartPart];
      let endRow = r;

      if (endsAtLineEnd && urlStartPart.length >= 30) {
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
            if (nextClean.length < 30) {
              break;
            }
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

  // Intercept window.open so ttyd's built-in @xterm/addon-web-links
  // (`const newWindow = window.open(); newWindow.opener = null; newWindow.location.href = uri;`)
  // opens the full unwrapped URL without creating an about:blank tab or a Window Proxy.
  const origWindowOpen = window.open ? window.open.bind(window) : null;

  function openUrlSafely(url, target, features) {
    if (!url || typeof url !== 'string') return null;
    const now = Date.now();
    if (now - lastOpenedTime < 500) return null;
    lastOpenedTime = now;
    const fullUrl = resolveFullUrl(url);
    if (origWindowOpen) {
      return origWindowOpen(fullUrl, target || '_blank', features || 'noopener,noreferrer');
    }
    return null;
  }

  if (origWindowOpen) {
    window.open = function (url, target, features) {
      if (url && typeof url === 'string') {
        return openUrlSafely(url, target, features);
      }

      const loc = {};
      Object.defineProperty(loc, 'href', {
        configurable: true,
        set(uri) {
          openUrlSafely(uri, target, features);
        },
        get() {
          return '';
        },
      });
      return { opener: null, location: loc };
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Focus-Preserving Clipboard Support (OSC 52 & Explicit Copy Shortcuts)
  // ---------------------------------------------------------------------------
  function copyWithExecCommand(text) {
    let done = false;
    function onCopy(event) {
      if (event.clipboardData) {
        event.clipboardData.setData('text/plain', text);
        event.preventDefault();
        event.stopImmediatePropagation();
        done = true;
      }
    }
    document.addEventListener('copy', onCopy, true);
    try {
      document.execCommand('copy');
    } catch (_) {
      // Treated as not copied
    }
    document.removeEventListener('copy', onCopy, true);
    return done;
  }

  let toast = null;
  let toastTimer = 0;
  function showToast(message) {
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'agy-copy-toast';
      toast.setAttribute('role', 'status');
      toast.style.cssText = [
        'position:fixed',
        'bottom:12px',
        'right:12px',
        'z-index:10',
        'background:#161b22',
        'color:#e6edf3',
        'border:1px solid #30363d',
        'padding:6px 10px',
        'border-radius:4px',
        'font:13px sans-serif',
        'pointer-events:none',
        'transition:opacity 0.3s ease',
        'opacity:0',
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
    }, 1500);
  }

  function copyToClipboard(rawText, notify) {
    if (!rawText) return Promise.resolve(false);
    const text = unwrapIfMultilineUrl(rawText);
    const shouldNotify = notify !== false;

    if (
      window.isSecureContext &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      return navigator.clipboard
        .writeText(text)
        .then(() => {
          if (shouldNotify) showToast('Copied to clipboard');
          return true;
        })
        .catch(() => {
          const ok = copyWithExecCommand(text);
          if (ok && shouldNotify) showToast('Copied to clipboard');
          return ok;
        });
    }

    const ok = copyWithExecCommand(text);
    if (ok && shouldNotify) showToast('Copied to clipboard');
    return Promise.resolve(ok);
  }

  function decodeOsc52(data) {
    if (typeof data !== 'string') return { kind: 'invalid' };
    const idx = data.indexOf(';');
    if (idx === -1) return { kind: 'invalid' };
    const payload = data.slice(idx + 1).replace(/\s/g, '');
    if (payload === '?') return { kind: 'read' };
    if (!payload || payload.length > OSC52_MAX || !BASE64_RE.test(payload)) {
      return { kind: 'invalid' };
    }
    try {
      const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
      return { kind: 'write', text: new TextDecoder().decode(bytes) };
    } catch (_) {
      return { kind: 'invalid' };
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Attach to `window.term` (xterm.js instance exposed by ttyd)
  // ---------------------------------------------------------------------------
  let attachedTerm = null;

  function attachToTerm(term) {
    if (!term || term === attachedTerm) return;
    attachedTerm = term;

    // 3a. Register OSC 52 handler for tmux / CLI clipboard writes (read requests are ignored)
    if (term.parser && typeof term.parser.registerOscHandler === 'function') {
      term.parser.registerOscHandler(52, (data) => {
        const res = decodeOsc52(data);
        if (res.kind === 'write' && res.text) {
          copyToClipboard(res.text, true);
        }
        return true;
      });
    }

    // 3b. Explicit keyboard copy shortcuts (Cmd+C or Ctrl+Shift+C when text is selected)
    window.addEventListener(
      'keydown',
      (e) => {
        const hasSel = typeof term.hasSelection === 'function' && term.hasSelection();
        if (!hasSel) return;

        const isExplicitCopy =
          (e.metaKey && (e.key === 'c' || e.key === 'C')) ||
          (e.ctrlKey && e.shiftKey && (e.key === 'c' || e.key === 'C'));
        if (isExplicitCopy) {
          const sel = term.getSelection();
          if (sel) {
            copyToClipboard(sel, true);
          }
        }
      },
      true
    );

    // 3c. Register Link Provider so ALL lines (1..N) of a wrapped URL are clickable
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
                const cleaned = cleanTerminalRow(lineStr);
                if (!cleaned) continue;
                const fragment = row === item.startRow ? item.firstLineUrl : cleaned;
                const idx = lineStr.indexOf(fragment);
                if (idx === -1) continue;
                const startCol = idx + 1;
                const endCol = startCol + fragment.length - 1;

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
  }

  function pollForTerm() {
    const term =
      window.term ||
      (document.querySelector('.xterm-helper-textarea') &&
        document.querySelector('.xterm-helper-textarea').__xtermTerminal);
    if (term) {
      attachToTerm(term);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Home Assistant Sidebar Custom Antigravity Icon (same-origin window.top)
  // ---------------------------------------------------------------------------
  const ANTIGRAVITY_ICON_NAME = 'agy:antigravity';
  const ANTIGRAVITY_SVG_PATH =
    'M12,2.34C14.9,2.34 16.5,5.1 17.8,10.8C18.7,14.8 19.8,18.6 22.25,20.6' +
    'C22.65,20.95 22.6,21.55 22,21.65C21.3,21.75 20.2,21.1 19,19.95' +
    'C16.9,17.9 15.3,12.66 12,12.66C8.7,12.66 7.1,17.9 5,19.95' +
    'C3.8,21.1 2.7,21.75 2,21.65C1.4,21.55 1.35,20.95 1.75,20.6' +
    'C4.2,18.6 5.3,14.8 6.2,10.8C7.5,5.1 9.1,2.34 12,2.34Z';

  function applyIconToHaSidebar(targetWin) {
    try {
      if (!targetWin || !targetWin.document) return false;

      targetWin.customIconsets = targetWin.customIconsets || {};
      if (!targetWin.customIconsets.agy) {
        targetWin.customIconsets.agy = function () {
          return Promise.resolve({
            path: ANTIGRAVITY_SVG_PATH,
            viewBox: '0 0 24 24',
          });
        };
      }

      const ha = targetWin.document.querySelector('home-assistant');
      const main = ha && ha.shadowRoot && ha.shadowRoot.querySelector('home-assistant-main');
      const sidebar = main && main.shadowRoot && main.shadowRoot.querySelector('ha-sidebar');
      const sidebarRoot = sidebar && sidebar.shadowRoot;
      if (!sidebarRoot) return false;

      const candidates = sidebarRoot.querySelectorAll(
        'ha-md-list-item, a, paper-icon-item, [data-panel], [href]'
      );

      for (const el of candidates) {
        const panel = (el.getAttribute && el.getAttribute('data-panel')) || '';
        const href = (el.getAttribute && el.getAttribute('href')) || '';
        const isAntigravity =
          panel.includes('antigravity_terminal') ||
          href.includes('antigravity_terminal') ||
          (el.textContent && el.textContent.trim() === 'Antigravity');

        if (!isAntigravity) continue;

        const haIcon =
          el.querySelector('ha-icon') ||
          (el.shadowRoot && el.shadowRoot.querySelector('ha-icon'));
        if (!haIcon) continue;

        if (haIcon.icon !== ANTIGRAVITY_ICON_NAME) {
          haIcon.icon = ANTIGRAVITY_ICON_NAME;
        }
        if (haIcon.getAttribute('icon') !== ANTIGRAVITY_ICON_NAME) {
          haIcon.setAttribute('icon', ANTIGRAVITY_ICON_NAME);
        }

        const svgIcon = haIcon.shadowRoot && haIcon.shadowRoot.querySelector('ha-svg-icon');
        if (svgIcon) {
          if (svgIcon.path !== ANTIGRAVITY_SVG_PATH) {
            svgIcon.path = ANTIGRAVITY_SVG_PATH;
          }
          const pathNode = svgIcon.shadowRoot && svgIcon.shadowRoot.querySelector('path');
          if (pathNode && pathNode.getAttribute('d') !== ANTIGRAVITY_SVG_PATH) {
            pathNode.setAttribute('d', ANTIGRAVITY_SVG_PATH);
          }
        }
      }

      if (!sidebar.__agyIconObserverAttached && typeof targetWin.MutationObserver === 'function') {
        sidebar.__agyIconObserverAttached = true;
        const obs = new targetWin.MutationObserver(() => {
          applyIconToHaSidebar(targetWin);
        });
        obs.observe(sidebarRoot, { childList: true, subtree: true });
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function syncSidebarIcon() {
    try {
      if (window.parent && window.parent !== window) {
        applyIconToHaSidebar(window.parent);
      }
    } catch (_) {}
    try {
      if (window.top && window.top !== window) {
        applyIconToHaSidebar(window.top);
      }
    } catch (_) {}
  }

  pollForTerm();
  syncSidebarIcon();
  setInterval(pollForTerm, 1000);
  setInterval(syncSidebarIcon, 2500);
})();
