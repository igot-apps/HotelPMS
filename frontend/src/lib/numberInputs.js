// The mouse wheel changes a focused number field (e.g. a refund amount) by accident. Across the whole
// app, scrolling over a focused number field releases focus instead, so the value stays as typed and
// the page scrolls normally. Arrow keys and typing still work as usual.
export function disableWheelOnNumberInputs(root = document) {
  root.addEventListener('wheel', (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.type === 'number' && document.activeElement === input) input.blur();
  }, { capture: true, passive: true });
}
