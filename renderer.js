/**
 * CRUX RENDERER
 * ─────────────
 * The ONE renderer for the whole app. Every page is a route like #/intro,
 * which maps to content/intro.md (+ optional content/intro.css).
 *
 * Flow on every navigation:
 *   1. Read route from the URL hash
 *   2. Fetch content/{route}.md and content/{route}.css in parallel
 *   3. Swap the page <style> tag (so old page's CSS never bleeds into new page)
 *   4. Parse the .md with marked.js (+ our custom extensions, e.g. spoiler.js)
 *   5. Dump resulting HTML into #app
 */

const app = document.getElementById('app');
const pageStyleTag = document.getElementById('page-style');

const DEFAULT_ROUTE = 'home';

// ── marked.js config ────────────────────────────────────────────────────
// gfm: true        → tables, strikethrough, etc.
// breaks: false    → a single newline does NOT force a <br> (standard MD behavior)
// ── Prism.js Syntax Highlighting ────────────────────────────────────────

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
// Custom syntax (spoiler, future extensions) runs as regex over the raw
// text. Without this step, those regexes would also fire INSIDE code —
// dangerous, since e.g. `||` is also the C/C++ logical OR operator and
// WILL show up in your embedded snippets.
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

// ── Custom syntax pipeline ───────────────────────────────────────────────
// Runs every preprocessor registered by extensions/*.js (e.g. spoiler.js)
// on the body BEFORE marked ever sees it. This is what makes custom syntax
// work even when wrapped in raw HTML tags — see spoiler.js for the full
// explanation of why marked extensions alone don't work here.
function applyCustomSyntax(body) {
    const { protectedText, stash } = protectCodeBlocks(body);

    let processed = protectedText;
    (window.CruxPreprocessors || []).forEach(preprocessor => {
        processed = preprocessor(processed);
    });

    return restoreCodeBlocks(processed, stash);
}

// ── Core route loader ───────────────────────────────────────────────────
async function loadRoute(route) {
    app.innerHTML = `<p class="loading">Loading…</p>`;

    const mdUrl = `content/${route}.md`;
    const cssUrl = `content/${route}.css`;

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

        // Parse frontmatter, run custom syntax (spoiler, etc.) BEFORE
        // marked ever sees it, then render
        const { meta, body } = parseFrontmatter(rawMd);
        const processedBody = applyCustomSyntax(body);
        const html = marked.parse(processedBody);

        app.innerHTML = html;

        Prism.highlightAllUnder(app); // Syntax Highlighting using Prism.js

        // Set tab title if frontmatter provided one
        document.title = meta.title ? `${meta.title} — CRUX` : 'CRUX';

        // Highlight the active nav link
        highlightActiveNav(route);

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

function handleNavigation() {
    const route = getCurrentRoute();
    loadRoute(route);
}

window.addEventListener('hashchange', handleNavigation);
window.addEventListener('DOMContentLoaded', handleNavigation);
