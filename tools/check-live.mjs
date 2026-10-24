// 验证公网链接：真实浏览器打开 → 启封 → 截图
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'shots');
mkdirSync(shots, { recursive: true });
const url = process.argv[2];
if (!url) { console.error('用法: node tools/check-live.mjs <url>'); process.exit(1); }

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=9335',
  `--user-data-dir=${path.join(root, '.chrome-live')}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.value;
};

try {
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    try { t = await (await fetch('http://127.0.0.1:9335/json/new?about:blank', { method: 'PUT' })).json(); }
    catch { await sleep(250); }
  }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url });
  await sleep(9000);

  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(path.join(shots, name + '.png'), Buffer.from(data, 'base64'));
  };

  console.log('gate present:', await evaluate(`!!document.getElementById('gate')`));
  await shot('live-gate');
  await evaluate(`document.getElementById('gate') && document.getElementById('gate').click()`);
  await sleep(3000);
  await shot('live-cover');
  await evaluate(`document.querySelectorAll('.scene')[2].scrollIntoView({behavior:'auto',block:'start'})`);
  await sleep(2500);
  await shot('live-her');
  console.log('img loaded:', await evaluate(`[...document.images].map(i => i.currentSrc.slice(0, 40) + ' ' + i.naturalWidth + 'x' + i.naturalHeight + ' complete=' + i.complete)`));
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
