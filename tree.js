/* ---------------------------------------------------------------------------
   The project tree: drawn edges and tracing, over a page that reads without them.

   With script off, tree.html is a tiered list of title blocks and every card
   says what it needs and unlocks inside its details. This adds what only a
   script can: one drawn edge per hard prerequisite, and hovering or focusing a
   card lights everything it depends on and everything that depends on it.

   The markup is the data. Each card carries data-needs (hard) and data-uses
   (soft) as space-separated ids; nothing is fetched and nothing is stored.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('js')) return;

  var tree = document.querySelector('.tree');
  if (!tree) return;
  var scroller = tree.querySelector('.tree__scroll');
  var svg = tree.querySelector('.tree__edges');
  var NS = 'http://www.w3.org/2000/svg';
  var wide = matchMedia('(min-width: 1100px)');
  var hover = matchMedia('(hover: hover)');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // ---- the graph, read from the cards -------------------------------------
  var nodes = [].slice.call(tree.querySelectorAll('.node'));
  // no prototype, so a hash like #constructor finds nothing rather than a function
  function map() { return Object.create(null); }
  var byId = map(), needs = map(), uses = map(), neededBy = map(), usedBy = map();
  function ids(el, attr) {
    return (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean);
  }
  nodes.forEach(function (n) { byId[n.id] = n; neededBy[n.id] = []; usedBy[n.id] = []; });
  nodes.forEach(function (n) {
    needs[n.id] = ids(n, 'data-needs').filter(function (d) { return byId[d]; });
    uses[n.id] = ids(n, 'data-uses').filter(function (d) { return byId[d]; });
    needs[n.id].forEach(function (d) { neededBy[d].push(n.id); });
    uses[n.id].forEach(function (d) { usedBy[d].push(n.id); });
  });

  function walk(id, next) {
    var seen = map(), stack = next[id].slice();
    while (stack.length) {
      var k = stack.pop();
      if (seen[k]) continue;
      seen[k] = true;
      stack.push.apply(stack, next[k]);
    }
    return seen;
  }

  // ---- edges ---------------------------------------------------------------
  var hard = [];           // {from, to, el}
  var softEls = [];

  function el(name, attrs) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function defs() {
    var d = el('defs', {});
    [['tree-arrow', 'tree__arrow'], ['tree-arrow-hi', 'tree__arrow tree__arrow--hi']].forEach(function (m) {
      var mk = el('marker', { id: m[0], viewBox: '0 0 8 8', refX: '7', refY: '4',
                              markerWidth: '7', markerHeight: '7', orient: 'auto',
                              markerUnits: 'userSpaceOnUse' });
      mk.appendChild(el('path', { d: 'M0,0 L8,4 L0,8 z', 'class': m[1] }));
      d.appendChild(mk);
    });
    return d;
  }

  // Edges meet the title block, not the middle of the card. A card grows when
  // its details open, and its centre would drift down into the body text.
  function box(id) {
    var r = byId[id].querySelector('.tb').getBoundingClientRect();
    var s = scroller.getBoundingClientRect();
    var x = scroller.scrollLeft - s.left, y = scroller.scrollTop - s.top;
    return { left: r.left + x, right: r.right + x, cy: r.top + y + r.height / 2 };
  }

  function curve(a, b) {
    var x1, x2, s1, s2, room = gutter();
    if (b.left >= a.right)      { x1 = a.right; x2 = b.left;  s1 = 1;  s2 = 1;  }
    else if (b.right <= a.left) { x1 = a.left;  x2 = b.right; s1 = -1; s2 = -1; }
    // Same column: a loop out into the gutter and back. The last column has
    // no gutter on its right, so its loops bend left, into the gap before it,
    // which the standalone rule halves.
    else if (a.right + room > scroller.scrollWidth - 1) {
      x1 = a.left; x2 = b.left; s1 = -1; s2 = 1; room /= 2;
    }
    else                        { x1 = a.right; x2 = b.right; s1 = 1;  s2 = -1; }
    x2 -= s2;                   // stop a pixel short so the arrowhead meets the border
    var d = Math.max(32, 0.45 * Math.abs(x2 - x1));
    // A loop bulges .75d out. Kept inside its gutter, or it runs under the next
    // column's cards and reads as edges into them.
    if (s1 !== s2) d = Math.min(Math.max(d, 0.25 * Math.abs(b.cy - a.cy)), room / 0.75 - 8);
    return 'M' + x1 + ' ' + a.cy + ' C' + (x1 + s1 * d) + ' ' + a.cy + ', '
         + (x2 - s2 * d) + ' ' + b.cy + ', ' + x2 + ' ' + b.cy;
  }

  function gutter() {
    return parseFloat(getComputedStyle(tree.querySelector('.tree__cols')).columnGap) || 48;
  }

  function drawEdges() {
    raf = 0;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    hard = []; softEls = [];
    // collapse the layer before measuring: sized to scrollWidth, it is part of
    // scrollWidth, so otherwise it could only ever grow
    svg.setAttribute('width', 0);
    svg.setAttribute('height', 0);
    if (!wide.matches) {            // stacked below 1100px: no columns to connect
      trace(current);               // ...and nothing to trace, so clear what was lit
      return;
    }
    svg.setAttribute('width', scroller.scrollWidth);
    svg.setAttribute('height', scroller.scrollHeight);
    svg.appendChild(defs());
    nodes.forEach(function (n) {
      needs[n.id].forEach(function (from) {
        var p = el('path', { 'class': 'tree__edge', d: curve(box(from), box(n.id)),
                             'data-from': from, 'data-to': n.id });
        svg.appendChild(p);
        hard.push({ from: from, to: n.id, el: p });
      });
    });
    trace(current);
  }
  var raf = 0;
  function redraw() { if (!raf) raf = requestAnimationFrame(drawEdges); }

  // ---- tracing --------------------------------------------------------------
  // Three things can ask for a card to be lit, most recent intent first: the
  // pointer, the keyboard, and a card chosen by #link. Kept apart so that one
  // letting go hands back to the next, rather than clearing everything.
  var hovered = null, focused = null, sticky = null;
  var current = null;      // what is lit now

  function relight() { trace(hovered || focused || sticky); }

  function trace(id) {
    current = id || null;
    softEls.forEach(function (s) { s.remove(); });
    softEls = [];
    // Stacked, there are no edges to follow, and dimming every other card in a
    // long list only fades the page (on touch it stays faded until the next tap).
    if (!current || !wide.matches) {
      nodes.forEach(function (n) { n.classList.remove('is-focus', 'is-related', 'is-dim'); });
      hard.forEach(function (e) { e.el.classList.remove('is-hi', 'is-dim'); });
      return;
    }
    var anc = walk(id, needs), desc = walk(id, neededBy), soft = map();
    uses[id].forEach(function (k) { soft[k] = true; });
    usedBy[id].forEach(function (k) { soft[k] = true; });
    nodes.forEach(function (n) {
      var rel = anc[n.id] || desc[n.id] || soft[n.id];
      n.classList.toggle('is-focus', n.id === id);
      n.classList.toggle('is-related', !!rel && n.id !== id);
      n.classList.toggle('is-dim', !rel && n.id !== id);
    });
    // an edge is lit when it lies on a chain through the focused card
    hard.forEach(function (e) {
      var up = anc[e.from] && (e.to === id || anc[e.to]);
      var down = desc[e.to] && (e.from === id || desc[e.from]);
      e.el.classList.toggle('is-hi', !!(up || down));
      e.el.classList.toggle('is-dim', !(up || down));
    });
    // soft edges exist only while one of their ends is focused
    if (wide.matches && svg.firstChild) {
      uses[id].forEach(function (k) { addSoft(k, id); });
      usedBy[id].forEach(function (k) { addSoft(id, k); });
    }
  }
  function addSoft(from, to) {
    var p = el('path', { 'class': 'tree__edge tree__edge--soft', d: curve(box(from), box(to)) });
    svg.appendChild(p);
    softEls.push(p);
  }

  function nodeOf(t) { return t && t.closest ? t.closest('.node') : null; }

  // a hand-typed or truncated hash can be malformed percent-encoding, which
  // decodeURIComponent throws on; that should select nothing, not stop the page
  function idOf(hash) {
    try { return decodeURIComponent(hash.replace(/^#/, '')); } catch (e) { return ''; }
  }

  // (hover: hover) so the mouse events a touch screen invents on a tap do not
  // start a trace that nothing will end
  nodes.forEach(function (n) {
    n.addEventListener('mouseenter', function () { if (hover.matches) { hovered = n.id; relight(); } });
    n.addEventListener('mouseleave', function () { if (hovered === n.id) { hovered = null; relight(); } });
  });
  // Focus from a mouse click (Chrome focuses a clicked <summary>) is not the
  // keyboard's intent and would outlast the pointer, so only :focus-visible
  // focus counts. Keyboard focus is the newest intent and takes over from a
  // pointer that happens to rest on another card.
  function keyboard(t) {
    try { return t.matches(':focus-visible'); } catch (e) { return true; }
  }
  tree.addEventListener('focusin', function (e) {
    var n = nodeOf(e.target);
    if (!n) return;
    focused = keyboard(e.target) ? n.id : null;
    if (focused) hovered = null;
    relight();
  });
  tree.addEventListener('focusout', function (e) {
    if (!nodeOf(e.relatedTarget)) { focused = null; relight(); }
  });

  // ---- choosing a card: #links, the title block, back and forward ----------
  function select(id, scroll) {
    var n = byId[id];
    if (!n) return;
    var d = n.querySelector('.node__more');
    if (d && !d.open) d.open = true;
    mark(id);
    // the choice is the most recent intent, so it wins over a resting pointer
    hovered = null;
    relight();
    if (scroll) {
      n.scrollIntoView({ block: 'nearest', inline: 'nearest',
                         behavior: reduce.matches ? 'auto' : 'smooth' });
      // move the keyboard to where the eye went, as a real fragment jump would
      var a = n.querySelector('.tb__name a');
      if (a) a.focus({ preventScroll: true });
    }
  }
  // the chosen card's ring; :target cannot do it, since pushState never moves it
  function mark(id) {
    if (sticky && byId[sticky]) byId[sticky].classList.remove('is-sticky');
    sticky = id || null;
    if (sticky) byId[sticky].classList.add('is-sticky');
  }
  function release() {
    mark(null);
    relight();
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  tree.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    // a modified click means a new tab or window: leave it to the browser, and
    // the new page selects the card from its hash
    if (a && !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
      var id = idOf(a.getAttribute('href'));
      if (byId[id]) {
        e.preventDefault();
        if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
        select(id, true);
        return;
      }
    }
    if (!nodeOf(e.target) && sticky) release();
  });
  document.addEventListener('click', function (e) {
    if (sticky && !tree.contains(e.target)) release();
  });
  // Esc lets go of the keyboard's card too: after a #link the focus sits in the
  // chosen card, and without this Esc would seem to do nothing
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && (sticky || focused)) { focused = null; release(); }
  });
  addEventListener('popstate', function () {
    var id = idOf(location.hash);
    if (byId[id]) select(id, true);
    else { if (focused === sticky) focused = null; mark(null); relight(); }
  });

  // ---- keeping the edges on the cards --------------------------------------
  // `toggle` does not bubble, so listen in the capture phase. A ResizeObserver
  // rather than a window resize listener, because a column changes height when
  // any card in it opens, and a viewport can change without `resize` firing.
  tree.addEventListener('toggle', redraw, true);
  if ('ResizeObserver' in window) new ResizeObserver(redraw).observe(tree.querySelector('.tree__cols'));
  else addEventListener('resize', redraw);
  if (wide.addEventListener) wide.addEventListener('change', redraw);
  if (hover.addEventListener) hover.addEventListener('change', function () { hovered = null; relight(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);

  // paper gets every card open; the screen gets back what it had
  var opened = [];
  addEventListener('beforeprint', function () {
    opened = [];
    tree.querySelectorAll('.node__more:not([open])').forEach(function (d) { d.open = true; opened.push(d); });
  });
  addEventListener('afterprint', function () {
    opened.forEach(function (d) { d.open = false; });
    opened = [];
  });

  drawEdges();
  var first = idOf(location.hash);
  if (byId[first]) select(first, true);
})();
