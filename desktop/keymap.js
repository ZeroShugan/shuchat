// Map browser KeyboardEvent.code values (what the ShuChat web app stores as the
// push-to-talk keybind) to uiohook-napi keycodes for the global hotkey.
let UiohookKey = {};
try {
  // eslint-disable-next-line global-require
  ({ UiohookKey } = require('uiohook-napi'));
} catch (e) {
  // uiohook not available — mapping stays empty and global PTT is disabled
}

const map = {};

// Letters: KeyA..KeyZ
for (let i = 0; i < 26; i += 1) {
  const letter = String.fromCharCode(65 + i);
  if (UiohookKey[letter] !== undefined) map[`Key${letter}`] = UiohookKey[letter];
}
// Digits: Digit0..Digit9
for (let i = 0; i <= 9; i += 1) {
  if (UiohookKey[String(i)] !== undefined) map[`Digit${i}`] = UiohookKey[String(i)];
}
// Function keys F1..F24
for (let i = 1; i <= 24; i += 1) {
  if (UiohookKey[`F${i}`] !== undefined) map[`F${i}`] = UiohookKey[`F${i}`];
}

const named = {
  Space: 'Space',
  Tab: 'Tab',
  CapsLock: 'CapsLock',
  Backquote: 'Backquote',
  Minus: 'Minus',
  Equal: 'Equal',
  BracketLeft: 'BracketLeft',
  BracketRight: 'BracketRight',
  Backslash: 'Backslash',
  Semicolon: 'Semicolon',
  Quote: 'Quote',
  Comma: 'Comma',
  Period: 'Period',
  Slash: 'Slash',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ShiftLeft: 'Shift',
  ShiftRight: 'ShiftRight',
  ControlLeft: 'Ctrl',
  ControlRight: 'CtrlRight',
  AltLeft: 'Alt',
  AltRight: 'AltRight',
  MetaLeft: 'Meta',
  MetaRight: 'MetaRight',
  Numpad0: 'Numpad0',
  Numpad1: 'Numpad1',
  Numpad2: 'Numpad2',
  Numpad3: 'Numpad3',
  Numpad4: 'Numpad4',
  Numpad5: 'Numpad5',
  Numpad6: 'Numpad6',
  Numpad7: 'Numpad7',
  Numpad8: 'Numpad8',
  Numpad9: 'Numpad9',
};
Object.entries(named).forEach(([code, uioName]) => {
  if (UiohookKey[uioName] !== undefined) map[code] = UiohookKey[uioName];
});

module.exports = { codeToUiohook: map };
