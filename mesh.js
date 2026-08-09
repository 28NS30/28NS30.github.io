/* ---------------------------------------------------------------------------
   Geometry in the page.

   Renders a real exported part as technical illustration: flat tone quantised
   to three palette steps, with drawn feature edges over the top. No lighting
   model beyond a single direction, because this is a drawing, not a render.

   Turning it is the point of the view you opened, so this one does orbit — but
   it is not a "3D viewer": no gizmo, no grid, no axis cross, no reset button,
   nothing that belongs to a CAD window. Drag to turn, let go and it coasts to a
   stop. Idle is STILL. Nothing spins on its own, and when it has settled the
   render loop stops entirely rather than burning a frame on an unchanged image.

   Attach with:
     <canvas data-mesh="assets/models/foo.mesh"
             data-mesh-replaces="#the-static-stand-in"></canvas>

   Falls back silently: if WebGL2 or the fetch fails this never runs and the
   markup already on the page stays exactly as it is. On success it emits a
   `mesh:ready` CustomEvent carrying the counts and bounds, so a page can print
   real numbers beside the part without this file knowing any page's markup.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var VS = `#version 300 es
in vec3 aPos;
uniform mat4 uMVP;
out vec3 vObj;
void main(){ vObj = aPos; gl_Position = uMVP * vec4(aPos, 1.0); }`;

  var FS_FILL = `#version 300 es
precision highp float;
in vec3 vObj;
uniform mat3 uNM;
uniform vec3 uT1, uT2, uT3;
out vec4 fragColor;
void main(){
  // flat facet normal from screen-space derivatives, so no normals are stored
  vec3 n = normalize(uNM * normalize(cross(dFdx(vObj), dFdy(vObj))));
  float d = dot(n, normalize(vec3(0.35, 0.55, 0.75))) * 0.5 + 0.5;
  vec3 c = d < 0.52 ? uT3 : (d < 0.78 ? uT2 : uT1);
  fragColor = vec4(c, 1.0);
}`;

  var FS_LINE = `#version 300 es
precision highp float;
uniform vec3 uInk;
out vec4 fragColor;
void main(){ fragColor = vec4(uInk, 1.0); }`;

  // ---- tiny matrix helpers (column-major, as WebGL wants) -------------------
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
  }
  function rotY(a){ var c=Math.cos(a), s=Math.sin(a); return [c,0,-s, 0,1,0, s,0,c]; }
  function rotX(a){ var c=Math.cos(a), s=Math.sin(a); return [1,0,0, 0,c,s, 0,-s,c]; }
  function mul3(a,b){
    var o=new Array(9);
    for(var i=0;i<3;i++)for(var j=0;j<3;j++){
      o[i*3+j]=a[0*3+j]*b[i*3+0]+a[1*3+j]*b[i*3+1]+a[2*3+j]*b[i*3+2];
    }
    return o;
  }
  function mvp(proj, rot, dist){
    // view is a pure translation down -Z, so fold it in by hand
    var m=[rot[0],rot[1],rot[2],0, rot[3],rot[4],rot[5],0, rot[6],rot[7],rot[8],0, 0,0,-dist,1];
    var o=new Array(16);
    for(var i=0;i<4;i++)for(var j=0;j<4;j++){
      var s=0; for(var k=0;k<4;k++) s+=proj[k*4+j]*m[i*4+k];
      o[i*4+j]=s;
    }
    return o;
  }

  /* Gram-Schmidt on the three columns. Orientation is accumulated by repeated
     multiplication, and float error would otherwise creep in until the part
     visibly skewed and scaled after a few thousand increments. */
  function orthonormalise(m) {
    var ax=m[0], ay=m[1], az=m[2], bx=m[3], by=m[4], bz=m[5];
    var l = Math.hypot(ax,ay,az) || 1; ax/=l; ay/=l; az/=l;
    var d = ax*bx + ay*by + az*bz;
    bx -= ax*d; by -= ay*d; bz -= az*d;
    l = Math.hypot(bx,by,bz) || 1; bx/=l; by/=l; bz/=l;
    return [ax,ay,az, bx,by,bz, ay*bz-az*by, az*bx-ax*bz, ax*by-ay*bx];
  }

  function cssColour(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    var m = /^#?([0-9a-f]{6})$/i.exec(v);
    if (!m) return fallback;
    var n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  function parse(buf) {
    var dv = new DataView(buf);
    if (String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3)) !== 'NSM2')
      throw new Error('not an NSM2 mesh');
    var vc = dv.getUint32(4, true), ic = dv.getUint32(8, true), ec = dv.getUint32(12, true);
    var lo = [dv.getFloat32(16, true), dv.getFloat32(20, true), dv.getFloat32(24, true)];
    var hi = [dv.getFloat32(28, true), dv.getFloat32(32, true), dv.getFloat32(36, true)];
    var o = 40;
    var verts = new Float32Array(buf, o, vc * 3); o += vc * 12;
    var Arr = vc > 65535 ? Uint32Array : Uint16Array, w = vc > 65535 ? 4 : 2;
    var tris = new Arr(buf, o, ic); o += ic * w;
    var edges = new Arr(buf, o, ec);
    return { verts: verts, tris: tris, edges: edges, wide: vc > 65535, lo: lo, hi: hi };
  }

  function program(gl, vsrc, fsrc) {
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsrc));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  /* Say why, out loud.
     This used to end in `.catch(function () {})` — a bare swallow. When the
     part did not appear there was nothing in the console, nothing on the page,
     and no way to tell a missing file from a missing GPU from a blocked fetch.
     The pending panel is still the fallback; it just states the reason now. */
  function fail(canvas, reason, detail) {
    var well = canvas.closest('.fig-well') || canvas.parentElement;
    if (well) well.setAttribute('data-mesh-error', reason);
    var panel = well && well.querySelector('.fig--pending');
    if (panel && !panel.querySelector('.fig__why')) {
      var why = document.createElement('small');
      why.className = 'fig__why';
      why.textContent = reason;
      panel.appendChild(why);
    }
    console.warn('[mesh] ' + canvas.dataset.mesh + ' — ' + reason,
                 detail || '');
  }

  function mount(canvas) {
    // preserveDrawingBuffer so the part survives to paper. Without it the
    // buffer may be cleared once composited, and since this renderer is idle by
    // design there is no frame in flight when the print snapshot is taken — the
    // figure printed blank. The cost is a copy per drawn frame, and frames are
    // only drawn while someone is actually turning it.
    var gl = canvas.getContext('webgl2',
      { antialias: true, alpha: true, preserveDrawingBuffer: true });
    if (!gl) { fail(canvas, 'This browser has no WebGL2, so the part cannot be drawn.'); return; }

    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Orientation is a matrix, not a yaw/pitch pair. Euler angles need a
    // clamp near the poles or the part flips and the drag direction inverts;
    // accumulating the rotation instead means there is no pole and no limit —
    // it tumbles freely, forever, in any direction.
    // The opening pose is a three-quarter view, the angle a part is shown at in
    // a drawing, so it reads as considered rather than as a default.
    var state = { R: mul3(rotY(-0.62), rotX(0.42)),
                  vYaw: 0, vPitch: 0, ready: false };

    // Apply an increment about the SCREEN axes. Pre-multiplying puts it outside
    // the current orientation, which is what keeps the drag matching the cursor
    // however the part is already turned.
    function spin(dYaw, dPitch) {
      if (!dYaw && !dPitch) return;
      state.R = orthonormalise(mul3(mul3(rotX(dPitch), rotY(dYaw)), state.R));
    }
    var fill, line, vao, ebo, mesh;

    var FOVY        = 0.72;              // radians
    var dist        = 2.15;              // replaced by a real fit once loaded
    var DRAG_GAIN   = 0.0072;            // radians per CSS pixel
    var FRICTION    = 0.94;              // per frame after release
    var STOP        = 0.00025;           // below this it has stopped

    fetch(canvas.dataset.mesh).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + canvas.dataset.mesh);
      return r.arrayBuffer();
    }).then(function (buf) {
      mesh = parse(buf);
      fill = program(gl, VS, FS_FILL);
      line = program(gl, VS, FS_LINE);

      // One shared vertex buffer, but a VAO each for triangles and edges.
      // A VAO captures the ELEMENT_ARRAY_BUFFER binding, so swapping index
      // buffers inside a single VAO would leave the edge indices bound and the
      // next frame would draw triangles through them.
      var vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.STATIC_DRAW);

      function makeVao(indices) {
        var a = gl.createVertexArray();
        gl.bindVertexArray(a);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        var ib = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        return a;
      }
      vao = makeVao(mesh.tris);
      ebo = makeVao(mesh.edges);

      // Fit the camera to the geometry rather than to a guessed distance. The
      // bounding SPHERE is the right measure because the part turns: fitting the
      // bounding box would frame it well at the opening pose and clip it as soon
      // as anyone rotated to a corner-on view.
      //
      // sin, not tan. A sphere of radius r at distance d subtends asin(r/d) —
      // its silhouette is where the view ray is TANGENT to the sphere, which is
      // nearer the camera than its centre. Dividing by tan made the fit about
      // 0.8% too tight; under the old pitch clamp that never showed, but once
      // the part could tumble freely it touched the edge at some poses.
      var r2 = 0;
      for (var i = 0; i < mesh.verts.length; i += 3) {
        var d2 = mesh.verts[i]*mesh.verts[i] + mesh.verts[i+1]*mesh.verts[i+1]
               + mesh.verts[i+2]*mesh.verts[i+2];
        if (d2 > r2) r2 = d2;
      }
      dist = Math.sqrt(r2) / Math.sin(FOVY / 2) * 1.06;

      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);

      // Retire whatever stood in for the part. Which markup that is belongs to
      // the page, not to this file — an earlier version hid the motor readout
      // by class name from inside the generic renderer, which only worked on
      // one page and was wrong on every other.
      var sel = canvas.dataset.meshReplaces || '[data-mesh-fallback]';
      document.querySelectorAll(sel).forEach(function (el) {
        // setAttribute, not .hidden: `hidden` is an HTMLElement property, so
        // `svgEl.hidden = true` silently sets a JS expando on an SVG element
        // and never creates the attribute.
        el.setAttribute('hidden', '');
      });
      canvas.removeAttribute('hidden');

      state.ready = true;
      resize(); draw();

      canvas.dispatchEvent(new CustomEvent('mesh:ready', {
        bubbles: true,
        detail: {
          triangles: mesh.tris.length / 3,
          vertices: mesh.verts.length / 3,
          edges: mesh.edges.length / 2,
          lo: mesh.lo, hi: mesh.hi,
          extent: [mesh.hi[0] - mesh.lo[0], mesh.hi[1] - mesh.lo[1], mesh.hi[2] - mesh.lo[2]],
          bytes: buf.byteLength
        }
      }));
    }).catch(function (err) {
      // The common one by far: opening the page as a file:// document. Browsers
      // treat every local file as a separate opaque origin, so fetch is refused
      // and the geometry never arrives. Nothing is wrong with the export.
      //
      // Only blame the protocol when fetch itself rejected (a TypeError). A 404
      // served from a file:// page is still a missing file, and saying
      // otherwise would send someone chasing the wrong problem.
      var blocked = location.protocol === 'file:' && err instanceof TypeError;
      var reason = blocked
        ? 'Geometry cannot load from a file:// page — serve the folder over http '
          + '(python3 -m http.server 8000) and it will appear.'
        : 'Geometry failed to load: ' + (err && err.message ? err.message : err);
      fail(canvas, reason, err);
    });

    function resize() {
      var dpr = Math.min(devicePixelRatio || 1, 2);
      var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (w && h && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w; canvas.height = h;
      }
    }

    function draw() {
      if (!state.ready || !canvas.clientWidth) return;
      resize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var rot = state.R;
      var proj = perspective(FOVY, canvas.width / canvas.height, 0.1, 20);
      var M = mvp(proj, rot, dist);

      // Order the three tones by LUMINANCE, not by token name. The dark theme
      // is not an inversion of the light one: --film is the lightest token on
      // paper and the darkest in the dark field, so binding the lit face to
      // --film shaded the part correctly on paper and backwards at night —
      // surfaces facing the light came out darkest. Sorting makes the ramp mean
      // the same thing in both themes.
      var tones = [
        cssColour('--film',   [.90,.91,.90]),
        cssColour('--film-2', [.86,.88,.86]),
        cssColour('--film-3', [.82,.84,.82])
      ].sort(function (a, b) {
        return (b[0]*.2126 + b[1]*.7152 + b[2]*.0722) -
               (a[0]*.2126 + a[1]*.7152 + a[2]*.0722);
      });
      var t1 = tones[0], t2 = tones[1], t3 = tones[2];   // lit, mid, unlit
      var ink = cssColour('--ink',   [.08,.10,.09]);

      gl.bindVertexArray(vao);
      gl.useProgram(fill);
      gl.uniformMatrix4fv(gl.getUniformLocation(fill, 'uMVP'), false, new Float32Array(M));
      gl.uniformMatrix3fv(gl.getUniformLocation(fill, 'uNM'), false, new Float32Array(rot));
      gl.uniform3fv(gl.getUniformLocation(fill, 'uT1'), t1);
      gl.uniform3fv(gl.getUniformLocation(fill, 'uT2'), t2);
      gl.uniform3fv(gl.getUniformLocation(fill, 'uT3'), t3);
      // push the fill back so the drawn edges are not z-fighting it
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.2, 1.2);
      gl.drawElements(gl.TRIANGLES, mesh.tris.length, mesh.wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);

      gl.bindVertexArray(ebo);
      gl.useProgram(line);
      gl.uniformMatrix4fv(gl.getUniformLocation(line, 'uMVP'), false, new Float32Array(M));
      gl.uniform3fv(gl.getUniformLocation(line, 'uInk'), ink);
      gl.drawElements(gl.LINES, mesh.edges.length, mesh.wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);

      gl.bindVertexArray(null);
    }

    // ---- the loop only exists while something is actually moving ------------
    // No idle animation means no reason to hold a rAF open. The loop starts on
    // input and ends itself once the part has coasted to a stop.
    var raf = 0, visible = true;
    function wake() {
      if (raf || reduce || !visible) return;
      raf = requestAnimationFrame(step);
    }
    function step() {
      raf = 0;
      if (!dragging) {
        spin(state.vYaw, state.vPitch);
        state.vYaw   *= FRICTION;
        state.vPitch *= FRICTION;
        if (Math.abs(state.vYaw) < STOP && Math.abs(state.vPitch) < STOP) {
          state.vYaw = state.vPitch = 0;
          draw();
          return;                       // settled: stop scheduling frames
        }
      }
      draw();
      wake();
    }

    // ---- drag ---------------------------------------------------------------
    var dragging = false, lastX = 0, lastY = 0, moved = 0;

    canvas.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragging = true; moved = 0;
      lastX = e.clientX; lastY = e.clientY;
      state.vYaw = state.vPitch = 0;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('is-turning');
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      spin(dx * DRAG_GAIN, dy * DRAG_GAIN);
      // Smoothed, so the throw comes from the gesture rather than from whichever
      // single event happened to be last before release.
      state.vYaw   = state.vYaw   * 0.6 + dx * DRAG_GAIN * 0.4;
      state.vPitch = state.vPitch * 0.6 + dy * DRAG_GAIN * 0.4;
      if (reduce) draw(); else wake();
    });

    function release(e) {
      if (!dragging) return;
      dragging = false;
      canvas.classList.remove('is-turning');
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
      wake();                            // coast down
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    // ---- keyboard -----------------------------------------------------------
    // Draws synchronously rather than waking the loop, because under reduced
    // motion there is no loop to wake and the keys would otherwise do nothing.
    canvas.addEventListener('keydown', function (e) {
      var s = e.shiftKey ? 0.35 : 0.12, used = true;
      if (e.key === 'ArrowLeft')       spin(-s, 0);
      else if (e.key === 'ArrowRight') spin( s, 0);
      else if (e.key === 'ArrowUp')    spin(0, -s);
      else if (e.key === 'ArrowDown')  spin(0,  s);
      else used = false;
      if (!used) return;
      e.preventDefault();
      state.vYaw = state.vPitch = 0;
      draw();
    });

    addEventListener('resize', function () { resize(); draw(); }, { passive: true });
    // The part paints its own pixels from the CSS tokens, so it has to be told
    // when they change. The media query only covers the system flipping; a
    // manual choice in the masthead never fires it, and the part would keep the
    // old theme's tones on a page that had already switched.
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { draw(); });
    document.addEventListener('themechange', function () { draw(); });

    // Off screen or in a background tab, stop scheduling frames. Note this only
    // pauses motion — the last drawn image stays on the canvas either way.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) wake();
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', function () {
      visible = !document.hidden;
      if (visible) wake();
    });
  }

  document.querySelectorAll('canvas[data-mesh]').forEach(mount);
})();
