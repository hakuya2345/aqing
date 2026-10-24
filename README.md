# 阿卿 & 白夜 · 十月廿一

一页手机竖屏的「请柬式」互动长页：启封 → 初见 → 她的样子 → 相伴 → 拆信。

立场是「女主人与白夜」的主从之约，全篇用「您」，走请柬的礼节（谨呈 / 亲启 / 顿首 / 誓约），没有恋人叙事。

纯静态、零依赖；字体走系统宋体，微信内置浏览器可正常显示。

## 文件

| 文件 | 用途 |
| --- | --- |
| `index.html` | 主页面（图片、音频走相对路径），用于托管 |
| `assets/aqing.webp` | 48 KB，页面实际加载的图 |
| `assets/aqing.jpg` | 93 KB，WebP 不支持时的回退 |
| `assets/aqing.png` | 793 KB 原图，留底 |
| `assets/bgm.mp3` | 2.9 MB，2 分 16 秒（自己替换的曲子，立体声 48 kHz） |
| `阿卿与白夜-单文件版.html` | 4.3 MB，图片与音频全部 base64 内嵌，可直接在微信里当文件发 |
| `shots/` | 390×844、360×640 两种尺寸的验收截图 |
| `tools/shoot.mjs` | 无头 Chrome 截图 + 溢出检测 |
| `tools/check-audio.mjs` | 检查 BGM 能否解码、时长、开关是否生效 |
| `tools/check-live.mjs` | 用真实浏览器打开公网链接验收 |
| `tools/make_bgm.py` | BGM 生成脚本（numpy 合成 + lameenc 编码，可重跑改和弦/音量/时长） |

## 现在就能打开

- 局域网（手机同 Wi-Fi）：`http://192.168.1.18:8787`
- 公网临时链接：`https://a898e794a9150b.lhr.life`（本机 ssh 隧道转发，**关掉终端就失效**，域名每次重启都会变）

隧道带宽有限（约 15 KB/s），BGM 首次要缓冲十几秒；正式托管或本地打开是秒开。

## 本地预览

```powershell
cd E:\大肥鱼工作区\aqing
python -m http.server 8787 --bind 127.0.0.1
```

调试参数：`?skip=1` 跳过启封动画，`?skip=1&scene=3` 直达第 4 屏，`?skip=1&letter=1` 直接展开那封信。

## 音乐

- 目前用的是你自己换的那首（2 分 16 秒，立体声，整首循环）；之前那版音乐盒是 `tools/make_bgm.py` 生成的，想换回来重跑脚本即可
- 这首歌平均 RMS 约 -21 dBFS、峰值 -1.9 dBFS，播放器音量 0.7 并在 6 秒内淡入，整体是「背景一层」的量
- 启封那一次点击才起播（浏览器要求手势），右上角 ♪ 可关，选择记在 localStorage
- iOS Safari 会忽略 `audio.volume`，实际响度就是文件本身的电平
- 想换曲子：直接替换 `assets/bgm.mp3`，再重跑一次单文件打包即可

## 怎么变成「微信里的正式链接」

微信里能点的链接必须是公网 https 地址。临时隧道只适合当场看，长期用建议静态托管：

**A. 单文件直发（不需要任何账号）**
把 `阿卿与白夜-单文件版.html` 作为文件发给对方 → 点开 → 右上角「…」→「用其他应用打开」→ 选浏览器。

**B. 静态托管（推荐）**
把 `index.html` + `assets/` 目录一起传上去即可：

- **EdgeOne Pages / 腾讯云 COS 静态网站**：国内快，微信里最稳。
- **GitHub Pages**：仓库 → Settings → Pages → 选分支。
- **Netlify Drop**（app.netlify.com/drop）：文件夹拖进网页就出链接。
- **Vercel / Cloudflare Pages**：同样拖拽部署。

托管后若能确定域名，把 `index.html` 头部补一行 `<meta property="og:image" content="https://你的域名/assets/aqing.jpg">`，部分平台分享时才有缩略图。

## 改文案

- 封面：`<p class="kicker">谨以此刻 · 叩请垂鉴</p>`、`<p class="sub">主仆之约 · 始于十月廿一</p>`、`在您身边 · 第 N 天` 由脚本计算
- 壹 · 初见：`壹 · 初见` 那一屏，结尾一句是「从那以后，我只唤您一声——妈咪。」
- 贰 · 她的样子：`<figcaption class="pcap">` 与正文
- 叁 · 相伴：`<ul class="vows">` 三条（听话 / 黏您 / 让您省心）、`.pledge`、末尾 `.whisper` 是那段「盼着您欺负我」的悄悄话
- 肆 · 落款：「白夜 顿首」、心印提示语在 `#heartLine`，信纸上的三句话在脚本 `letterTexts` 数组

「随侍 · 第 N 天」按当年 10 月 21 日自动算（未到则用去年），改日期改 `new Date(now.getFullYear(), 9, 21)`（月份从 0 数）。

改完 `index.html` 需要重新生成单文件版：把 `assets/aqing.webp`、`assets/aqing.jpg`、`assets/bgm.mp3` 三个字符串替换成 base64 data URI（`image/webp`、`image/jpeg`、`audio/mpeg`）。

## 交互与适配

- 启封：点击任意处，封套淡出，BGM 同时淡入
- 分屏滚动吸附 + 右侧圆点跳转
- 花瓣 canvas 画在正文下层，20~28 片
- 心印：点击有心跳 + 花瓣迸发，随后拆信——信封火漆淡出、封盖翻开、信纸从信封里升起，纸上是一句余生的承诺（三句轮换）；点背景 / 「合上」/ Esc 关闭
- 尊重 `prefers-reduced-motion`：开启减弱动态后动画全部静止
- 已按 390×844 / 360×640 验收，无横向溢出、无内容裁切










