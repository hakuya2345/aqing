// 量一下当前 bgm.mp3：时长、声道、峰值/RMS，用来定播放音量
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.URL || 'http://127.0.0.1:8787/?skip=1';

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--remote-debugging-port=9338',
  `--user-data-dir=${path.join(root, '.chrome-measure')}`,
  '--autoplay-policy=no-user-gesture-required',
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });

try {
  let t = null;
  for (let i = 0; i < 60 && !t; i++) {
    try { t = await (await fetch('http://127.0.0.1:9338/json/new?about:blank', { method: 'PUT' })).json(); } catch { await sleep(250); }
  }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  });
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url });
  await sleep(2500);

  const expr = `(async () => { try {
    const a = document.getElementById('bgm');
    const res = await fetch(a.currentSrc);
    const ab = await res.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(ab);
    let sum = 0, peak = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i += 7) { const v = d[i]; sum += v * v; peak = Math.max(peak, Math.abs(v)); n++; }
    }
    const rms = Math.sqrt(sum / n);
    return {
      bytes: ab.byteLength, duration: +buf.duration.toFixed(2),
      channels: buf.numberOfChannels, rate: buf.sampleRate,
      rmsDb: +(20 * Math.log10(rms)).toFixed(1),
      peakDb: +(20 * Math.log10(peak)).toFixed(1),
      elementDur: +a.duration.toFixed(2), err: a.error && a.error.code,
      kbps: +(ab.byteLength * 8 / buf.duration / 1000).toFixed(0)
    };
    } catch (e) { return { error: String(e) }; }
  })()`;

  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  console.log('raw:', JSON.stringify(r).slice(0, 600));
  console.log(JSON.stringify(r.result && r.result.value, null, 1));
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}


