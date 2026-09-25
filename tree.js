/* ---------------------------------------------------------------------------
   The graph: tracing, the title-block panel, the keyboard, and on the Work
   page the switch between the grid and the graph.

   gen_tree.py bakes the whole figure into the page -- every circle, line and
   name is already placed -- so with script off the drawing still reads and every
   circle is a link to its card in the parts list. This adds what only a script
   can: hovering or focusing a project lights everything it depends on and
   everything that depends on it; choosing one puts its title block in the panel
   beside the drawing; and the drawing is one stop in the tab order, walked with
   the arrow keys the way a tree view is.

   The Work page shows one view at a time. The address says which: #graph, or
   the #id of anything in the graph, is the graph; no fragment is the grid. The
   switch writes it with replaceState, so it survives a reload and a trip to a
   project page and back without adding a step to Back.

   The markup is the data: each card carries data-needs (hard) and data-uses
   (soft) as space-separated ids. Nothing is fetched and nothing is stored.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';
  if (!document.documentElement.classList.contains('js')) return;

  var tt = document.querySelector('.tt');
  if (!tt) return;
  var svg = tt.querySelector('.tt__svg');
  var panel = tt.querySelector('.tt__panel');
  var status = tt.querySelector('.tt__status');
  var hint = panel ? panel.innerHTML : '';
  var wide = matchMedia('(min-width: 700px)');           // room to trace a chain
  // room for the panel: the Work page's small graph keeps it in the column
  // On the Work page the panel is always there -- beside the drawing where it
  // fits, under it where it does not -- because there are no cards to go to.
  var onWork = !!tt.closest('.work');
  var roomy = matchMedia(onWork ? 'all' : tt.classList.contains('tt--compact') ? '(min-width: 1100px)' : '(min-width: 1400px)');
  var hover = matchMedia('(hover: hover)');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // ---- the graph, read from the cards ---------------------------------------
  // no prototype, so a hash like #constructor finds nothing rather than a function
  function map() { return Object.create(null); }
  var cards = map(), circles = map(), needs = map(), uses = map(), neededBy = map(), usedBy = map();
  var order = [].slice.call(svg.querySelectorAll('.tt__node'));     // ring by ring, clockwise
  order.forEach(function (a) { circles[a.getAttribute('data-id')] = a; });
  [].slice.call(document.querySelectorAll('.tree .node')).forEach(function (c) {
    cards[c.id] = c; neededBy[c.id] = []; usedBy[c.id] = [];
  });
  function ids(el, attr) { return (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean); }
  Object.keys(cards).forEach(function (id) {
    needs[id] = ids(cards[id], 'data-needs').filter(function (d) { return cards[d]; });
    uses[id] = ids(cards[id], 'data-uses').filter(function (d) { return cards[d]; });
    needs[id].forEach(function (d) { neededBy[d].push(id); });
    uses[id].forEach(function (d) { usedBy[d].push(id); });
  });
  var lines = [].slice.call(svg.querySelectorAll('.tt__edge'));
  // the wipe is the drawing's first appearance; showing it again (the Work
  // page's switch) must not replay it, or the circles cannot be clicked while it runs
  svg.addEventListener('animationend', function () { tt.classList.add('is-drawn'); });
  var softs = [].slice.call(svg.querySelectorAll('.tt__soft'));

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

  // ---- grid or graph (the Work page) -------------------------------------------
  var work = tt.closest('.work');
  var graphView = work && work.querySelector('.work__graph');
  var switcher = work && work.querySelector('.view');
  function inGraph() { return !!(work && work.classList.contains('is-graph')); }
  // what a fragment asks for: 'graph', 'grid', or null for neither (#index, #body)
  function wants(hash) {
    if (!work) return null;
    var id = idOf(hash);
    if (!id) return 'grid';
    var t = document.getElementById(id);
    if (!t) return null;
    if (graphView.contains(t)) return 'graph';
    return t.closest('.index') ? 'grid' : null;
  }
  function show(view) {
    if (!work) return;
    var graph = view === 'graph';
    work.classList.toggle('is-graph', graph);
    [].slice.call(switcher.querySelectorAll('.view__btn')).forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === view));
    });
    if (!graph && sticky) clear();
  }
  // Back or Forward can hide the view the focus was in: hand it to the view
  // now showing -- the project it came from if that has a place there, else
  // the pressed button -- or the next Tab starts from a hidden element
  function settle(from) {
    var a = document.activeElement;
    if (a && a !== document.body && !(inGraph() ? work.querySelector('.index') : graphView).contains(a)) return;
    var to = inGraph() ? circles[idOf(location.hash)] || circles[from]
                       : from && window.CSS && work.querySelector('.index a[href="#' + CSS.escape(from) + '"]');
    (to || switcher.querySelector('[aria-pressed="true"]')).focus({ preventScroll: true });
  }
  if (switcher) {
    switcher.hidden = false;
    // the views are one at a time only from here: if this never ran, both stand
    work.classList.add('has-view');
    show(inGraph() ? 'graph' : 'grid');
    switcher.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.view__btn');
      if (!b || b.getAttribute('aria-pressed') === 'true') return;
      var view = b.getAttribute('data-view');
      show(view);
      if (wants(location.hash) === view) return;
      // At rest (no project in the address) the switch rewrites the entry, so
      // Back does not step through views. An entry that names a project is
      // kept, with the switch as a new step after it, or Back would land on a
      // copy of the page it is already on.
      var url = location.pathname + location.search + (view === 'graph' ? '#graph' : '');
      if (location.hash && location.hash !== '#graph') history.pushState(null, '', url);
      else history.replaceState(null, '', url);
    });
  }

  // ---- tracing -----------------------------------------------------------------
  // Three things can ask for a project to be lit, most recent intent first: the
  // pointer, the keyboard, and a project chosen. Kept apart so that one letting
  // go hands back to the next rather than clearing everything.
  var hovered = null, focused = null, sticky = null;

  function relight() { trace(hovered || focused || sticky); }

  function trace(id) {
    var on = !!(id && wide.matches && cards[id]);
    tt.classList.toggle('is-tracing', on);
    var anc = on ? walk(id, needs) : map(), desc = on ? walk(id, neededBy) : map(), near = map();
    if (on) {
      uses[id].forEach(function (k) { near[k] = true; });
      usedBy[id].forEach(function (k) { near[k] = true; });
    }
    order.forEach(function (a) {
      var k = a.getAttribute('data-id');
      a.classList.toggle('is-focus', on && k === id);
      a.classList.toggle('is-related', on && k !== id && !!(anc[k] || desc[k] || near[k]));
    });
    // a line is lit when it lies on a chain through the chosen project; a spoke
    // from the hub is lit when the chain reaches back to it
    lines.forEach(function (p) {
      var from = p.getAttribute('data-from'), to = p.getAttribute('data-to'), hi = false;
      if (on) {
        if (!from) hi = to === id ? !needs[id].length : !!(anc[to] && !needs[to].length);
        else hi = !!((anc[from] && (to === id || anc[to])) || (desc[to] && (from === id || desc[from])));
      }
      p.classList.toggle('is-hi', hi);
    });
    softs.forEach(function (p) {
      p.classList.toggle('is-shown', on && (p.getAttribute('data-from') === id || p.getAttribute('data-to') === id));
    });
  }

  function nodeOf(t) {
    if (!t || !t.closest) return null;
    var a = t.closest('.tt__svg .tt__node');
    if (a) return a.getAttribute('data-id');
    var c = t.closest('.tree .node');
    return c ? c.id : null;
  }

  // (hover: hover): the mouse events a touch screen invents on a tap would
  // otherwise start a trace that nothing ends
  function enter(e) { if (hover.matches) { hovered = nodeOf(e.currentTarget); relight(); } }
  function leave(e) { if (hovered === nodeOf(e.currentTarget)) { hovered = null; relight(); } }
  order.concat(Object.keys(cards).map(function (k) { return cards[k]; })).forEach(function (el) {
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mouseleave', leave);
  });

  // Focus from a mouse click is not the keyboard's intent and would outlast
  // the pointer, so only :focus-visible focus counts, and it is the newest.
  function keyboard(t) { try { return t.matches(':focus-visible'); } catch (e) { return true; } }
  document.addEventListener('focusin', function (e) {
    // the one tab stop follows focus however it arrived (a click, a link)
    var c = e.target.closest && e.target.closest('.tt__svg .tt__node');
    if (c && c !== current) rove(c, false);
    var id = nodeOf(e.target);
    if (!id) return;
    focused = keyboard(e.target) ? id : null;
    if (focused) hovered = null;
    relight();
  });
  document.addEventListener('focusout', function (e) {
    if (!nodeOf(e.relatedTarget)) { focused = null; relight(); }
  });

  // ---- choosing a project -------------------------------------------------------------
  function mark(id) {
    if (sticky && circles[sticky]) { circles[sticky].classList.remove('is-sticky'); circles[sticky].removeAttribute('aria-current'); }
    if (sticky && cards[sticky]) cards[sticky].classList.remove('is-sticky');
    sticky = id || null;
    if (sticky && circles[sticky]) { circles[sticky].classList.add('is-sticky'); circles[sticky].setAttribute('aria-current', 'true'); }
    if (sticky && cards[sticky]) cards[sticky].classList.add('is-sticky');
  }

  // focus back on a circle, and the circle in view: preventScroll alone could
  // leave the keyboard somewhere the eye is not
  function refocus(a) {
    if (!a) return;
    a.focus({ preventScroll: true });
    // under the drawing, the panel is what is being read: it stays in view
    if (below()) reveal();
    else a.scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' });
  }

  function fill(id) {
    if (!panel) return;
    var card = cards[id];
    if (!card) { panel.innerHTML = hint; return; }
    var out = document.createElement('div');
    var block = document.createElement('article');
    block.className = 'node';
    block.appendChild(card.querySelector('.tb').cloneNode(true));
    // the panel is for reading what a project is and where it stands: the
    // complexity scores stay on the card
    [].slice.call(block.querySelectorAll('.tb__cell')).forEach(function (cell) {
      var dt = cell.querySelector('dt');
      if (dt && /^complexity$/i.test(dt.textContent.trim())) cell.parentNode.removeChild(cell);
    });
    // the page's own h2 comes after the panel: the clone's title is a line, not a heading
    var head = block.querySelector('.tb__name');
    if (head) {
      var line = document.createElement('p');
      line.className = 'tb__name';
      // a title that links to its own card says so as plain text here
      var link = head.querySelector('a');
      if (link && link.getAttribute('href') === '#' + id) link.parentNode.replaceChild(document.createTextNode(link.textContent), link);
      while (head.firstChild) line.appendChild(head.firstChild);
      head.parentNode.replaceChild(line, head);
    }
    out.appendChild(block);
    // the first paragraph of the Summary, then what it needs and what needs it
    var body = card.querySelector('.node__body');
    var page = body && body.querySelector('.node__page a');
    var heads = body ? [].slice.call(body.querySelectorAll('.node__h')) : [];
    for (var k = 0; k < heads.length; k++) {
      if (/^summary$/i.test(heads[k].textContent.trim())) {
        // a project with no page of its own is read here in full
        var whole = onWork && !page;
        for (var p = heads[k].nextElementSibling; p && p.tagName === 'P'; p = whole ? p.nextElementSibling : null) {
          var sum = p.cloneNode(true);
          sum.className = 'tt__psum';
          out.appendChild(sum);
        }
        break;
      }
    }
    var rel = body && body.querySelector('.node__rel');
    if (rel) out.appendChild(rel.cloneNode(true));
    var go = document.createElement('p');
    go.className = 'tt__pgo';
    if (onWork) {
      // the detail is the project's own page, and the panel carries over into it
      if (page) {
        var to = document.createElement('a');
        to.href = page.getAttribute('href');
        to.className = 'tt__details';
        to.textContent = 'Details →';
        go.appendChild(to);
      }
    } else {
      var more = document.createElement('a');
      more.href = '#' + id;
      more.className = 'tt__details';
      more.textContent = 'Details ↓';
      go.appendChild(more);
      var titled = block.querySelector('.tb__name a');
      if (page && !(titled && titled.getAttribute('href') === page.getAttribute('href'))) go.appendChild(page.cloneNode(true));
    }
    if (go.firstChild) out.appendChild(go);
    panel.innerHTML = '';
    panel.appendChild(out);
  }

  function select(id, push) {
    if (!cards[id]) return;
    var had = panel && panel.contains(document.activeElement);
    mark(id);
    hovered = null;                 // the choice is the newest intent
    relight();
    if (circles[id]) rove(circles[id], false);
    if (roomy.matches) {
      fill(id);
      if (status) status.textContent = 'Selected: ' + (cards[id].querySelector('.tb__name') || {}).textContent;
      // rebuilding the panel under the focus would drop it to the page top
      if (had && circles[id]) refocus(circles[id]);
    }
    // entries the drawing makes are tagged: Back and Forward over them stay on
    // the drawing, while a #link in the parts list still goes to its card
    if (push && location.hash !== '#' + id) history.pushState({ tt: id }, '', '#' + id);
  }

  // under the drawing (a narrow screen), the panel is scrolled to where it can be read
  function below() {
    if (!onWork || !panel) return false;
    return panel.getBoundingClientRect().top >= tt.querySelector('.tt__fig').getBoundingClientRect().bottom - 1;
  }
  function reveal() {
    if (below()) panel.scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' });
  }
  // back from a project's page (the page is restored whole): the name is let go
  addEventListener('pageshow', function () {
    var block = panel && panel.querySelector('.node');
    if (block) block.style.viewTransitionName = '';
  });

  function clear() {
    var had = panel && panel.contains(document.activeElement), was = sticky;
    mark(null);
    focused = null;
    relight();
    if (panel) panel.innerHTML = hint;
    if (status) status.textContent = '';
    if (had && circles[was]) refocus(circles[was]);
  }

  function release() {
    clear();
    // at rest the Work page's address still says which view it is on
    var rest = inGraph() ? '#graph' : '';
    if (location.hash !== rest) history.replaceState(null, '', location.pathname + location.search + rest);
  }

  // ---- the keyboard: one tab stop, walked like a tree view ------------------------------
  var current = order[0];
  function rove(a, focus) {
    if (!a) return;
    order.forEach(function (x) { x.setAttribute('tabindex', x === a ? '0' : '-1'); });
    current = a;
    if (focus) a.focus();
  }
  rove(current, false);
  svg.addEventListener('keydown', function (e) {
    var a = e.target.closest && e.target.closest('.tt__node');
    if (!a) return;
    var k = order.indexOf(a), to = null, id = a.getAttribute('data-id');
    if (e.key === 'ArrowDown') to = order[Math.min(order.length - 1, k + 1)];
    else if (e.key === 'ArrowUp') to = order[Math.max(0, k - 1)];
    else if (e.key === 'Home') to = order[0];
    else if (e.key === 'End') to = order[order.length - 1];
    else if (e.key === 'ArrowRight') to = svg.querySelector('.tt__node[data-parent="' + id + '"]');
    else if (e.key === 'ArrowLeft') to = circles[a.getAttribute('data-parent')] || null;
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // type-ahead: the next project whose name starts with the letter
      var ch = e.key.toLowerCase();
      for (var j = 1; j <= order.length; j++) {
        var c = order[(k + j) % order.length];
        if ((c.getAttribute('data-short') || c.getAttribute('aria-label') || '').toLowerCase().charAt(0) === ch) { to = c; break; }
      }
    } else return;
    e.preventDefault();
    if (to) rove(to, true);
  });

  // ---- clicks ------------------------------------------------------------------------------
  document.addEventListener('click', function (e) {
    var t = e.target;
    var a = t.closest && t.closest('a[href]');
    // a modified click means a new tab or window: leave it to the browser
    if (a && (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
    var circle = t.closest && t.closest('.tt__svg .tt__node');
    if (circle) {
      var id = circle.getAttribute('data-id');
      if (roomy.matches) { e.preventDefault(); select(id, true); reveal(); }
      else mark(id);                 // the link goes on to its card, marked
      return;
    }
    // leaving for a project's page from the panel: the panel's title block
    // moves into the page's head (a cross-document view transition; the page's
    // .proj__head carries the same name), so the move reads as one piece
    if (a && onWork && panel && panel.contains(a) && (a.getAttribute('href') || '').charAt(0) !== '#') {
      var block = panel.querySelector('.node');
      if (block) block.style.viewTransitionName = 'head';
      return;
    }
    if (a && a.classList.contains('node__up')) {
      // back up to the drawing: land on the circle, ready for the arrow keys
      var id2 = (a.getAttribute('href') || '').replace(/^#fig-/, '');
      if (circles[id2]) {
        e.preventDefault();
        circles[id2].scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
        rove(circles[id2], false);
        circles[id2].focus({ preventScroll: true });
        select(id2, false);
      }
      return;
    }
    var h = a && a.getAttribute('href');
    if (a && work && !inGraph() && h && h.charAt(0) === '#' && cards[idOf(h)]) {
      // from the grid: the project's place in the graph, chosen there
      var id3 = idOf(h);
      show('graph');
      if (roomy.matches && circles[id3]) {
        e.preventDefault();
        select(id3, true);
        rove(circles[id3], false);
        circles[id3].focus({ preventScroll: true });
        circles[id3].scrollIntoView({ block: 'center', behavior: reduce.matches ? 'auto' : 'smooth' });
      } else {
        mark(id3);                   // the link goes on to its card, now shown
      }
      return;
    }
    if (a && a.classList.contains('tt__details') && cards[idOf(h)]) {
      e.preventDefault();
      var card = cards[idOf(h)], more = card.querySelector('.node__more');
      if (more) more.open = true;
      history.pushState(null, '', h);
      card.scrollIntoView({ block: 'start', behavior: reduce.matches ? 'auto' : 'smooth' });
      var into = card.querySelector('.node__more > summary') || card.querySelector('.tb__name a');
      if (into) into.focus({ preventScroll: true });
      return;
    }
    if (h && h.charAt(0) === '#' && cards[idOf(h)]) {
      // a project named in the panel moves the panel; one in the parts list
      // goes to its card as a link should, and stays marked there
      if (panel && panel.contains(a) && !a.classList.contains('tt__details') && roomy.matches) {
        e.preventDefault();
        select(idOf(h), true);
      } else {
        mark(idOf(h));
      }
      return;
    }
    if (sticky && !(t.closest && (t.closest('.tt__panel') || t.closest('.tree .node')))) release();
  });

  // a hand-typed or truncated hash can be malformed percent-encoding, which
  // decodeURIComponent throws on; that should select nothing, not stop the page
  function idOf(hash) {
    try { return decodeURIComponent(hash.replace(/^#/, '')); } catch (e) { return ''; }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && (sticky || focused)) release();
  });
  addEventListener('popstate', function (e) {
    var want = wants(location.hash), was = sticky;
    if (want) show(want);
    var id = idOf(location.hash);
    if (want) requestAnimationFrame(function () { settle(was); });
    if (!cards[id]) { clear(); return; }
    if ((onWork || (e.state && e.state.tt)) && roomy.matches) {
      select(id, false);
      if (circles[id]) requestAnimationFrame(function () { circles[id].scrollIntoView({ block: 'nearest' }); });
    } else {
      // a card's own entry: the browser has gone to the card; only mark it
      mark(id);
      relight();
      if (roomy.matches) fill(id);
    }
  });
  function media() {
    if (!wide.matches) hovered = null;
    if (roomy.matches && sticky) fill(sticky);
    relight();
  }
  [wide, roomy, hover].forEach(function (m) { if (m.addEventListener) m.addEventListener('change', media); });

  // paper gets every card open; the screen gets back what it had
  var opened = [];
  addEventListener('beforeprint', function () {
    opened = [];
    document.querySelectorAll('.tree .node__more:not([open])').forEach(function (d) { d.open = true; opened.push(d); });
  });
  addEventListener('afterprint', function () {
    opened.forEach(function (d) { d.open = false; });
    opened = [];
  });

  // A shared link to a project opens on the drawing where there is room to
  // show it beside the panel; elsewhere the browser has already gone to the
  // card, as a fragment link should.
  var first = idOf(location.hash);
  // a link into the cards the switch hides (#parts, say) lands on the graph
  var into = work && !cards[first] && first && document.getElementById(first);
  if (into && into.closest('.tree') && !into.getClientRects().length) {
    history.replaceState(null, '', location.pathname + location.search + '#graph');
    var arrive = function () { graphView.scrollIntoView(); };
    if (document.readyState === 'complete') arrive(); else addEventListener('load', arrive);
  }
  if (cards[first]) {
    select(first, false);
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var returning = nav && (nav.type === 'back_forward' || nav.type === 'reload');
    if (roomy.matches && circles[first] && !returning) {
      rove(circles[first], false);
      // after load: the browser's own jump to the fragment comes later than
      // this script and would otherwise win
      var land = function () {
        requestAnimationFrame(function () { circles[first].scrollIntoView({ block: 'center' }); });
      };
      if (document.readyState === 'complete') land(); else addEventListener('load', land);
    }
  }
})();
