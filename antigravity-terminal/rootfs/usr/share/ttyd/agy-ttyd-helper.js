/**
 * Antigravity Terminal for Home Assistant — Web Terminal Helper
 *
 * Keeps ttyd's built-in page thin and dependency-free while enhancing browser
 * and mobile Home Assistant Ingress usability:
 * 1. Reconstructs multi-line hard-wrapped URLs (such as 400+ char Google OAuth URLs
 *    rendered by `agy`'s TUI) on demand so clicking/tapping ANY line of the wrapped
 *    URL opens the complete, unbroken URL (including inside tmux mouse mode).
 * 2. Handles OSC 52 clipboard writes from tmux / CLI tools (and explicit Cmd+C /
 *    Ctrl+Shift+C copy shortcuts) without stealing focus from the terminal,
 *    with a plain-HTTP fallback and multi-line URL unwrapping.
 * 3. Adds smooth single-finger mobile touch scrolling with momentum inertia,
 *    pull-to-refresh prevention, soft-keyboard auto-dismiss on scroll-up,
 *    responsive per-device font sizing/zoom, and a collapsible floating toolbar
 *    for paging, bottom-jump, zoom, and TUI shortcuts (including Ctrl+O).
 */
(function () {
  'use strict';

  const OSC52_MAX = 1000000;
  const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  const URL_CONT_REGEX = /^[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+$/;

  const TMUX_USER_KEY_PAGE_UP = '\x1b[998~';
  const TMUX_USER_KEY_PAGE_DOWN = '\x1b[997~';
  const TMUX_USER_KEY_BOTTOM = '\x1b[999~';

  const FONT_SIZE_MIN = 8;
  const FONT_SIZE_MAX = 24;
  const FONT_SIZE_DESKTOP_DEFAULT = 14;
  const FONT_SIZE_MOBILE_DEFAULT = 11;
  const MOBILE_BREAKPOINT_PX = 600;
  const FONT_SIZE_STORAGE_KEY = 'agy_term_font_size';
  const TOUCH_SLOP_PX = 6;
  const KEYBOARD_DISMISS_DRAG_PX = 36;

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

  function scanBufferForWrappedUrls(term, centerRow) {
    const results = [];
    if (!term || !term.buffer || !term.buffer.active) return results;
    const buf = term.buffer.active;
    const totalLines = buf.length;
    const defaultStart = Math.max(0, totalLines - 150);
    const useWindow = typeof centerRow === 'number' && centerRow < defaultStart;
    const startScan = useWindow ? Math.max(0, centerRow - 30) : defaultStart;
    const endScan = useWindow ? Math.min(totalLines, centerRow + 30) : totalLines;

    for (let r = startScan; r < endScan; r++) {
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
    if (!document.body) return;
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'agy-copy-toast';
      toast.setAttribute('role', 'status');
      toast.style.cssText = [
        'position:fixed',
        'bottom:max(28px, calc(12px + env(safe-area-inset-bottom, 0px)))',
        'right:max(12px, env(safe-area-inset-right, 0px))',
        'z-index:25',
        'background:#161b22',
        'color:#e6edf3',
        'border:1px solid #30363d',
        'padding:6px 10px',
        'border-radius:6px',
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
  // 3. Mobile / Scrollbar / Floating Toolbar Styles
  // ---------------------------------------------------------------------------
  function injectHelperStyles() {
    if (document.getElementById('agy-helper-styles')) return;
    const head = document.head || document.documentElement;
    if (!head) return;

    const style = document.createElement('style');
    style.id = 'agy-helper-styles';
    style.textContent = [
      'html, body, #terminal, .xterm { overscroll-behavior: none; }',
      '.xterm-viewport {',
      '  --agy-sb-thumb: #8b949e;',
      '  --agy-sb-track: #0f1419;',
      '  scrollbar-color: var(--agy-sb-thumb) var(--agy-sb-track);',
      '  scrollbar-width: thin;',
      '  -webkit-overflow-scrolling: touch;',
      '}',
      '@supports not (scrollbar-color: auto) {',
      '  .xterm-viewport { scrollbar-width: auto; }',
      '  .xterm-viewport::-webkit-scrollbar { width: 10px; height: 10px; }',
      '  .xterm-viewport::-webkit-scrollbar-thumb { background: var(--agy-sb-thumb); border-radius: 5px; }',
      '  .xterm-viewport::-webkit-scrollbar-track { background: var(--agy-sb-track); }',
      '}',
      '#agy-terminal-toolbar-wrap {',
      '  --agy-btn-size: 28px;',
      '  position: fixed;',
      '  top: max(8px, env(safe-area-inset-top, 0px));',
      '  right: max(8px, env(safe-area-inset-right, 0px));',
      '  z-index: 20;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 4px;',
      '  max-inline-size: calc(100vw - 16px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));',
      '  padding: 3px;',
      '  background: rgba(22, 27, 34, 0.92);',
      '  border: 1px solid #30363d;',
      '  border-radius: 8px;',
      '  color: #e6edf3;',
      '  font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
      '  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);',
      '  backdrop-filter: blur(8px);',
      '  touch-action: manipulation;',
      '}',
      '@media (pointer: coarse) {',
      '  #agy-terminal-toolbar-wrap { --agy-btn-size: 44px; }',
      '}',
      '#agy-terminal-toolbar {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 4px;',
      '  min-inline-size: 0;',
      '  overflow-x: auto;',
      '  scrollbar-width: none;',
      '  scroll-snap-type: x proximity;',
      '  -webkit-overflow-scrolling: touch;',
      '}',
      '#agy-terminal-toolbar::-webkit-scrollbar { display: none; }',
      '#agy-terminal-toolbar[hidden] { display: none; }',
      '#agy-terminal-toolbar [role="group"] {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 4px;',
      '  flex-shrink: 0;',
      '  scroll-snap-align: start;',
      '}',
      '#agy-terminal-toolbar [role="separator"] {',
      '  inline-size: 0;',
      '  block-size: 18px;',
      '  border-inline-start: 1px solid #30363d;',
      '  margin-inline: 2px;',
      '  flex-shrink: 0;',
      '}',
      '#agy-terminal-toolbar-wrap button {',
      '  min-inline-size: var(--agy-btn-size);',
      '  min-block-size: var(--agy-btn-size);',
      '  padding: 0 7px;',
      '  margin: 0;',
      '  flex-shrink: 0;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  background: #21262d;',
      '  color: #e6edf3;',
      '  border: 1px solid #30363d;',
      '  border-radius: 6px;',
      '  font: inherit;',
      '  line-height: 1;',
      '  white-space: nowrap;',
      '  cursor: pointer;',
      '  user-select: none;',
      '  -webkit-user-select: none;',
      '  touch-action: manipulation;',
      '}',
      '#agy-terminal-toolbar-wrap button:focus-visible {',
      '  outline: 2px solid #58a6ff;',
      '  outline-offset: 2px;',
      '}',
      '@media (hover: hover) {',
      '  #agy-terminal-toolbar-wrap button:hover {',
      '    background: #30363d;',
      '    border-color: #8b949e;',
      '  }',
      '}',
      '@media (hover: none) {',
      '  #agy-toolbar-toggle { opacity: 1; }',
      '}',
      '@media (prefers-reduced-motion: no-preference) {',
      '  #agy-terminal-toolbar-wrap button {',
      '    transition: background-color 140ms ease-out, border-color 140ms ease-out, scale 120ms ease-out;',
      '  }',
      '  #agy-terminal-toolbar-wrap button:active { scale: 0.96; }',
      '}',
      '@media (forced-colors: active) {',
      '  #agy-terminal-toolbar-wrap, #agy-terminal-toolbar-wrap button {',
      '    border: 1px solid ButtonText;',
      '    background: ButtonFace;',
      '    color: ButtonText;',
      '  }',
      '  #agy-terminal-toolbar [role="separator"] {',
      '    border-inline-start-color: ButtonText;',
      '  }',
      '}',
    ].join('\n');
    head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // 4. Terminal Scroll, Input, Wheel & Font-Size Helpers
  // ---------------------------------------------------------------------------
  function sendTermInput(term, seq) {
    if (!term || !seq) return false;
    if (typeof term.input === 'function') {
      term.input(seq, false);
      return true;
    }
    if (
      term._core &&
      term._core.coreService &&
      typeof term._core.coreService.triggerDataEvent === 'function'
    ) {
      term._core.coreService.triggerDataEvent(seq, false);
      return true;
    }
    return false;
  }

  function isTmuxMouseActive(term) {
    return Boolean(
      term &&
        term.buffer &&
        term.buffer.active &&
        term.buffer.active.type === 'alternate' &&
        term.modes &&
        term.modes.mouseTrackingMode &&
        term.modes.mouseTrackingMode !== 'none'
    );
  }

  function clampWheelCoords(rect, rows, clientX, clientY) {
    const left = rect && typeof rect.left === 'number' ? rect.left : 0;
    const top = rect && typeof rect.top === 'number' ? rect.top : 0;
    const width = rect && typeof rect.width === 'number' ? rect.width : 100;
    const height = rect && typeof rect.height === 'number' ? rect.height : 100;
    const right = rect && typeof rect.right === 'number' ? rect.right : left + width;
    const bottom = rect && typeof rect.bottom === 'number' ? rect.bottom : top + height;
    const safeRows = Math.max(1, rows || 24);
    const cellH = height / safeRows;

    const minX = left + Math.min(4, width * 0.25);
    const maxX = Math.max(minX, right - Math.min(4, width * 0.25));
    const minY = top + cellH * 0.5;
    const maxY = Math.max(minY, bottom - cellH * 1.5);

    const rawX =
      typeof clientX === 'number' && Number.isFinite(clientX) ? clientX : (left + right) / 2;
    const rawY =
      typeof clientY === 'number' && Number.isFinite(clientY) ? clientY : (minY + maxY) / 2;

    return {
      x: Math.min(maxX, Math.max(minX, rawX)),
      y: Math.min(maxY, Math.max(minY, rawY)),
    };
  }

  function dispatchTermWheel(term, deltaLines, clientX, clientY) {
    if (!term || !term.element || !deltaLines) return false;
    const target = term.element.querySelector('.xterm-screen') || term.element;
    if (!target || typeof target.dispatchEvent !== 'function' || typeof WheelEvent !== 'function') {
      return false;
    }
    const rect =
      typeof target.getBoundingClientRect === 'function'
        ? target.getBoundingClientRect()
        : { left: 0, top: 0, right: 320, bottom: 480, width: 320, height: 480 };
    const coords = clampWheelCoords(rect, term.rows || 24, clientX, clientY);
    const domDeltaLine = typeof WheelEvent.DOM_DELTA_LINE === 'number' ? WheelEvent.DOM_DELTA_LINE : 1;
    const wheelEvt = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      view: window,
      deltaX: 0,
      deltaY: deltaLines,
      deltaMode: domDeltaLine,
      clientX: coords.x,
      clientY: coords.y,
    });
    return target.dispatchEvent(wheelEvt);
  }

  function scrollTerminalByLines(term, lines, clientX, clientY) {
    if (!term || !lines) return;
    if (isTmuxMouseActive(term)) {
      const dir = lines < 0 ? -1 : 1;
      const ticks = Math.min(12, Math.max(1, Math.round(Math.abs(lines) / 3)));
      for (let i = 0; i < ticks; i++) {
        dispatchTermWheel(term, dir, clientX, clientY);
      }
      return;
    }
    if (
      term.buffer &&
      term.buffer.active &&
      term.buffer.active.type === 'normal' &&
      typeof term.scrollLines === 'function'
    ) {
      term.scrollLines(lines);
    }
  }

  function scrollTerminalPage(term, direction) {
    if (!term) return;
    const dir = direction < 0 ? -1 : 1;
    if (isTmuxMouseActive(term)) {
      sendTermInput(term, dir < 0 ? TMUX_USER_KEY_PAGE_UP : TMUX_USER_KEY_PAGE_DOWN);
      return;
    }
    if (term.buffer && term.buffer.active && term.buffer.active.type === 'normal') {
      if (typeof term.scrollPages === 'function') {
        term.scrollPages(dir);
      } else if (typeof term.scrollLines === 'function') {
        term.scrollLines(dir * Math.max(5, (term.rows || 24) - 2));
      }
    }
  }

  function scrollTerminalToBottom(term) {
    if (!term) return;
    if (isTmuxMouseActive(term)) {
      sendTermInput(term, TMUX_USER_KEY_BOTTOM);
      return;
    }
    if (typeof term.scrollToBottom === 'function') {
      term.scrollToBottom();
    }
  }

  function computeScrollStep(accumPx, lineHeightPx, tmuxMode) {
    const safeLineH = Math.max(10, lineHeightPx || 16);
    if (tmuxMode) {
      const stepPx = Math.max(12, safeLineH * 1.5);
      const ticks = Math.trunc(accumPx / stepPx);
      return {
        lines: ticks * 3,
        consumedPx: ticks * stepPx,
      };
    }
    const lines = Math.trunc(accumPx / safeLineH);
    return {
      lines,
      consumedPx: lines * safeLineH,
    };
  }

  function getTerminalLineHeight(term) {
    if (!term || !term.element) return 16;
    const screenEl = term.element.querySelector('.xterm-screen') || term.element;
    const rect = typeof screenEl.getBoundingClientRect === 'function' ? screenEl.getBoundingClientRect() : null;
    if (!rect || !rect.height) return 16;
    return Math.max(12, Math.round(rect.height / Math.max(1, term.rows || 24)));
  }

  function clampFontSize(size) {
    const num = Math.round(Number(size));
    if (!Number.isFinite(num)) return FONT_SIZE_DESKTOP_DEFAULT;
    return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, num));
  }

  function getDefaultFontSize(viewportWidth) {
    const width = typeof viewportWidth === 'number' ? viewportWidth : window.innerWidth;
    return width < MOBILE_BREAKPOINT_PX ? FONT_SIZE_MOBILE_DEFAULT : FONT_SIZE_DESKTOP_DEFAULT;
  }

  function readSavedFontSize() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= FONT_SIZE_MIN && parsed <= FONT_SIZE_MAX) {
        return Math.round(parsed);
      }
    } catch (_) {
      // Ignore storage failures
    }
    return null;
  }

  function setTermFontSize(term, size, persist) {
    if (!term || !term.options) return;
    const clamped = clampFontSize(size);
    if (term.options.fontSize !== clamped) {
      term.options.fontSize = clamped;
    }
    if (persist) {
      try {
        if (window.localStorage) {
          window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(clamped));
        }
      } catch (_) {
        // Ignore storage failures
      }
      showToast('Font size: ' + clamped + 'px');
    }
    try {
      window.dispatchEvent(new Event('resize'));
    } catch (_) {}
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        try {
          window.dispatchEvent(new Event('resize'));
        } catch (_) {}
      });
    }
  }

  function applyInitialFontSize(term) {
    const saved = readSavedFontSize();
    const initial = saved !== null ? saved : getDefaultFontSize(window.innerWidth);
    setTermFontSize(term, initial, false);
  }

  function adjustFontSize(term, delta) {
    if (!term || !term.options) return;
    const current =
      typeof term.options.fontSize === 'number'
        ? term.options.fontSize
        : getDefaultFontSize(window.innerWidth);
    setTermFontSize(term, current + delta, true);
  }

  // ---------------------------------------------------------------------------
  // 5. Mobile Single-Finger Touch Scroll + Momentum + Keyboard Auto-Dismiss
  // ---------------------------------------------------------------------------
  function attachTouchScroll(term) {
    if (!term || !term.element || term.element.__agyTouchScrollAttached) return;
    term.element.__agyTouchScrollAttached = true;

    let active = false;
    let isScrolling = false;
    let dismissedKeyboard = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;
    let accumPx = 0;
    let velocityPxPerMs = 0;
    let momentumRafId = 0;

    function cancelMomentum() {
      if (momentumRafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(momentumRafId);
      }
      momentumRafId = 0;
    }

    term.element.addEventListener(
      'touchstart',
      (e) => {
        if (e.target && typeof e.target.closest === 'function' && e.target.closest('#agy-terminal-toolbar-wrap')) {
          return;
        }
        cancelMomentum();
        if (!e.touches || e.touches.length !== 1) {
          active = false;
          return;
        }
        const touch = e.touches[0];
        active = true;
        isScrolling = false;
        dismissedKeyboard = false;
        startX = touch.clientX;
        startY = touch.clientY;
        lastX = touch.clientX;
        lastY = touch.clientY;
        lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        accumPx = 0;
        velocityPxPerMs = 0;
      },
      { passive: true }
    );

    term.element.addEventListener(
      'touchmove',
      (e) => {
        if (!active || !e.touches || e.touches.length !== 1) {
          active = false;
          return;
        }
        const touch = e.touches[0];
        const totalDx = touch.clientX - startX;
        const totalDy = touch.clientY - startY;

        if (!isScrolling) {
          if (Math.abs(totalDy) < TOUCH_SLOP_PX && Math.abs(totalDx) < TOUCH_SLOP_PX) {
            return;
          }
          if (Math.abs(totalDx) > Math.abs(totalDy)) {
            active = false;
            return;
          }
          isScrolling = true;
        }

        if (e.cancelable) {
          e.preventDefault();
        }

        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const dt = Math.max(1, now - lastTime);
        const stepY = lastY - touch.clientY;
        velocityPxPerMs = velocityPxPerMs * 0.4 + (stepY / dt) * 0.6;
        lastX = touch.clientX;
        lastY = touch.clientY;
        lastTime = now;

        accumPx += stepY;
        const step = computeScrollStep(accumPx, getTerminalLineHeight(term), isTmuxMouseActive(term));
        accumPx -= step.consumedPx;
        if (step.lines !== 0) {
          scrollTerminalByLines(term, step.lines, touch.clientX, touch.clientY);
        }

        if (!dismissedKeyboard && totalDy >= KEYBOARD_DISMISS_DRAG_PX) {
          const activeEl = document.activeElement;
          if (activeEl && activeEl.classList && activeEl.classList.contains('xterm-helper-textarea')) {
            activeEl.blur();
          }
          dismissedKeyboard = true;
        }
      },
      { passive: false }
    );

    function finishTouch(e) {
      if (!active) return;
      active = false;
      if (!isScrolling) return;
      isScrolling = false;

      if (
        e.type === 'touchend' &&
        Math.abs(velocityPxPerMs) >= 0.15 &&
        typeof requestAnimationFrame === 'function'
      ) {
        let prevTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        let vel = Math.max(-4, Math.min(4, velocityPxPerMs));
        const flickX = lastX;
        const flickY = lastY;

        function stepMomentum(ts) {
          const frameDt = Math.min(32, Math.max(1, ts - prevTs));
          prevTs = ts;
          accumPx += vel * frameDt;
          const step = computeScrollStep(accumPx, getTerminalLineHeight(term), isTmuxMouseActive(term));
          accumPx -= step.consumedPx;
          if (step.lines !== 0) {
            scrollTerminalByLines(term, step.lines, flickX, flickY);
          }
          vel *= Math.pow(0.92, frameDt / 16);
          if (Math.abs(vel) >= 0.08) {
            momentumRafId = requestAnimationFrame(stepMomentum);
          } else {
            momentumRafId = 0;
          }
        }
        momentumRafId = requestAnimationFrame(stepMomentum);
      }
    }

    term.element.addEventListener('touchend', finishTouch, { passive: true });
    term.element.addEventListener('touchcancel', finishTouch, { passive: true });
  }

  // ---------------------------------------------------------------------------
  // 6. Preserve Click/Tap URL Opening Under tmux mouse mode
  // ---------------------------------------------------------------------------
  function mapPointToTerminalCell(term, clientX, clientY) {
    if (!term || !term.element) return null;
    const screenEl = term.element.querySelector('.xterm-screen') || term.element;
    if (!screenEl || typeof screenEl.getBoundingClientRect !== 'function') return null;
    const rect = screenEl.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }
    const cols = Math.max(1, term.cols || 80);
    const rows = Math.max(1, term.rows || 24);
    const relRow = Math.min(
      rows - 1,
      Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * rows))
    );
    const col = Math.min(
      cols,
      Math.max(1, Math.floor(((clientX - rect.left) / rect.width) * cols) + 1)
    );
    const viewportY = (term.buffer && term.buffer.active && term.buffer.active.viewportY) || 0;
    return { bufferRow: viewportY + relRow, col };
  }

  function findUrlAtCell(term, bufferRow, colOneBased) {
    if (!term || !term.buffer || !term.buffer.active) return null;
    const wrappedList = scanBufferForWrappedUrls(term, bufferRow);
    const lineObj = term.buffer.active.getLine(bufferRow);
    if (!lineObj) return null;
    const lineStr = lineObj.translateToString(true);
    const cleaned = cleanTerminalRow(lineStr);
    if (!cleaned) return null;

    for (const item of wrappedList) {
      if (bufferRow >= item.startRow && bufferRow <= item.endRow) {
        const fragment = bufferRow === item.startRow ? item.firstLineUrl : cleaned;
        const idx = lineStr.indexOf(fragment);
        if (idx === -1) continue;
        const startCol = idx + 1;
        const endCol = startCol + fragment.length - 1;
        if (colOneBased >= startCol && colOneBased <= endCol) {
          return item.fullUrl;
        }
      }
    }
    return null;
  }

  function attachUrlClickFallback(term) {
    if (!term || !term.element || term.element.__agyUrlClickAttached) return;
    term.element.__agyUrlClickAttached = true;

    let downState = null;

    term.element.addEventListener(
      'pointerdown',
      (e) => {
        if (e.target && typeof e.target.closest === 'function' && e.target.closest('#agy-terminal-toolbar-wrap')) {
          return;
        }
        if (e.isPrimary === false) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        downState = {
          x: e.clientX,
          y: e.clientY,
          time: Date.now(),
          pointerId: e.pointerId,
        };
      },
      { passive: true }
    );

    term.element.addEventListener(
      'pointerup',
      (e) => {
        if (!downState || e.pointerId !== downState.pointerId) return;
        const prev = downState;
        downState = null;
        if (e.shiftKey || e.altKey) return;
        if (Math.hypot(e.clientX - prev.x, e.clientY - prev.y) >= TOUCH_SLOP_PX) return;
        if (Date.now() - prev.time >= 450) return;
        if (!isTmuxMouseActive(term)) return;

        const cell = mapPointToTerminalCell(term, e.clientX, e.clientY);
        if (!cell) return;
        const url = findUrlAtCell(term, cell.bufferRow, cell.col);
        if (url) {
          openUrlSafely(url);
        }
      },
      { passive: true }
    );
  }

  // ---------------------------------------------------------------------------
  // 7. Collapsible Focus-Preserving Floating Controls Toolbar
  // ---------------------------------------------------------------------------
  let toolbarTerm = null;

  function installToolbarFocusFallback(toolbar) {
    if ('focusGroup' in HTMLElement.prototype) return;
    const items = Array.from(toolbar.querySelectorAll('button'));
    if (!items.length) return;

    items.forEach((btn, idx) => {
      btn.tabIndex = idx === 0 ? 0 : -1;
    });

    toolbar.addEventListener('focusin', (e) => {
      const idx = items.indexOf(e.target);
      if (idx !== -1) {
        items.forEach((btn, i) => {
          btn.tabIndex = i === idx ? 0 : -1;
        });
      }
    });

    toolbar.addEventListener('keydown', (e) => {
      const currentIdx = items.indexOf(document.activeElement);
      if (currentIdx === -1) return;
      const rtl = typeof getComputedStyle === 'function' && getComputedStyle(toolbar).direction === 'rtl';
      let nextIdx = -1;

      if (e.key === 'ArrowRight') {
        nextIdx = (currentIdx + (rtl ? -1 : 1) + items.length) % items.length;
      } else if (e.key === 'ArrowLeft') {
        nextIdx = (currentIdx + (rtl ? 1 : -1) + items.length) % items.length;
      } else if (e.key === 'Home') {
        nextIdx = 0;
      } else if (e.key === 'End') {
        nextIdx = items.length - 1;
      }

      if (nextIdx !== -1) {
        e.preventDefault();
        items[nextIdx].focus();
      }
    });
  }

  function makeToolbarButton(label, ariaLabel, title, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('aria-label', ariaLabel);
    btn.title = title;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function makeToolbarGroup(ariaLabel, buttons) {
    const group = document.createElement('div');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', ariaLabel);
    buttons.forEach((b) => group.appendChild(b));
    return group;
  }

  function makeToolbarSeparator() {
    const sep = document.createElement('span');
    sep.setAttribute('role', 'separator');
    sep.setAttribute('aria-orientation', 'vertical');
    return sep;
  }

  function toggleTerminalKeyboard(term) {
    const textarea = document.querySelector('.xterm-helper-textarea');
    if (textarea && document.activeElement === textarea) {
      textarea.blur();
      return;
    }
    if (term && typeof term.focus === 'function') {
      term.focus();
    } else if (textarea && typeof textarea.focus === 'function') {
      textarea.focus();
    }
  }

  function ensureFloatingToolbar(term) {
    toolbarTerm = term || toolbarTerm;
    if (!document.body) return;
    if (document.getElementById('agy-terminal-toolbar-wrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'agy-terminal-toolbar-wrap';

    const isCoarse =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    let expanded = window.innerWidth < MOBILE_BREAKPOINT_PX || isCoarse;

    const toolbar = document.createElement('div');
    toolbar.id = 'agy-terminal-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('focusgroup', 'toolbar wrap');
    toolbar.setAttribute('aria-label', 'Terminal controls');
    toolbar.hidden = !expanded;

    const toggleBtn = makeToolbarButton(
      '↕',
      'Toggle terminal controls',
      'Terminal controls',
      () => {
        expanded = !expanded;
        toolbar.hidden = !expanded;
        toggleBtn.setAttribute('aria-expanded', String(expanded));
      }
    );
    toggleBtn.id = 'agy-toolbar-toggle';
    toggleBtn.setAttribute('aria-expanded', String(expanded));
    toggleBtn.setAttribute('aria-controls', 'agy-terminal-toolbar');

    const getTerm = () => toolbarTerm || window.term;

    const scrollGroup = makeToolbarGroup('Scroll', [
      makeToolbarButton('▲', 'Scroll page up', 'Page up', () => scrollTerminalPage(getTerm(), -1)),
      makeToolbarButton('▼', 'Scroll page down', 'Page down', () => scrollTerminalPage(getTerm(), 1)),
      makeToolbarButton('⤓', 'Jump to bottom', 'Jump to live bottom', () =>
        scrollTerminalToBottom(getTerm())
      ),
    ]);

    const viewGroup = makeToolbarGroup('Text size', [
      makeToolbarButton('A−', 'Decrease font size', 'Zoom out (show more)', () =>
        adjustFontSize(getTerm(), -1)
      ),
      makeToolbarButton('A+', 'Increase font size', 'Zoom in', () =>
        adjustFontSize(getTerm(), 1)
      ),
    ]);

    const keysGroup = makeToolbarGroup('Terminal shortcuts', [
      makeToolbarButton('Ctrl+O', 'Expand or collapse details (Ctrl+O)', 'Expand details (Ctrl+O)', () =>
        sendTermInput(getTerm(), '\x0f')
      ),
      makeToolbarButton('⇧Tab', 'Switch mode (Shift+Tab)', 'Switch mode (Shift+Tab)', () =>
        sendTermInput(getTerm(), '\x1b[Z')
      ),
      makeToolbarButton('Esc', 'Escape', 'Escape', () => sendTermInput(getTerm(), '\x1b')),
      makeToolbarButton('↑', 'Up arrow', 'Up', () => sendTermInput(getTerm(), '\x1b[A')),
      makeToolbarButton('↓', 'Down arrow', 'Down', () => sendTermInput(getTerm(), '\x1b[B')),
      makeToolbarButton('↵', 'Enter', 'Enter', () => sendTermInput(getTerm(), '\r')),
      makeToolbarButton('⌨', 'Toggle keyboard', 'Toggle keyboard', () =>
        toggleTerminalKeyboard(getTerm())
      ),
    ]);

    toolbar.appendChild(scrollGroup);
    toolbar.appendChild(makeToolbarSeparator());
    toolbar.appendChild(viewGroup);
    toolbar.appendChild(makeToolbarSeparator());
    toolbar.appendChild(keysGroup);

    wrap.appendChild(toolbar);
    wrap.appendChild(toggleBtn);

    wrap.addEventListener('mousedown', (e) => {
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('button')) {
        e.preventDefault();
      }
    });

    installToolbarFocusFallback(toolbar);
    document.body.appendChild(wrap);
  }

  // ---------------------------------------------------------------------------
  // 8. Attach to `window.term` (xterm.js instance exposed by ttyd)
  // ---------------------------------------------------------------------------
  let attachedTerm = null;

  function attachToTerm(term) {
    if (!term || term === attachedTerm) return;
    attachedTerm = term;

    injectHelperStyles();
    applyInitialFontSize(term);
    attachTouchScroll(term);
    attachUrlClickFallback(term);
    ensureFloatingToolbar(term);

    // 8a. Register OSC 52 handler for tmux / CLI clipboard writes (read requests are ignored)
    if (term.parser && typeof term.parser.registerOscHandler === 'function') {
      term.parser.registerOscHandler(52, (data) => {
        const res = decodeOsc52(data);
        if (res.kind === 'write' && res.text) {
          copyToClipboard(res.text, true);
        }
        return true;
      });
    }

    // 8b. Explicit keyboard copy shortcuts (Cmd+C or Ctrl+Shift+C when text is selected)
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

    // 8c. Register Link Provider so ALL lines (1..N) of a wrapped URL are clickable
    if (typeof term.registerLinkProvider === 'function') {
      term.registerLinkProvider({
        provideLinks(bufferLineNumber, callback) {
          try {
            const row = bufferLineNumber - 1;
            const wrappedList = scanBufferForWrappedUrls(term, row);
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
      injectHelperStyles();
      attachTouchScroll(term);
      attachUrlClickFallback(term);
      ensureFloatingToolbar(term);
    }
  }

  // ---------------------------------------------------------------------------
  // 9. Home Assistant Sidebar Custom Antigravity Icon (same-origin window.top)
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
