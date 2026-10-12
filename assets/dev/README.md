# Developer panel (optional module)

This folder is a plug-in. The site works the same with or without it.

| File | What it is |
|---|---|
| `dev-panel.js` | The panel: page shortcuts, partner panels, demo log-ins for each role (the only place their passwords are written down), test switches, Doode controls, saved-data viewer and reset. |
| `dev-panel.css` | Its styles. `dev-panel.js` loads this file itself. |

## How it plugs in

Every page loads `assets/js/dev-slot.js` (the "slot"). The slot downloads nothing until someone presses **Insert + Delete** together; only then does it load `assets/dev/dev-panel.js`.

## Unplug it (e.g. before going live)

Delete this `assets/dev/` folder. That's all.

- No page links to these files directly, so nothing breaks or shows an error.
- Pressing Insert + Delete then does nothing (one quiet "not installed" note in the browser console).
- Test switches are kept per browser tab, so none can stay switched on for later visitors.
- The demo accounts still work on the normal log-in page; their passwords just aren't listed anywhere.

## Plug it back in

Copy the `dev` folder back into `assets/`.
