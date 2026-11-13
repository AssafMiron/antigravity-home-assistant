/**
 * Antigravity Terminal for Home Assistant — Custom Sidebar Icon (agy:antigravity)
 *
 * Registers the custom `agy` iconset (`window.customIconsets.agy`) with the
 * Antigravity arch vector path and updates the Antigravity item inside
 * Home Assistant's `<ha-sidebar>` shadow DOM.
 */
(function () {
  'use strict';

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
      let applied = false;

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
        applied = true;
      }

      if (!sidebar.__agyIconObserverAttached && typeof targetWin.MutationObserver === 'function') {
        sidebar.__agyIconObserverAttached = true;
        const obs = new targetWin.MutationObserver(() => {
          applyIconToHaSidebar(targetWin);
        });
        obs.observe(sidebarRoot, { childList: true, subtree: true });
      }

      return applied;
    } catch (_) {
      return false;
    }
  }

  function installSidebarIcon() {
    applyIconToHaSidebar(window);
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

  installSidebarIcon();
  setInterval(installSidebarIcon, 2000);
})();
