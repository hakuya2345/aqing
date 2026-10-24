"""合成一段 60 秒、可无缝循环的温暖氛围 BGM（无外部素材）。
F 大调，56 BPM，14 小节 = 60.0s；尾部混响折回开头，循环无接缝。
输出：assets/bgm.mp3（96 kbps 立体声）
"""
import numpy as np
import pathlib

SR = 44100
BPM = 56.0
BAR = 4 * 60 / BPM          # 4.285714s
BARS = 7
DUR = BAR * BARS            # 60.0s
N = int(round(SR * DUR))
TAIL = int(SR * 3.0)

rng = np.random.default_rng(20261021)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def env(n, attack, release, sustain=1.0):
    a = max(1, int(attack * SR))
    r = max(1, int(release * SR))
    e = np.full(n, sustain, dtype=np.float64)
    a = min(a, n)
    e[:a] *= np.linspace(0, 1, a) ** 1.6
    r = min(r, n)
    if r > 1:
        e[-r:] *= np.linspace(1, 0, r) ** 1.5
    return e


def add(buf, sig, at):
    i = int(at * SR)
    if i < 0:
        sig = sig[-i:]
        i = 0
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i]


# ---- 和声 ----
F, A, Bb, C, D = 53, 57, 58, 60, 62
chords = [
    [F, A + 12, C + 12, 64, 67],        # Fmaj9
    [A, C + 12, 64, 67],                # Am7
    [Bb, 62, 65, 69],                   # Bbmaj7
    [C + 12, 64, 67, 69],               # C6
    [62, 65, 69, 72],                   # Dm7
    [Bb, 62, 65, 69],                   # Bbmaj7
    [C + 12, 64, 67, 69],               # C6
]
prog = chords


def pad_note(midi, dur, detune_cents=0.0, amp=1.0):
    f = hz(midi) * 2 ** (detune_cents / 1200.0)
    n = int((dur + 2.6) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.0016 * np.sin(2 * np.pi * (0.13 + rng.random() * 0.1) * t + rng.random() * 6)
    # 相位用积分近似，避免频率抖动带来的咔嗒
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    sig = (np.sin(ph) + 0.20 * np.sin(2 * ph + 0.4) + 0.06 * np.sin(3 * ph + 1.1)) / 1.26
    sig *= env(n, 1.5, 2.4, 1.0)
    return sig * amp


def bell_note(midi, dur, amp=1.0):
    f = hz(midi)
    n = int((dur + 2.0) * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for k, a in ((1, 1.0), (2.0, 0.26), (3.0, 0.10), (4.02, 0.04)):
        sig += a * np.sin(2 * np.pi * f * k * t) * np.exp(-t / (1.7 / k ** 0.6))
    sig *= env(n, 0.012, 0.5, 1.0)
    return sig * amp


def bass_note(midi, dur, amp=1.0):
    f = hz(midi)
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    sig = (np.sin(2 * np.pi * f * t) + 0.16 * np.sin(4 * np.pi * f * t)) / 1.16
    sig *= env(n, 0.35, 1.1, 1.0)
    return sig * amp


pad = np.zeros(N + TAIL)
bells = np.zeros(N + TAIL)
bass = np.zeros(N + TAIL)
pad_l = np.zeros(N + TAIL)
bells_l = np.zeros(N + TAIL)

for b, chord in enumerate(prog):
    t0 = b * BAR
    # 铺底：两个失谐声部左右分开
    for k, m in enumerate(chord):
        a = 0.55 if k == 0 else 0.42
        add(pad, pad_note(m, BAR * 1.02, -3.5, a), t0)
        add(pad_l, pad_note(m, BAR * 1.02, +3.5, a), t0)
    add(bass, bass_note(chord[0] - 12, BAR * 0.98, 1.0), t0)

    # 铃声：每小节 2~3 声，落在和弦音上，轻微错拍
    beats = [0.0, 2.0] if b % 2 == 0 else [1.0, 3.0]
    for i, bt in enumerate(beats):
        m = chord[(b + i * 2 + 1) % len(chord)] + 12
        vel = 0.55 + rng.random() * 0.25
        at = t0 + bt * (BAR / 4) + (rng.random() - 0.5) * 0.06
        add(bells, bell_note(m, 2.0, vel), at)
        add(bells_l, bell_note(m, 2.0, vel * 0.85), at + 0.012)


def reverb(x, decay=1.35, length=2.2, seed=0):
    r = np.random.default_rng(seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t / decay)
    # 简单一阶低通，让混响发闷一点
    ir = np.convolve(ir, np.array([0.72, 0.28]), mode="same")
    ir /= np.abs(ir).sum() ** 0.62
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    Y = np.fft.rfft(x, size) * np.fft.rfft(ir, size)
    return np.fft.irfft(Y, size)[: len(x)]


left = pad * 0.85 + pad_l * 0.35 + bells * 0.8 + bells_l * 0.3 + bass * 0.55
right = pad * 0.35 + pad_l * 0.85 + bells * 0.3 + bells_l * 0.8 + bass * 0.55

left = left + reverb(left, seed=11) * 0.30
right = right + reverb(right, seed=29) * 0.30

# 尾巴折回开头，保证循环无缝
mix = np.stack([left, right], axis=1)
head = mix[:TAIL].copy()
head += mix[N:N + TAIL]
mix = mix[:N].copy()
mix[:TAIL] = head

mix -= mix.mean(axis=0, keepdims=True)
mix = np.tanh(mix * 0.9)
# 按 RMS 定标，做成"很轻的一层底"，而不是满响度
rms = float(np.sqrt((mix ** 2).mean()))
mix *= 0.15 / max(1e-9, rms)
peak = float(np.abs(mix).max())
if peak > 0.92:
    mix *= 0.92 / peak
# 首尾各 30ms 微淡入淡出，消除任何残余爆音
f = int(0.03 * SR)
mix[:f] *= np.linspace(0, 1, f)[:, None]
mix[-f:] *= np.linspace(1, 0, f)[:, None]

mono = mix.mean(axis=1)
pcm = (np.clip(mono, -1, 1) * 32767).astype(np.int16)
print("peak", float(np.abs(mix).max()), "rms", float(np.sqrt((mix ** 2).mean())))

import lameenc

enc = lameenc.Encoder()
enc.set_channels(1)
enc.set_in_sample_rate(SR)
enc.set_bit_rate(48)
enc.set_quality(3)
data = enc.encode(pcm.tobytes())
data += enc.flush()

out = pathlib.Path(r"E:\大肥鱼工作区\aqing\assets\bgm.mp3")
out.write_bytes(bytes(data))
print(out.name, round(out.stat().st_size / 1024), "KB", round(len(pcm) / SR, 2), "s")



