/* ---------------------------------------------------------------------------
   Colour scheme: auto, light, dark.

   Auto is the default and means "follow the machine", which is also exactly
   what someone with scripting off gets — the stylesheet's media query is doing
   that work, and this file only ever overrides it when the reader has said so.

   The stored value is one of 'light' | 'dark', or absent for auto. Absent, not
   the string 'auto', on purpose: it keeps "no opinion" and "no storage" the
   same state, so clearing site data returns you to following the system rather
   than to some remembered default.

   The <head> snippet applies the stored value before first paint. This file
   only builds the control and handles clicks.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'theme';
  var ORDER = ['auto', 'light', 'dark'];
  var LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  var SAYS = {
    auto:  'Colour scheme: following your system. Choose light.',
    light: 'Colour scheme: light. Choose dark.',
    dark:  'Colour scheme: dark. Follow your system instead.'
  };

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return (v === 'light' || v === 'dark') ? v : 'auto';
    } catch (e) { return 'auto'; }        // Safari private mode throws on access
  }

  function store(mode) {
    try {
      if (mode === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch (e) { /* the page still works; the choice just will not persist */ }
  }

  // The browser UI colour is set by two media-scoped <meta name="theme-color">
  // tags. A media query cannot know about an override, so while one is active
  // an unconditional tag is inserted FIRST — browsers use the first tag whose
  // media matches, and one with no media always matches.
  function paintBrowserUI(mode) {
    var el = document.getElementById('theme-color-override');
    if (mode === 'auto') { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('meta');
      el.id = 'theme-color-override';
      el.name = 'theme-color';
      var first = document.querySelector('meta[name="theme-color"]');
      if (first) first.parentNode.insertBefore(el, first);
      else document.head.appendChild(el);
    }
    // read the resolved token rather than repeating the hex here
    el.content = getComputedStyle(document.documentElement)
                   .getPropertyValue('--film').trim() || (mode === 'dark' ? '#141816' : '#E6E9E5');
  }

  function apply(mode, announce) {
    var root = document.documentElement;
    if (mode === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    paintBrowserUI(mode);

    if (btn) {
      label.textContent = LABEL[mode];
      btn.setAttribute('aria-label', SAYS[mode]);
      btn.title = SAYS[mode];
    }
    if (announce) {
      // Tell anything that paints its own pixels — the WebGL part cannot see a
      // CSS variable change, and the media query it listens to does not fire
      // for a manual override.
      document.dispatchEvent(new CustomEvent('themechange', { detail: { mode: mode } }));
    }
  }

  var btn = null, label = null;

  function build() {
    var nav = document.querySelector('.masthead__nav');
    if (!nav || document.querySelector('.theme')) return;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme';

    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'theme__mark');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    var ring = document.createElementNS(svg.namespaceURI, 'circle');
    ring.setAttribute('cx', '8'); ring.setAttribute('cy', '8'); ring.setAttribute('r', '6.5');
    var half = document.createElementNS(svg.namespaceURI, 'path');
    half.setAttribute('d', 'M8 1.5a6.5 6.5 0 000 13z');    // left half filled
    svg.appendChild(ring); svg.appendChild(half);

    label = document.createElement('span');
    label.className = 'theme__label';

    btn.appendChild(svg);
    btn.appendChild(label);
    nav.appendChild(btn);

    btn.addEventListener('click', function () {
      var next = ORDER[(ORDER.indexOf(stored()) + 1) % ORDER.length];
      store(next);
      apply(next, true);
    });
  }

  build();
  apply(stored(), false);

  // While on auto, a system change should still reach anything painting its own
  // pixels, and should refresh the browser UI colour.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (stored() === 'auto') apply('auto', true);
  });

  // Another tab changed the choice: follow it, so the site does not disagree
  // with itself across windows.
  addEventListener('storage', function (e) {
    if (e.key === KEY) apply(stored(), true);
  });
})();
