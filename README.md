# Design Vocabulary Board

A single-page web app that helps you **browse design terminology**, read short definitions, and **copy prompts** (including textual and technical snippets) so you can describe and implement visual design ideas more precisely. 

## What you get

- **Search** across named design elements  
- **Categories** as filter pills (e.g. gradients, typography, UI patterns)  
- **Cards** with previews, titles, and “Show Prompt” for each element  
- **Detail view** with tabs for prompts and optional **HTML / TSX** style technical snippets you can copy  

v2 aims to implement the functionality as an MCP.


## Screenshots

**Browse by category** — pick a topic and scan the grid of elements.

![Design Vocabulary Board — category grid](design_board_screen1.png)

**Prompt detail** — open an element to read aliases and copy textual or tech prompts.

![Design Vocabulary Board — prompt modal with tech snippet](design_board_screen2.png)


## How to run locally

**Option A — open the file**

Double-click `index.html`, or drag it into a browser window.

**Option B — local server (recommended)**  

Some browsers restrict certain features when pages are opened as `file://`. If anything behaves oddly, serve the folder:

```bash
cd /path/to/desgin_board
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080) — the app loads from `index.html` automatically.

