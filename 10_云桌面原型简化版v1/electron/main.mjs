import { app, BrowserWindow } from 'electron';

const BASE = process.env.CLOUD_DESKTOP_URL || 'http://localhost:3920';

function createMotherWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900,
    title: '云桌面 — 母机终端',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  win.loadURL(`${BASE}/terminal/mother`);
  return win;
}

function createControlledWindow() {
  const win = new BrowserWindow({
    width: 1024, height: 768,
    title: '云桌面 — 受控终端',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
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
