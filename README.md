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
index.html         drawing index (homepage): grid, or graph   ← two blocks generated from ~/Farm
about.html         about
404.html           designed not-found sheet
p-bldc.html        brushless DC motor              ← written
p-cycloidal.html   cycloidal gearbox               ← stub
p-drone.html       quadrotor                       ← stub
p-shooter.html     FRC shooter subsystem           ← real geometry, write-up pending
p-umv.html         ultra-mobility vehicle          ← stub, leads the index
p-pcb-motor.html   PCB motor                       ← stub
tree.js            the grid/graph switch; tracing, panel and keys for the graph
style.css          the whole design system
theme.js           the Auto / Light / Dark control
favicon.svg        theme-aware, light and dark
robots.txt
sitemap.xml
assets/og.png      1200×630 share card
assets/og.svg      source for og.png
assets/fonts/      IBM Plex, 4 files, 84 KB, OFL
assets/models/     exported geometry, NSM3 format (+ .gz for transport)
mesh.js            WebGL2 renderer for the exported parts
assets/            photographs go here
```

"Stub" means the page exists, is styled, and carries a **Write-up pending**
block. Nothing 404s. `p-bldc.html` is the structural template — copy its five
sections when writing a stub up properly.

---

## Grid and graph

The Work page shows the projects two ways, switched in the section head. The
grid is the project cards: every public project done or under way, newest
first. Each card has four fields: Year, Status, Team ("Solo" or the team), and
one that fits the project best -- a key figure (a ratio, a flight time), a role
on a team build, or the number of iterations; for work under way, a target. A
value not known yet is a placeholder (`<dd class="fill">[N]:1</dd>`) until it is
written in, on the card and on the page's parameters alike; consistency.py
holds every field a card shares with its page to the same value. The graph is the same projects plus the
planned projects that directly build on them: a hub, rings outward, one circle
per project, each one ring further out than the furthest project it needs, and
a line into each circle from one it needs. A circle takes its project's status:
done is solid ink, in progress is hazard yellow, planned is hollow, an idea is
hollow and dashed. The lines take the status of the circle they lead into.

It is not a game's tech tree and never says so: no tiers, nothing locked or
unlocked, no counts in the circles. consistency.py fails on those words on any
page, in any label a screen reader hears, and in the local page's lettering
(Farm's own notes there are left alone), and on a project number (the site
dropped E-01, M-01 and the rest) on any page, in any label or on the share card.

With no script the switch is hidden and both views stand, the graph under its
own heading. The address says which view is showing: `index.html#graph`, or
`#` and the id of any project in the graph, opens on the graph.

Most of the grid is written by hand: a card is the project's page on the index.
The rest is generated, between `<!-- generated:... -->` markers that must not be
edited:

- **grid**: a card for each public project Farm has done or under way that has
  no page yet (none today), after the UMV: under way first, then done. Its year
  is a dash, because Farm has none; it links to the project in the graph. Give
  such a project a page and a hand-written card and it drops out of this block.
- **graph**: the figure, its legend, and a card per project below it, grouped by
  status. The cards are what a screen reader, a phone and paper read, and what
  the panel beside the figure shows.

```bash
python3 gen_tree.py          # runs Farm's build, then rewrites both blocks + tree.local.html
python3 gen_tree.py --check  # are they what Farm says now? exit 1 if not
python3 consistency.py       # must say "everything agrees" before a commit
```

Where it comes from:

- **Farm** (`~/Farm`) owns every project's status, scores, dependencies, plan
  and log. The projects on the index are Farm nodes too, carrying
  `site: {page: "p-bldc.html"}` (a `drawing:` code beside it is no longer read).
- **The index** owns its cards. On the Work page a card wins: the graph takes
  its title and its status (a card in progress draws in progress; any other
  status word draws done, and is the word shown), so the grid and the graph
  never disagree. Where Farm says otherwise, the generator prints a note. Every
  card needs a public Farm node with its page, or the generator stops.
- **What is public** is Farm's `public:` flag, and only a project's Summary and
  Goals are published.

The generator also keeps two things outside the blocks in step: the "6 builds"
on the hero's dimension and the "6 projects" in the section head (every card in
the grid), and the home page's `lastmod` in `sitemap.xml`, moved to the day
`index.html` changes. `--check` reports either when it is out of date. The
share card says the same count; it comes from `gen_og.py`, and consistency.py
fails when the two drift (run `gen_og.py`, then re-render `og.png`).

The drawing is laid out by `gen_tree.py` and baked into the page, so it reads
with script off and prints. The names are fitted inside the circles with the
site's own font metrics (it needs `fonttools` and `brotli`). The layout is held
where it was from one run to the next: a finished project changes colour and
nothing moves; adding or relinking projects lays it out again, as close to the
old drawing as the new structure allows (`--reflow` starts afresh). Lines never
pass through a circle they do not join and never run along an unrelated line.
Each circle has one line in at rest; a second project it needs is drawn when the
project is hovered, focused or chosen, and its label and card name every one.

`tree.js` adds what only a script can: the switch; hovering or focusing a
project lights its whole chain, both ways; choosing one puts its title block in
the panel beside the drawing where there is room (1100px and wider for a graph
up to 760 wide, as the Work page's is; 1400px for a larger one, as the local
page's is); and the drawing is one tab
stop, walked with the arrow keys (Up/Down in order, Right to a child, Left to
the parent, a letter to jump).

`--check` also notices Farm edits that have not been built yet. The generator
refuses to write from a public export older than the full one (a plain
`build.py` refreshes only the full one), or from one carrying a link that is not
http(s) or mailto; it prints a `note:` when public prose names a hidden project
or a private file, or when a name only fits its circle set smaller.

`tree.local.html` is every project Farm has, drawn the same way: plans, next
actions, open questions, decisions, logs, cost and time, progress in the circles
of work under way, all five scores, the Farm id above each card's title, links
into the Farm folder, and links proposed but not yet confirmed (an open question that reads ``To confirm: needs `id` ``
in node.md, drawn dotted with a ?). It is gitignored; open it from Finder.

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
`<article class="dwg">` card into the grid in `index.html` and give its Farm node
`site: {page: ...}`. Projects are not numbered; the page's title names it in
the crumb and the footer.

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

The absolute URLs in each page's `<link rel="canonical">` and `og:` tags, in
`sitemap.xml` and in `robots.txt` point at `28ns30.github.io`. On a custom
domain, update them with one find-and-replace over those files.

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

### Live on the shooter page

`p-shooter.html` draws the real Onshape export: 87,786 triangles, 42,532
vertices and 31,731 drawn edges, **573 KB** over the wire. It arrived as 129
separate STLs totalling 1.78M triangles and 89 MB, so the pipeline is a 20x
reduction that lands within a pixel of the original — measured against 300,000
points sampled on the source surfaces, mean deviation is 581 um where a screen
pixel at this size is 614 um.

Two things earn most of that. Feature edges are extracted from the **full
resolution** surfaces and then mapped onto the reduced vertices, rather than
measured after reduction: measuring afterwards means measuring angles between
facets that reduction itself bent, which on curved parts made 62-72% of the
drawn lines spurious — lines scribbled across surfaces that are smooth. And
each cluster's representative vertex is the point minimising squared distance
to the planes of its incident triangles, not the average of the cell, so
corners stay corners and flat faces stay flat.

The parameters panel is filled from the mesh file itself on load, so those
numbers cannot drift from what is actually being drawn.

### Format

`NSM3`, little-endian: magic, three counts, the part's bounds in original units,
the quantisation origin and span, then **uint16** positions and uint16/32
triangle and edge indices. Parsed in about a dozen lines.

Positions are quantised because the assembly spans 368 mm and is drawn about
600px wide — a pixel is most of a millimetre, and 16 bits over the bounding box
resolves 0.003 mm. float32 would spend twice the bytes on precision no one can
see; the shader undoes the quantisation, so nothing is decoded on the CPU.
Stored normals are dropped entirely — the shader derives flat normals from
screen-space derivatives.

GitHub Pages gzips text but not `model/mesh`, so a pre-compressed copy sits
beside the mesh and is inflated with `DecompressionStream`: 888 KB becomes 573
KB over the wire. Where that is unavailable, or where a host has already
inflated the response, it falls back to the plain file — decided on the gzip
magic bytes rather than a header, since `fetch` does not reliably expose
`Content-Encoding` to script.

```html
<canvas data-mesh="assets/models/shooter.mesh"
        data-mesh-replaces="#stand-in" hidden></canvas>
<div id="stand-in" class="fig--pending">…</div>   <!-- stays if WebGL2 or the fetch fails -->
<script src="mesh.js" defer></script>
```

On the home page the stand-in is the stator drawing, and it is never a loading
placeholder: while the assembly loads its 16:9 well is held empty, so nothing
flashes and nothing below moves when it arrives. The stator shows only with no
script, or when the assembly cannot be drawn (`html.no-mesh`, set on
`mesh:failed`, which mesh.js's `onerror` also sends if the script itself does
not load).

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
