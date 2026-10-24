"""合成一段温暖、无压迫感的循环 BGM（音乐盒 + 软垫 + 低音）。
C 大调，72 BPM，8 小节 = 26.67 秒；混响尾巴折回开头，循环无接缝。
输出：assets/bgm.mp3（64 kbps 单声道）
"""
import numpy as np
import pathlib

SR = 44100
BPM = 72.0
BAR = 4 * 60 / BPM          # 3.3333s
BARS = 8
DUR = BAR * BARS            # 26.667s
N = int(round(SR * DUR))
TAIL = int(SR * 2.6)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def add(buf, sig, at):
    i = int(round(at * SR))
    if i < 0:
        sig = sig[-i:]
        i = 0
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i]


def music_box(midi, dur=2.0, amp=1.0):
    """音乐盒音色：正弦为主，泛音快速衰减，起音极短。"""
    f = hz(midi)
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = (1.00 * np.sin(2 * np.pi * f * t) * np.exp(-t / 1.05)
           + 0.38 * np.sin(2 * np.pi * 2.00 * f * t) * np.exp(-t / 0.55)
           + 0.16 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t / 0.34)
           + 0.07 * np.sin(2 * np.pi * 4.18 * f * t) * np.exp(-t / 0.22))
    sig *= np.minimum(1.0, t / 0.005)          # 5ms 起音，避免爆音
    return sig * amp * 0.52


def pad_note(midi, dur, amp=1.0):
    f = hz(midi)
    n = int((dur + 1.6) * SR)
    t = np.arange(n) / SR
    sig = (np.sin(2 * np.pi * f * t) + 0.10 * np.sin(2 * np.pi * 2 * f * t)) / 1.10
    a = int(0.9 * SR)
    r = int(1.5 * SR)
    e = np.ones(n)
    e[:a] *= np.linspace(0, 1, a) ** 1.4
    e[-r:] *= np.linspace(1, 0, r) ** 1.6
    return sig * e * amp * 0.30


def bass_note(midi, dur, amp=1.0):
    f = hz(midi)
    n = int((dur + 0.9) * SR)
    t = np.arange(n) / SR
    sig = (np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t)) / 1.18
    a = int(0.08 * SR)
    r = int(0.8 * SR)
    e = np.ones(n)
    e[:a] *= np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r) ** 1.5
    return sig * e * amp * 0.34


# C – G – Am – F – C – G – F – C
chords = [
    ([60, 64, 67, 72], 36),
    ([59, 62, 67, 71], 43),
    ([57, 60, 64, 69], 45),
    ([57, 60, 65, 69], 41),
    ([60, 64, 67, 72], 36),
    ([59, 62, 67, 71], 43),
    ([57, 60, 65, 69], 41),
    ([60, 64, 67, 72], 36),
]

arp = np.zeros(N + TAIL)
pad = np.zeros(N + TAIL)
bass = np.zeros(N + TAIL)

# 八分音符琶音：0 1 2 3 2 1 2 1，重拍稍响
pattern = [0, 1, 2, 3, 2, 1, 2, 1]
steps = 8
step_dur = BAR / steps

for b, (chord, root) in enumerate(chords):
    t0 = b * BAR
    for k, idx in enumerate(pattern):
        note = chord[idx]
        at = t0 + k * step_dur
        vel = 0.95 if k in (0, 4) else (0.75 if k in (2, 6) else 0.62)
        # 高八度偶尔加一点亮色，保持清淡
        add(arp, music_box(note + 12, 2.2, vel), at)
    for note in chord[:3]:
        add(pad, pad_note(note, BAR, 0.9), t0)
    add(bass, bass_note(root, BAR * 0.95, 1.0), t0)


def reverb(x, decay=1.1, length=1.8, seed=0):
    r = np.random.default_rng(seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t / decay)
    ir = np.convolve(ir, np.array([0.75, 0.25]), mode="same")
    ir /= np.abs(ir).sum() ** 0.62
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    Y = np.fft.rfft(x, size) * np.fft.rfft(ir, size)
    return np.fft.irfft(Y, size)[: len(x)]


# 单声道混音：琶音为主，垫子与低音托底，混响很浅
dry = arp * 1.0 + pad * 1.0 + bass * 1.0
left = dry + reverb(arp, 1.1, 1.8, 7) * 0.16 + reverb(pad, 1.6, 2.2, 13) * 0.10
right = dry + reverb(arp, 1.1, 1.8, 23) * 0.16 + reverb(pad, 1.6, 2.2, 31) * 0.10

mix = np.stack([left, right], axis=1)
head = mix[:TAIL].copy()
head += mix[N:N + TAIL]           # 尾巴折回开头
mix = mix[:N].copy()
mix[:TAIL] = head

mix -= mix.mean(axis=0, keepdims=True)
mix = np.tanh(mix * 0.85)
rms = float(np.sqrt((mix ** 2).mean()))
mix *= 0.15 / max(1e-9, rms)
peak = float(np.abs(mix).max())
if peak > 0.92:
    mix *= 0.92 / peak

f = int(0.03 * SR)
mix[:f] *= np.linspace(0, 1, f)[:, None]
mix[-f:] *= np.linspace(1, 0, f)[:, None]

mono = mix.mean(axis=1)
pcm = (np.clip(mono, -1, 1) * 32767).astype(np.int16)
print("peak", round(float(np.abs(mix).max()), 3), "rms", round(float(np.sqrt((mix ** 2).mean())), 3))

import lameenc

enc = lameenc.Encoder()
enc.set_channels(1)
enc.set_in_sample_rate(SR)
enc.set_bit_rate(64)
enc.set_quality(3)
data = enc.encode(pcm.tobytes()) + enc.flush()

out = pathlib.Path(r"E:\大肥鱼工作区\aqing\assets\bgm.mp3")
out.write_bytes(bytes(data))
print(out.name, round(out.stat().st_size / 1024), "KB", round(len(pcm) / SR, 2), "s")
