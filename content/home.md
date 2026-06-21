---
title: Home
---

# Welcome to CRUX

Companion JS test — this should be live-ticking, driven by `home.js`:

<div id="clock"></div>

## Renderer test bench

Bold via markdown: **this is bold**. Italic via markdown: *this is italic*.

Spoiler test: the answer to 6 × 7 is ||42||.

Spoiler with nested markdown: the capital of France is ||**Paris**||.

---

Inline code: `let x = 5;`

```js
function add(a, b) {
    return a + b;
}
```

Code blocks are protected from spoiler parsing — the double `||` below, inside a fenced block, renders exactly as written:

```c
if (sensor_ready || timeout_hit) {
    read_value();
}
if (a || b || c) {
    do_thing();
}
```