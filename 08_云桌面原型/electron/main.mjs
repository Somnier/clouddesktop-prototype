import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE = process.env.CLOUD_DESKTOP_URL || 'http://localhost:3920';
const preloadPath = path.join(__dirname, 'preload.mjs');

/* ── IPC: file dialogs ── */
ipcMain.handle('dialog:open', async (_event, opts) => {
  return dialog.showOpenDialog(opts || {});
});
ipcMain.handle('dialog:save', async (_event, opts) => {
  return dialog.showSaveDialog(opts || {});
});

function createMotherWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900,
    title: '云桌面 — 母机终端',
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: preloadPath }
  });
  win.loadURL(`${BASE}/terminal/mother`);
  return win;
}

function createControlledWindow() {
  const win = new BrowserWindow({
    width: 1024, height: 768,
    title: '云桌面 — 受控终端',
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: preloadPath }
  });
  win.loadURL(`${BASE}/terminal/controlled`);
  return win;
}

app.whenReady().then(() => {
  const mother = createMotherWindow();
  const controlled = createControlledWindow();

  // 错开窗口位置
  mother.setPosition(80, 60);
  controlled.setPosition(560, 140);

  app.on('window-all-closed', () => app.quit());
});
