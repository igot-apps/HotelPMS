---
name: mobile-layout
description: Check and fix HideOut24 phone layouts so no button is hidden or blocked — dialogs covered by the header, update banner or bottom tab bar, buttons pushed off-screen, taps landing on the wrong thing. Use when building or changing any page, dialog, sheet or fixed bar in the frontend, when the user reports a button they can't see or tap on a phone, or when asked to audit one page or all pages for mobile problems.
---

# Mobile layout: no hidden or blocked buttons

Every button must be visible and tappable on a phone (375×812 and smaller), in the browser and in the installed app on iPhone.

## Rules for every page and dialog

1. **Dialogs cover the whole screen.** A dialog's backdrop is `fixed inset-0` with `z-50` or higher and sits above the header, update banner and tab bar.
   - Never put `-webkit-overflow-scrolling: touch`, `transform`, `filter`, `backdrop-filter`, `perspective`, `contain` or `will-change: transform` on an element that wraps a dialog. On iPhone these trap the dialog inside that element, so the header and tab bar cover its buttons and taps on them fail. This was the real cause of the room-issue dialog bug, fixed in `e80e83a`.
   - If a dialog must live inside such a wrapper, render it with `createPortal(…, document.body)`.
2. **Mark every dialog** with `role="dialog" aria-modal="true"`, or use the `mobile-dialog-overlay` class. `frontend/src/index.css` hides the phone tab bar while any marked dialog is open.
3. **Dialogs fit and scroll.** Cap the panel with `max-h-[calc(100dvh-2rem)] overflow-y-auto`, or use `mobile-dialog-overlay`. Use `dvh`, never `vh` or `h-screen`, for heights that must fit the visible screen: on phones `vh` includes the browser bars.
4. **Action buttons stay reachable.** Cancel and Submit sit at the end of the scrolling panel or in a sticky footer inside it. They must never be in a separate fixed bar that a tab bar could cover.
5. **App bars that must stay tappable during a dialog** sit above dialogs with `relative z-[70]`. Today that is only the update banner (`UpdatePrompt.jsx`). Use this sparingly.
6. **Fixed bottom bars** respect `env(safe-area-inset-bottom)`.
7. **Tap targets** are at least 44px high (`min-h-11`).

## Check one page or all pages

Run from the repo root:

```bash
node .agents/skills/mobile-layout/scripts/check-mobile-layout.mjs
```

```bash
node .agents/skills/mobile-layout/scripts/check-mobile-layout.mjs frontend/src/pages/HousekeepingPage.jsx
```

- With no argument it checks every file in `frontend/src`. With a file or folder it checks only those.
- **ERROR** results (`ios-scroll-trap`) must be fixed.
- **WARN** results are candidates to look at:
  - `unmarked-overlay`: a full-screen overlay not marked as a dialog, so the tab bar stays on top of it.
  - `no-scroll`: an overlay whose panel can't scroll.
  - `vh-height`: a height in `vh` instead of `dvh`.
- The source check can't see wrapper styles applied at runtime, so also run the browser probe below on anything you changed.

## Browser probe (exact, per dialog)

1. Start the frontend and set the browser to the mobile preset (375×812).
2. Open the page and open the dialog.
3. Run the whole of `scripts/probe-dialog.js` in the page, with the browser JavaScript tool or the DevTools console. It returns JSON:
   - `ok: true`: every control in the open dialog is on screen after scrolling, and a tap on it hits it.
   - `problems[]` lists any trapping wrapper (with the style responsible), a backdrop that doesn't cover the screen, controls that stay off screen, and controls covered by something else (it names the element and says if it is inside a nav).
4. Repeat for each dialog you touched. For a full audit, go through each role's main pages (cleaner, receptionist, manager) and open their dialogs.

## Fixing

- Fix the cause, not the symptom: remove the trapping style or portal the dialog, rather than raising z-index again and again.
- Keep the change to the layout classes. Don't change business logic.
- After fixing, rerun the source check on the files you touched, rerun the probe on the dialog, and build the frontend (`cd frontend && npx vite build`).
- Tell the user it still needs a check on a real iPhone. Desktop browsers don't reproduce every iOS behaviour, and the installed app only gets the fix after the update banner's **Update**, or after the app is closed and reopened.
