# CRUX

Final architecture for CRUX:

1. uses .md files with inline html for the frontend
2. uses extended marked.js for rendering the md files with custom extensions like spoilers, etc...
3. styling is done by vanilla css
4. packaged by tauri v2 for windows, linux, macos, android and iOS
5. for dev workflow, `python3 -m http.server port.number` inside CRUX/

Features (future):

- sign ins
- progress
- group study
- notifications
- meet people irl (similar to friendship apps but for our app)

how does the architecture sound? is it bold? or does it require any improvements?