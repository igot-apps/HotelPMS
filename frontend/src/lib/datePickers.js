// Every date/time field opens its calendar picker when clicked or typed into,
// so staff and guests pick dates instead of typing them.
const PICKER_TYPES = new Set(['date', 'datetime-local', 'time', 'month', 'week']);
const KEEP_KEYS = new Set(['Tab', 'Escape', 'Enter', 'Shift']);

const isPickerInput = (target) => target instanceof HTMLInputElement && PICKER_TYPES.has(target.type) && !target.disabled && !target.readOnly;

function openPicker(input) {
  try { input.showPicker?.(); } catch { /* Older browsers or blocked contexts keep their default behaviour. */ }
}

export function enableDatePickers(root = document) {
  root.addEventListener('click', (event) => { if (isPickerInput(event.target)) openPicker(event.target); });
  root.addEventListener('keydown', (event) => {
    if (!isPickerInput(event.target) || KEEP_KEYS.has(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
    // Typed characters open the picker instead of editing the date by hand.
    if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      openPicker(event.target);
    }
  });
}
