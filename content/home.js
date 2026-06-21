/**
 * Companion script for home.md — loaded automatically by renderer.js
 * because content/home.js exists alongside content/home.md. No wiring
 * needed in index.html or renderer.js; the filename match is the whole
 * contract.
 *
 * Export shape:
 *   init(app, meta)   — called once this page's HTML is in the DOM.
 *                       `app` is the #app element, `meta` is the page's
 *                       parsed frontmatter (e.g. meta.title).
 *   cleanup()         — OPTIONAL. Called right before the user navigates
 *                       to a DIFFERENT page. Anything init() started that
 *                       outlives the page (listeners, intervals, timeouts)
 *                       needs to be torn down here, or it keeps running
 *                       after the page is gone.
 */

let intervalId = null;

export function init(app, meta) {
    const clockEl = app.querySelector('#clock');
    if (!clockEl) return; // home.md doesn't have a #clock element — skip safely

    const tick = () => {
        clockEl.textContent = new Date().toLocaleTimeString();
    };

    tick(); // show immediately, don't wait a full second for the first tick
    intervalId = setInterval(tick, 1000);
}

export function cleanup() {
    // Without this, navigating away from home and back would start a
    // SECOND interval on top of the first — both still running, both
    // still writing to a #clock element that may not even exist anymore.
    if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
}