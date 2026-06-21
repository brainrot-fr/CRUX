/**
 * CRUX RENDERER
 * ─────────────
 * The ONE renderer for the whole app. Every page is a route like #/intro,
 * which maps to content/intro.md (+ optional content/intro.css/.js).
 *
 * Flow on every navigation:
 *   1. Run the PREVIOUS page's cleanup() (if it registered one)
 *   2. Read route from the URL hash
 *   3. Fetch content/{route}.md and content/{route}.css in parallel
 *   4. Swap the page <style> tag (so old page's CSS never bleeds into new page)
 *   5. Protect code blocks, then protect+render math (KaTeX), in that order
 *   6. Run custom syntax preprocessors (spoiler, footnotes, etc.)
 *   7. Restore code, parse with marked.js, then splice rendered math back in
 *   8. Dump resulting HTML into #app, run Prism for syntax highlighting
 *   9. Load content/{route}.js (if it exists) and call its init()
 */

const app = document.getElementById('app');
const pageStyleTag = document.getElementById('page-style');

const DEFAULT_ROUTE = 'home';

// Holds the CURRENT page's cleanup function, if its companion .js exported
// one. Unlike CSS (which is just textContent swapped on one <style> tag —
// trivially "undone" by being overwritten), JS has no automatic teardown.
// An event listener or setInterval() started by one page's init() keeps
// running after navigating away unless something explicitly stops it.
let currentPageCleanup = null;

// ── marked.js config ────────────────────────────────────────────────────
// gfm: true        → tables, strikethrough, etc.
// breaks: false    → a single newline does NOT force a <br> (standard MD behavior)
marked.setOptions({
    gfm: true,
    breaks: false,
});

// ── Frontmatter parser ──────────────────────────────────────────────────
// Optional. If a .md file starts with:
//   ---
//   title: Intro to Hardware
//   ---
// we pull out `title` and strip the block before handing off to marked.
function parseFrontmatter(raw) {
    // strip a leading BOM if the file was saved with one — harmless, but
    // would otherwise make the "^---" check fail silently
    const clean = raw.replace(/^\uFEFF/, '');

    const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(clean);
    if (!fmMatch) {
        return { meta: {}, body: clean };
    }

    const meta = {};
    fmMatch[1].split('\n').forEach(line => {
        const sep = line.indexOf(':');
        if (sep === -1) return;
        const key = line.slice(0, sep).trim();
        const value = line.slice(sep + 1).trim();
        if (key) meta[key] = value;
    });

    // trimStart removes the leftover blank line between the closing ---
    // and the actual content, purely cosmetic, doesn't affect rendering
    const body = clean.slice(fmMatch[0].length).replace(/^\s+/, '');
    return { meta, body };
}

// ── Code-block protection ───────────────────────────────────────────────
// Custom syntax (spoiler, footnotes, future extensions) runs as regex over
// the raw text. Without this step, those regexes would also fire INSIDE
// code — dangerous, since e.g. `||` is also the C/C++ logical OR operator
// and WILL show up in your embedded snippets.
//
// Covers THREE forms, since you write mostly plain markdown now:
//   1. Fenced blocks   — ```c ... ```        (most common in plain MD)
//   2. Raw HTML        — <pre>/<code>        (only if you ever drop to HTML)
//   3. Inline code     — `like this`
//
// Each is swapped for a placeholder token before any preprocessor runs,
// then restored byte-for-byte afterward.
function protectCodeBlocks(text) {
    const stash = [];
    const stashAndReplace = (match) => {
        stash.push(match);
        return `\uE000CRUXCODE${stash.length - 1}\uE000`;
    };

    let protectedText = text;
    protectedText = protectedText.replace(/```[^\n]*\n[\s\S]*?```/g, stashAndReplace);
    protectedText = protectedText.replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/gi, stashAndReplace);
    protectedText = protectedText.replace(/`[^`\n]+`/g, stashAndReplace);

    return { protectedText, stash };
}

function restoreCodeBlocks(text, stash) {
    return text.replace(/\uE000CRUXCODE(\d+)\uE000/g, (_, i) => stash[Number(i)]);
}

// ── Math protection + rendering (KaTeX) ──────────────────────────────────
// $...$ and $$...$$ aren't just hidden like code — they're converted to
// HTML/CSS RIGHT HERE via KaTeX, and the result is stashed. The stash gets
// spliced into the FINAL HTML string AFTER marked.parse() runs, never
// before. This matters: if raw LaTeX source passed through marked at all,
// marked's own backslash-escaping (CommonMark treats \, \_ \{ etc as
// escape sequences too) would silently corrupt it before KaTeX ever saw
// it — same family of bug as the spoiler/`||` issue, different symptom.
//
// KaTeX over Temml: Temml outputs native MathML and leans on the host
// WebView's MathML engine to render it. CRUX runs through FIVE different
// WebView engines (WebView2, WebKitGTK, WKWebView ×2, Android System
// WebView) via Tauri, and MathML Core completeness varies across them.
// KaTeX renders to plain CSS-positioned HTML instead — it doesn't depend
// on the host engine's math support at all, so it looks identical on
// every platform regardless of WebView version. Costs ~590KB self-hosted
// (woff2 fonts only — every Tauri WebView target supports woff2 natively,
// no need for woff/ttf fallbacks), which is irrelevant for a bundled
// offline app with no network page-load cost.
//
// Always runs AFTER protectCodeBlocks, so things like bash `$HOME` or `$1`
// inside actual code are already placeholder tokens and never get
// mistaken for math delimiters.
function protectMath(text) {
    const stash = [];
    const renderAndStash = (displayMode) => (match, inner) => {
        let mathHtml;
        try {
            mathHtml = katex.renderToString(inner.trim(), { displayMode, throwOnError: false });
        } catch (e) {
            mathHtml = `<span class="math-error">[math error: ${e.message}]</span>`;
        }
        stash.push(mathHtml);
        return `\uE001CRUXMATH${stash.length - 1}\uE001`;
    };

    let protectedText = text;
    // block math ($$...$$) MUST run before inline ($...$), or the inline
    // regex would treat the opening "$$" as two single-$ delimiters
    protectedText = protectedText.replace(/\$\$([\s\S]+?)\$\$/g, renderAndStash(true));
    protectedText = protectedText.replace(/\$([^\$\n]+?)\$/g, renderAndStash(false));

    return { protectedText, stash };
}

function restoreMath(html, stash) {
    return html.replace(/\uE001CRUXMATH(\d+)\uE001/g, (_, i) => stash[Number(i)]);
}

// ── Custom syntax pipeline ───────────────────────────────────────────────
// Runs every preprocessor registered by extensions/*.js (spoiler.js,
// footnote.js, etc.) on text that already has code AND math hidden behind
// placeholder tokens — so neither can be corrupted by custom syntax regex.
function applyCustomSyntax(text) {
    (window.CruxPreprocessors || []).forEach(preprocessor => {
        text = preprocessor(text);
    });
    return text;
}

// ── Core route loader ───────────────────────────────────────────────────
async function loadRoute(route) {
    // Tear down the PREVIOUS page's JS first, while its DOM is still intact —
    // this runs before app.innerHTML is touched at all.
    if (currentPageCleanup) {
        try {
            currentPageCleanup();
        } catch (e) {
            console.error('[renderer] cleanup() threw for previous page:', e);
        }
        currentPageCleanup = null;
    }

    app.innerHTML = `<p class="loading">Loading…</p>`;

    const mdUrl = `content/${route}.md`;
    const cssUrl = `content/${route}.css`;
    // import() requires an explicit "./", "../", or "/" prefix to treat
    // this as a relative path at all — fetch() doesn't have that rule,
    // which is why mdUrl/cssUrl above work fine without it but this one
    // needs it or it's rejected as an unresolvable "bare specifier"
    const jsUrl = `./content/${route}.js`;

    try {
        // Fetch markdown — this one is required, throw if missing
        const mdRes = await fetch(mdUrl);
        if (!mdRes.ok) {
            throw new Error(`No page found at ${mdUrl} (HTTP ${mdRes.status})`);
        }
        const rawMd = await mdRes.text();

        // Fetch companion CSS — this one is optional, fail silently
        let cssText = '';
        try {
            const cssRes = await fetch(cssUrl);
            if (cssRes.ok) cssText = await cssRes.text();
        } catch {
            // no companion CSS file — totally fine, just skip
        }

        // Swap page styles — old style is fully replaced, never appended
        pageStyleTag.textContent = cssText;

        const { meta, body } = parseFrontmatter(rawMd);

        // 1. protect code FIRST — so $ inside code (bash $HOME, $1, etc.)
        //    never reaches the math regex
        const { protectedText: noCode, stash: codeStash } = protectCodeBlocks(body);

        // 2. protect + render math, on the code-protected text
        const { protectedText: noCodeNoMath, stash: mathStash } = protectMath(noCode);

        // 3. run custom syntax preprocessors (spoiler, footnotes, ...)
        let processed = applyCustomSyntax(noCodeNoMath);

        // 4. restore code BEFORE marked.parse(), so marked can wrap fenced
        //    blocks / <pre> properly and Prism can find them afterward
        processed = restoreCodeBlocks(processed, codeStash);

        // 5. marked.parse() — never sees raw LaTeX or raw code, both are
        //    still placeholder tokens at this point
        let html = marked.parse(processed);

        // 6. restore math AFTER marked — splice the already-rendered
        //    MathML directly into the final HTML output
        html = restoreMath(html, mathStash);

        app.innerHTML = html;

        Prism.highlightAllUnder(app); // Syntax Highlighting using Prism.js

        // Set tab title if frontmatter provided one
        document.title = meta.title ? `${meta.title} — CRUX` : 'CRUX';

        // Highlight the active nav link
        highlightActiveNav(route);

        // ── Companion JS (optional) ───────────────────────────────────────
        // A plain <script src="..."> written directly in the .md content
        // would NOT work — anything inserted via app.innerHTML (which is
        // exactly what just happened above) is inert per the HTML spec,
        // script tags included. dynamic import() is the one mechanism that
        // actually executes. Checked with a plain fetch first, same as the
        // CSS file above, so a missing companion .js is a silent, expected
        // case rather than a console error from a failed import().
        try {
            const jsRes = await fetch(jsUrl);
            if (jsRes.ok) {
                // cache-bust with a URL FRAGMENT, not a query string. A
                // fragment is never sent to the server — Tauri's asset
                // protocol sees a plain, unmodified "content/home.js"
                // request — but the browser's module map still treats it
                // as cache-distinct, so editing the file and revisiting
                // the page during dev re-runs the new code. A query string
                // (?t=...) DOES get sent to the server, and there's a
                // documented class of Tauri bug where that confuses its
                // asset-path matching and falls back to serving index.html
                // — which then fails as a "MIME type text/html" error,
                // since strict MIME checking is enforced for module scripts.
                const module = await import(`${jsUrl}#${Date.now()}`);
                if (typeof module.init === 'function') {
                    module.init(app, meta);
                }
                if (typeof module.cleanup === 'function') {
                    currentPageCleanup = module.cleanup;
                }
            }
        } catch (jsErr) {
            console.error('[renderer] companion JS failed to load/run:', jsUrl, jsErr);
        }

    } catch (err) {
        console.error('[renderer] failed to load route:', route, err);
        app.innerHTML = `
            <p class="error">Couldn't load this page.</p>
            <p class="error">${err.message}</p>
        `;
    }
}

// ── Nav highlighting ─────────────────────────────────────────────────────
function highlightActiveNav(route) {
    document.querySelectorAll('.nav-links a').forEach(a => {
        const linkRoute = a.getAttribute('href').replace('#/', '');
        a.classList.toggle('active', linkRoute === route);
    });
}

// ── Router ───────────────────────────────────────────────────────────────
function getCurrentRoute() {
    const hash = window.location.hash; // e.g. "#/intro"
    const route = hash.replace(/^#\/?/, '').trim();
    return route || DEFAULT_ROUTE;
}

// Routes are "#/something". Anything else in the hash — like "#fn-1" or
// "#fnref-1" from footnote links — is an in-page anchor, not a route.
// Without this check, clicking a footnote changes the hash to "#fn-1",
// the hashchange listener fires, and the router tries to fetch
// "content/fn-1.md" (which doesn't exist) instead of just letting the
// browser scroll to the <li id="fn-1"> already sitting in the page.
function isRouteHash(hash) {
    return !hash || hash.startsWith('#/');
}

function handleNavigation() {
    if (!isRouteHash(window.location.hash)) {
        return; // bare anchor — let the browser handle the in-page scroll natively
    }
    const route = getCurrentRoute();
    loadRoute(route);
}

window.addEventListener('hashchange', handleNavigation);
window.addEventListener('DOMContentLoaded', handleNavigation);