/**
 * Footnote extension for CRUX
 * Syntax (Pandoc/GFM style):
 *
 *   Some text with a reference[^1].
 *
 *   [^1]: The footnote text, on its own line.
 *
 * Like spoiler.js, this is a PRE-PROCESSOR, not a marked.js extension —
 * same reason as always (marked won't inline-parse inside raw HTML blocks).
 * But footnotes have a second problem on top of that: marked.js has NO
 * native footnote support at all. They aren't part of CommonMark or GFM
 * core. This implements the common Pandoc-style convention from scratch.
 *
 * How it works:
 *   1. Find every "[^id]: text" line, store it, remove it from the body
 *   2. Replace every remaining "[^id]" reference with a numbered
 *      superscript link, numbered by order of first appearance
 *   3. Append a footnote list (<ol>) at the very end of the page
 */

function footnotePreprocess(text) {
    const definitions = {};

    // 1. Extract definitions (single-line only — multi-paragraph footnotes
    //    aren't supported here, keep each definition on one line)
    let processed = text.replace(/^\[\^([^\]]+)\]:[ \t]*(.+)$/gm, (match, id, content) => {
        definitions[id] = content.trim();
        return '';
    });

    // 2. Replace references, numbering by order of first appearance
    const order = [];
    processed = processed.replace(/\[\^([^\]]+)\]/g, (match, id) => {
        if (!(id in definitions)) return match; // not a real footnote ref — leave it alone
        if (!order.includes(id)) order.push(id);
        const n = order.indexOf(id) + 1;
        return `<sup id="fnref-${id}"><a href="#fn-${id}">${n}</a></sup>`;
    });

    // 3. Append the footnote list, only if any were actually referenced
    if (order.length > 0) {
        const items = order.map(id =>
            `<li id="fn-${id}">${definitions[id]} <a href="#fnref-${id}">↩</a></li>`
        ).join('\n');
        processed += `\n\n<div class="footnotes"><hr><ol>\n${items}\n</ol></div>\n`;
    }

    return processed;
}

window.CruxPreprocessors = window.CruxPreprocessors || [];
window.CruxPreprocessors.push(footnotePreprocess);
