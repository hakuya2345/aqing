// CDP 截图 + 溢出检测
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'shots');
mkdirSync(shots, { recursive: true });
const fileUrl = pathToFileURL(path.join(root, 'index.html')).href;

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9334;
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(root, '.chrome-prof')}`,
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
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result?.value;
};

try {
  let target = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
      target = await r.json(); break;
    } catch { await sleep(250); }
  }
  if (!target) throw new Error('devtools 未就绪');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(path.join(shots, name + '.png'), Buffer.from(data, 'base64'));
  };

  async function pass(w, h, tag) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: fileUrl + '?skip=1' });
    await sleep(2400);
    const geo = await evaluate(`(() => ({
      vw: innerWidth, vh: innerHeight,
      scenes: [...document.querySelectorAll('.scene')].map(s => ({
        h: s.getBoundingClientRect().height, need: s.scrollHeight,
        over: s.scrollHeight - s.clientHeight,
        first: (s.querySelector('.wrap')?.getBoundingClientRect().top ?? 0) - s.getBoundingClientRect().top
      }))
    }))()`);
    console.log(tag, JSON.stringify(geo));
    for (let i = 0; i < 5; i++) {
      await evaluate(`document.querySelectorAll('.scene')[${i}].scrollIntoView({behavior:'auto',block:'start'})`);
      await sleep(1200);
      await shot(`${tag}-scene${i}`);
    }
  }

  await pass(390, 844, 'p390');
  await pass(360, 640, 'p360');

  // 启封页 + 点击后
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: fileUrl });
  await sleep(1600);
  await shot('p390-gate');
  await evaluate(`document.getElementById('gate').click()`);
  await sleep(2600);
  await shot('p390-opened');

  console.log('done');
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
