import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3920;

const server = spawn('node', ['server.mjs'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: { ...process.env, PORT: String(PORT) }
});

server.on('error', (err) => { console.error('服务器启动失败:', err); process.exit(1); });

setTimeout(() => {
  const electron = spawn(
    path.join(__dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron'),
    [path.join(__dirname, 'electron', 'main.mjs')],
    {
      cwd: __dirname,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        CLOUD_DESKTOP_URL: `http://localhost:${PORT}`
      }
    }
  );

  electron.on('close', () => { server.kill(); process.exit(0); });
  electron.on('error', (err) => { console.error('Electron 启动失败:', err); });
}, 1500);

process.on('SIGINT', () => { server.kill(); process.exit(0); });
process.on('SIGTERM', () => { server.kill(); process.exit(0); });
