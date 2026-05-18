# Screenshot Mania

A lightweight Chrome extension prototype for fast screenshot capture:

- Shake your mouse left/right to reveal a blue “Capture” boop bubble.
- Click the bubble, then click the highlighted smart area to capture a detected box/card/dialog automatically.
- Drag across the page any time you want to override smart capture with a manual selection.
- The capture is automatically copied to your clipboard.
- Captures are saved to a Chrome side panel with quick actions: copy, open in a new tab, download, delete, and clear all.

## Load locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.
5. Visit any regular webpage, shake your mouse, and click **Capture**.

> Chrome does not allow content scripts on browser-owned pages such as `chrome://extensions`, the Chrome Web Store, or some internal/new-tab pages. Test on a normal website or local page.

## How it works

- `src/content.js` detects a quick mouse shake, renders the capture bubble, scores DOM elements under the cursor for smart box/card capture, and still supports manual drag selection.
- `src/background.js` captures the visible tab via `chrome.tabs.captureVisibleTab`.
- `src/content.js` crops the captured image to the selected area, copies it to the clipboard, and stores metadata.
- `src/sidepanel.html`, `src/sidepanel.css`, and `src/sidepanel.js` render the capture history and actions.

## Privacy

Captures are stored locally in `chrome.storage.local`. No server is used.
