# CRUX

An open learning platform for CS, electronics, and embedded systems students. Content is written in plain markdown and rendered by a single custom renderer — no frontend framework, no build step for the web layer. Packaged as a cross-platform desktop and mobile app via Tauri v2.

## Stack

| Layer | Choice | Why |
|---|---|---|
| UI | Vanilla HTML/CSS/JS | No framework overhead, full control |
| Markdown parsing | [marked.js](https://marked.js.org/) | Small, no deps, handles raw HTML pass-through |
| Math | [KaTeX](https://katex.org/) (self-hosted) | CSS-positioned output — renders identically across every WebView engine, doesn't depend on host MathML support |
| Code highlighting | [Prism.js](https://prismjs.com/) (self-hosted) | Lightweight, per-language components |
| Packaging | [Tauri v2](https://v2.tauri.app/) | Windows, Linux, macOS, Android, iOS from one codebase |
| Backend (planned) | [Supabase](https://supabase.com/) | Auth, progress tracking, group study |

Everything is self-hosted (no CDN dependency) since the app runs fully offline once packaged.

## Project structure

```
crux/
├── index.html              # shell — navbar + <main id="app">, never changes
├── global.css               # shell styles, typography, Prism theme, footnotes
├── renderer.js               # the one renderer — router, pipeline, everything
├── extensions/
│   ├── spoiler.js            # ||hidden text|| syntax
│   └── footnote.js           # [^1] / [^1]: definition syntax
├── lib/
│   ├── marked.min.js
│   ├── katex/                # katex.min.js, katex.min.css, fonts/ (woff2 only)
│   └── prism/                # prism-core + per-language components
├── content/
│   ├── home.md / home.css
│   ├── intro.md / intro.css
│   └── ...                   # one .md (+ optional .css) per page
└── src-tauri/                 # Tauri shell — Cargo.toml, tauri.conf.json, icons/
```

## Running it locally (without Tauri)

Fetching local files needs an HTTP server — opening `index.html` directly via `file://` will get CORS-blocked by the browser.

```bash
cd crux
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Running it via Tauri (the real target)

```bash
cargo tauri dev      # opens a native window
cargo tauri build    # produces an installer for your current OS
```

See **Tauri setup** below if this is your first time.

## Writing content

Each route maps to a markdown file: `#/intro` → `content/intro.md` (+ optional `content/intro.css`, swapped in/out per page so styles never bleed between pages).

### Frontmatter (optional)

```md
---
title: Intro to Hardware
---

# Your content starts here
```

`title` sets the browser tab title. Anything else you add to the frontmatter block is parsed but currently unused — free to extend later.

### Write pure markdown by default

```md
# Heading

Some **bold** text, a [link](https://example.com), and `inline code`.
```

### Use raw HTML only when markdown genuinely can't do it

Specifically: when you need a `class` attribute, a `<button>`, or any element/attribute markdown has no syntax for.

```md
<h4 class="callout">This heading needs a class markdown can't express.</h4>

<button onclick="alert('hi')">Click me</button>
```

**Important trade-off to know:** markdown syntax (`**bold**`, `*italic*`, `[link](url)`) does **not** get processed *inside* a raw HTML tag — this is standard CommonMark behavior, not a CRUX bug. If you need bold text inside an HTML-tag-wrapped line, write `<strong>` directly instead of `**`.

```md
<!-- This won't bold -->
<p>some **bold** text</p>

<!-- This will -->
<p>some <strong>bold</strong> text</p>
```

The one exception: `||spoiler||` and footnotes work everywhere, including inside HTML tags — see below.

## Custom syntax reference

### Spoiler

```md
The answer is ||42||.
```
Renders as a blacked-out span, click to reveal. Works inside or outside HTML tags.

### Footnotes (Pandoc-style)

```md
Here's a claim that needs a source[^1].

[^1]: The actual source, on one line.
```
Renders as a numbered superscript link, with a footnote list auto-appended at the end of the page.

### Math (KaTeX)

```md
Inline: $E = mc^2$

Block:
$$
\int_a^b f(x)\,dx
$$
```

### Code (fenced blocks, syntax-highlighted via Prism)

````md
```c
if (sensor_ready || timeout_hit) {
    read_value();
}
```
````

The language tag (`c`, `python`, `javascript`, etc.) determines Prism's highlighting. Code blocks — fenced, inline, or raw HTML `<pre>`/`<code>` — are fully protected from spoiler/footnote/math parsing, so `||` (C's logical OR) and `$` (shell variables) inside code are never mistaken for custom syntax.

## Adding new custom syntax

Custom syntax is implemented as a **pre-processor** (a plain string transform), not a marked.js extension — marked never inline-parses the contents of raw HTML blocks, so a normal extension silently never fires on most CRUX content. See the comment block at the bottom of `extensions/spoiler.js` for the exact pattern:

1. Write a function: `(text) => text.replace(/yourPattern/g, (m, ...) => 'html')`
2. Register it: `window.CruxPreprocessors.push(yourFunction)`
3. In `index.html`, add `<script src="extensions/your-extension.js">` **after** `spoiler.js`/`footnote.js`, **before** `renderer.js`
4. Code blocks are protected automatically — your preprocessor never sees inside them, no extra work needed

## Router behavior

Routes are `#/something`. Anything else in the hash (`#fn-1`, `#fnref-1`, or any future in-page anchor) is treated as a plain anchor and ignored by the router — the browser handles the scroll natively. This is what lets footnote links coexist with the SPA router without the router trying to fetch `content/fn-1.md`.

## Tauri setup (first time, Arch Linux + Hyprland)

```bash
# System dependencies
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg xdotool

# Rust toolchain
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
# restart your terminal, then:
cargo install tauri-cli --version "^2.0.0" --locked

# Inside the project root (where index.html lives):
cargo tauri init
#   App name: crux
#   Window title: CRUX
#   Web assets location: ../
#   Dev server URL / dev command / build command: leave all blank — no bundler

cargo tauri dev
```

**If you get a blank or crashing window** (known Wayland/WebKitGTK friction, Hyprland included):
```bash
WEBKIT_DISABLE_COMPOSITING_MODE=1 cargo tauri dev
```

`cargo tauri build` only produces a build for the OS you run it on — Windows/macOS builds need to happen on those platforms or via CI later. Android (Android Studio + NDK) and iOS (requires an actual Mac) are separate, heavier setup steps not yet done.

## Known limitations

- Footnote definitions are single-line only — no multi-paragraph footnotes
- MathML-vs-KaTeX inconsistencies aren't a concern (KaTeX was specifically chosen to avoid this), but extremely complex LaTeX (custom macros, exotic packages) may not be supported — KaTeX covers the common academic subset
- No build step also means no minification/bundling of your own content — fine at current scale, worth revisiting if `content/` grows very large

## Roadmap

- Auth, progress tracking, group study, notifications — via Supabase
- Push notifications need a separate mobile plugin (FCM/APNs) beyond Tauri's built-in local notifications
- "Meet people IRL" feature — needs careful thought around location data, safety, and moderation before building
