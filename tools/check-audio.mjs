// 检查 BGM：能否解码、时长、播放进度
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(path.join(root, 'index.html')).href + '?skip=1';

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--remote-debugging-port=9336',
  `--user-data-dir=${path.join(root, '.chrome-audio')}`,
  '--autoplay-policy=no-user-gesture-required',
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });

try {
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    try { t = await (await fetch('http://127.0.0.1:9336/json/new?about:blank', { method: 'PUT' })).json(); } catch { await sleep(250); }
  }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url });
  await sleep(4000);

  const evalx = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

  console.log('audio:', await evalx(`(() => {
    const a = document.getElementById('bgm');
    return { src: a.currentSrc.split('/').pop(), dur: a.duration, ready: a.readyState,
             err: a.error && a.error.code, paused: a.paused, vol: +a.volume.toFixed(2),
             btn: document.getElementById('mute').textContent };
  })()`));

  await evalx(`document.getElementById('mute').click()`);
  await sleep(1200);
  console.log('after mute:', await evalx(`(() => { const a = document.getElementById('bgm'); return { paused: a.paused, vol: +a.volume.toFixed(2), btn: document.getElementById('mute').textContent, cls: document.getElementById('mute').className }; })()`));

  await evalx(`document.getElementById('mute').click()`);
  await sleep(2500);
  console.log('after unmute:', await evalx(`(() => { const a = document.getElementById('bgm'); return { paused: a.paused, t: +a.currentTime.toFixed(2), vol: +a.volume.toFixed(2) }; })()`));
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}
