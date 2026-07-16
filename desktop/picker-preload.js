// Preload for the screen-share source picker window.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sharePicker', {
  getSources: () => ipcRenderer.invoke('sharepicker:get-sources'),
  // selection is an array of { id, audio } — one entry per chosen source.
  choose: (selection) => ipcRenderer.send('sharepicker:choose', selection || []),
});
