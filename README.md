# Darkling Dark mode

Chromium / Edge Manifest V3 暗黑模式扩展（4.0.7）的改造与修补版本。

扩展向页面注入暗色引擎，重写站点样式表；对引擎处理不了的页面回退到 `filter` 兜底，
并按域名维护黑名单。

## 结构

| 路径 | 说明 |
| --- | --- |
| `manifest.json` | MV3 清单：service worker、权限、locale、扩展公钥 |
| `js/background.js` | 后台 service worker，暗色引擎主体 |
| `js/content.js` | 页面侧注入脚本 |
| `js/fb.js` | filter 兜底实现 |
| `js/proxy.js` | web 可访问资源脚本 |
| `js/popup.js`、`popup/` | 弹窗 UI 与样式 |
| `config/styles.txt` | 站点样式覆盖表与 `INVERT` 规则 |
| `config/blacklist.txt` | 默认黑名单域名 |
| `_locales/` | `en`、`zh_CN` 文案 |
| `tests/` | 回归测试与 Playwright 诊断工具 |

## 测试

静态回归（秒级，不需要额外依赖）：

```bash
node --test tests/dark-mode-regression.test.js
```

端到端诊断工具依赖全局 Playwright 与 Chromium（`npm i -g playwright`），
各脚本用途见 `tests/harness/README.md`。

## 本地加载

在 `edge://extensions` 或 `chrome://extensions` 打开开发者模式，
选择“加载解压缩的扩展”，指向仓库根目录。
