# 28ns30.github.io — portfolio

Plain HTML and one CSS file. No build step, no framework, and **no third-party
requests**: open any `.html` in a browser and it works, offline included. IBM
Plex is self-hosted in `assets/fonts/` under the SIL Open Font License.

Light and dark are both first-class. The default is **Auto** — the page follows
the reader's machine — and the control in the masthead cycles Auto → Light →
Dark. A choice is stored and outranks the system on any device; clearing site
data returns you to Auto, because "no opinion" and "nothing stored" are the same
state on purpose.

The stored value is applied by a 133-byte blocking snippet in `<head>`, so the
right palette is in place for the first paint and nothing flashes. With no
script there is no control and the `prefers-color-scheme` media query does the
work on its own.

---

## Files

```
index.html         drawing index (homepage)
about.html         about
404.html           designed not-found sheet
p-bldc.html        E-01  brushless DC motor        ← written
p-cycloidal.html   M-01  cycloidal gearbox         ← stub
p-drone.html       C-01  quadrotor                 ← stub
p-shooter.html     M-02  FRC shooter subsystem     ← real geometry, write-up pending
p-drylab.html      B-01  iGEM dry lab              ← stub
p-umv.html         C-02  ultra-mobility vehicle    ← stub, leads the index
style.css          the whole design system
theme.js           the Auto / Light / Dark control
favicon.svg        theme-aware, light and dark
robots.txt
sitemap.xml
assets/og.png      1200×630 share card
assets/og.svg      source for og.png
assets/fonts/      IBM Plex, 4 files, 84 KB, OFL
assets/models/     exported geometry, NSM2 format
mesh.js            WebGL2 renderer for the exported parts
assets/            photographs go here
```

"Stub" means the page exists, is styled, and carries a **Write-up pending**
block. Nothing 404s. `p-bldc.html` is the structural template — copy its five
sections when writing a stub up properly.

---

## Placeholders

Anything rendered as `[N] N·m` is a `<span class="fill">` — blue, dotted
underline, impossible to miss. Each one is a number or a decision only you know.
When the last one is gone, that page is done.

```bash
grep -c 'class="fill"' *.html
```

---

## The five sections

| Heading | What it has to do |
|---|---|
| 01 Why build it | The constraint that made buying the part impossible. |
| 02 Design | The decisions, with the reasoning attached. Not a parts list. |
| 03 What went wrong | The failure and the diagnosis. |
| 04 Measured result | Numbers from a test you ran, not from a datasheet. |
| 05 Files | Link the CAD and the code. |

Section 03 carries the most weight. A page that only shows success reads as an
assembly log; a failure plus a diagnosis plus a fix reads as engineering. The
revision history table does the same job in the format the field already uses.

---

## Photographs

Every figure is currently a hatched **Figure pending** panel — a designed empty
state, not a broken image. To swap one in:

```html
<!-- from -->
<div class="dwg__fig fig--pending"><span>Figure pending</span></div>

<!-- to -->
<div class="dwg__fig"><img src="assets/bldc-stator.jpg" alt="Wound stator, twelve slots"></div>
```

Resize to ~1600px wide first. Shoot assembled, disassembled, and mid-process;
put calipers in frame for scale.

---

## Adding a project

Duplicate the closest existing page, rename it, edit the content, then copy an
`<a class="dwg">` block into the index in `index.html`.

Drawing numbers encode discipline, not sequence, so they stay meaningful as the
list grows:

```
E-  electromechanical      M-  mechanical
C-  controls               B-  modeling / bio
T-  teams, roles, work     R-  competition
```

---

## Regenerating the share card

`assets/og.png` is rasterised from `assets/og.svg`, which pulls the stator
drawing straight out of `index.html`. Edit the SVG and re-render at 1200×630.
On macOS with no SVG rasteriser installed, `qlmanage` fits the short side and
crops — render onto a 1200×1200 canvas with the artwork centred, then
`sips -c 630 1200` back down.

---

## Deploy

1. New public GitHub repo named `28ns30.github.io`.
2. Push.
3. Settings → Pages → Source: `main`, folder: `/ (root)`.
4. Live at `https://28ns30.github.io` within a minute or two.

The absolute URLs in each page's `<link rel="canonical">` and `og:` tags point
at `28ns30.github.io`. On a custom domain, update them — five files, one
find-and-replace.

---

## Design notes

Palette is drafting film and CAD sketch convention: cool grey-green field,
blue-black ink, one annotation blue (`--construct`) used only for measurement,
links and placeholders, one hazard yellow used only for in-progress status. Type
is a single superfamily at three widths.

Dark mode is not an inversion. The film becomes the dark field of a CAD viewport
and the ink becomes the drawn line — the accent lifts to `#7BA0FF` because the
deep blue is unreadable on a dark ground. Everything is driven by eleven custom
properties in one `prefers-color-scheme` block, so a new component themes itself
if it uses the variables.

## Geometry in the page

Real exported parts render as technical illustration — flat tone quantised to
three palette steps, with drawn feature edges over the top. Hand-rolled WebGL2,
no library, self-hosted, no third-party request.

Drag to turn it; let go and it coasts to a stop. Orientation is accumulated as a
rotation matrix rather than a yaw/pitch pair, so there is no pole to get stuck
at and no limit in any direction — it tumbles freely. Idle is **still**: nothing
spins on its own, and once it settles the render loop stops rather than spending
a frame on an unchanged image. Arrow keys turn it too, which is also how it
works under `prefers-reduced-motion`, where there is no loop at all.

The camera fits the geometry's bounding **sphere** — `r / sin(fov/2)` — because
the part rotates, so a bounding-box fit would frame the opening pose and clip a
corner-on one.

### Live on M-02

`p-shooter.html` draws the real Onshape export: 105 parts merged, 46,780
triangles, 21,880 vertices, 21,760 feature edges, **616 KB** for the whole
assembly. It arrived as 129 separate STLs totalling 1.78M triangles and 89 MB,
so the pipeline is a 38x reduction. The parameters panel beside it is filled
from the mesh file itself on load, so those numbers cannot drift from what is
actually being drawn.

### Format

`NSM2`, little-endian: magic, three counts, the part's own bounds in original
units, float32 positions, then uint16/32 triangle indices and edge indices.
Parsed in about ten lines. Feature edges (creases past 22°, plus any boundary)
are extracted ahead of time, and stored normals are dropped entirely — the
shader derives flat normals from screen-space derivatives, so they never ship.

```html
<canvas data-mesh="assets/models/shooter.mesh"
        data-mesh-replaces="#stand-in" hidden></canvas>
<div id="stand-in" class="fig--pending">…</div>   <!-- stays if WebGL2 or the fetch fails -->
<script src="mesh.js" defer></script>
```

Failures are not silent: the pending panel states the reason and the console
carries the detail. The most common one is opening the page as a `file://`
document, where the browser refuses the fetch — serve the folder over http
instead.

---

## The motor

`p-bldc.html` carries the site's one interactive drawing. Drag the rotor and it
follows your cursor; **the commutation follows rotor position**, which is how a
sensored brushless motor actually runs — Hall sensors report where the rotor is
and the controller energises whichever two phases make torque there. Turning it
by hand makes you the position sensor.

Twelve teeth are wound dLRK (`A a B b C c`, twice around), so a tooth's magnetic
pole is **(sign of phase current) × (winding direction)** — phase alone is not
enough, which is why each tooth carries `data-dir`. Fourteen rotor magnets
alternate N/S. Both are drawn in `--pole-n` / `--pole-s` *and* labelled N or S,
so colour is a second channel rather than the only one.

Electrical angle is seven times mechanical (fourteen poles = seven pole pairs),
which the readout makes visible: **51° of rotor is one full 360° electrical
cycle**. Arrow keys step exactly 60 electrical degrees, walking the six-step
table one entry at a time.

Degradation: with no JS the CSS commutation loop runs as before and the readout
stays hidden; under `prefers-reduced-motion` the drawing is static on a correct
energised step and the arrow keys still work.

---

Spacing is nine steps — 4, 8, 12, 16, 24, 32, 48, 64 px — and nothing else. It
replaced sixteen ad-hoc multipliers of an 8px unit that included both 6/7/9/10px
and 16/18/20px, differences no eye resolves. A new component reaches for a step
rather than inventing a fraction. Major blocks sit 96px apart, content sits 32px
under the masthead, and the hero uses the same 48px bottom pad the sections use
on top, so hero-to-section reads exactly like section-to-section.

The reading measure is `--readw`, ~66 characters, held in **rem, not ch**. Two
reasons: `ch` is the width of "0", which in Plex Sans is 10.2px against an 8.6px
average character, so an innocent-looking `68ch` silently bought 81 characters
per line; and `ch` resolves against each element's own font-size, so a standfirst
and the body copy beneath it computed to different widths and misaligned by 21px.
In rem, the page title, standfirst, body copy and section rules all share one
right edge.

The recurring device is the title block. It appears three times at three scales:
card footer on the index, specification table on a project page, page footer.
Learn it once, read it everywhere.

Contrast clears WCAG AA in both themes; the weakest text pair measures 5.2:1 in
light and 6.8:1 in dark. Keyboard focus is visible, `prefers-reduced-motion` is
respected, a card's whole face is clickable while the link name is
just its title, so screen-reader link lists stay readable, and print forces the light palette,
keeps drawings off page breaks, and prints link URLs.

If you change one thing, change `--construct`.
