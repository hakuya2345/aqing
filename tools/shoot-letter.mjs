// 抓「拆信」动画的几个关键时刻
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'shots');
mkdirSync(shots, { recursive: true });
const url = pathToFileURL(path.join(root, 'index.html')).href + (process.env.CLICK ? '?skip=1' : '?skip=1&letter=1');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=9337',
  `--user-data-dir=${path.join(root, '.chrome-letter')}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });

try {
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    try { t = await (await fetch('http://127.0.0.1:9337/json/new?about:blank', { method: 'PUT' })).json(); } catch { await sleep(250); }
  }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  await send('Page.enable'); await send('Runtime.enable');
  const W = +(process.env.W || 390), H = +(process.env.H || 844), TAG = process.env.TAG || '';
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url });

  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(path.join(shots, name + '.png'), Buffer.from(data, 'base64'));
  };

  if (process.env.CLICK) {
    await sleep(1400);
    await send('Runtime.evaluate', { expression: "document.getElementById('heart').click()" });
    await sleep(900);  await shot(TAG + 'click-1');
    await sleep(900);  await shot(TAG + 'click-2');
    await sleep(1600); await shot(TAG + 'click-3');
  } else {
    // 页面加载后约 600ms 才触发 openLetter，这里从导航起算
    await sleep(1000); await shot(TAG + 'letter-1-envelope');
    await sleep(500);  await shot(TAG + 'letter-2-flap');
    await sleep(700);  await shot(TAG + 'letter-3-rise');
    await sleep(1400); await shot(TAG + 'letter-4-done');
  }

  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const s = document.querySelector('.sheet'), e = document.querySelector('.letter');
      const r = s.getBoundingClientRect(), er = document.querySelector('.env').getBoundingClientRect();
      return { shown: e.classList.contains('show'), sheet: [Math.round(r.top), Math.round(r.bottom), Math.round(r.height)],
               env: [Math.round(er.top), Math.round(er.bottom)], text: document.getElementById('letterLine').innerText.replace(/\\n/g,' / ') };
    })()`, returnByValue: true
  });
  console.log(JSON.stringify(info.result.value));
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}


