import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  showOpenDialog: (opts) => ipcRenderer.invoke('dialog:open', opts),
  showSaveDialog: (opts) => ipcRenderer.invoke('dialog:save', opts),
  isElectron: true
});
