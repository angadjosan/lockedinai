const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cameraAPI', {
  onCaptureRequest: (callback) => {
    ipcRenderer.on('capture-frame', () => callback());
  },
  sendFrame: (base64Data) => {
    ipcRenderer.send('frame-captured', base64Data);
  },
});
