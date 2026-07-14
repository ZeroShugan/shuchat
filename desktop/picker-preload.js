// Preload for the screen-share source picker window.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sharePicker', {
  getSources: () => ipcRenderer.invoke('sharepicker:get-sources'),
  choose: (id, audio) => ipcRenderer.send('sharepicker:choose', { id, audio }),
});
