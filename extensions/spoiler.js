/**
 * Spoiler extension for CRUX
 * Syntax: ||hidden text||
 * Renders as a clickable span that's blacked-out until clicked.
 *
 * IMPORTANT — why this is a PRE-PROCESSOR, not a marked.js extension:
 *
 * marked.js (and CommonMark generally) treats any line that starts with a
 * raw HTML tag — <h1>, <p>, <h4>, etc. — as an opaque "HTML block." It does
 * NOT run its inline parser (bold, italic, links, or any extension) on the
 * contents. Since CRUX content is written as raw HTML, a marked.js
 * extension registered the normal way (marked.use) never fires.
 *
 * The fix: run this BEFORE marked.parse() ever sees the text, as a plain
 * string transform. renderer.js protects <pre>/<code> blocks first so this
 * never touches actual code (critical — `||` is also the C/C++ logical OR
 * operator, and you will absolutely have it in your embedded snippets).
 */

function spoilerPreprocess(text) {
    return text.replace(/\|\|([^|]+?)\|\|/g, (match, inner) => {
        return `<span class="spoiler" onclick="this.classList.toggle('revealed')">${inner.trim()}</span>`;
    });
}

window.CruxPreprocessors = window.CruxPreprocessors || [];
window.CruxPreprocessors.push(spoilerPreprocess);

/**
 * ── How to add your next custom syntax (e.g. ==highlight==, :::note:::) ───
 * 1. Write a function: (text) => text.replace(/yourPattern/g, (m, ...) => 'html')
 * 2. Push it: window.CruxPreprocessors.push(yourFunction)
 * 3. In index.html, add <script src="extensions/your-extension.js">
 *    AFTER spoiler.js, BEFORE renderer.js.
 *
 * Pick delimiters that won't collide with real code (==, :::, [[ ]] are
 * all safer choices than something like ** or // that appear in C).
 * renderer.js automatically protects <pre>/<code> blocks before running
 * ANY preprocessor in this array — you don't need to handle that yourself.
 */
