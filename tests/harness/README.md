# 测试工具说明

所有脚本都依赖全局安装的 Playwright（`npm i -g playwright` 并已下载 Chromium）。

| 命令 | 作用 |
| --- | --- |
| `node --test tests/dark-mode-regression.test.js` | 静态回归：确认引擎补丁仍在、两个 bundle 可编译（秒级） |
| `node tests/harness/check-fixtures.js` | 端到端：加载扩展打开本地 fixture，断言现代 CSS 页面全黑、无低对比度文字，且引擎无法处理的页面会自动切到 filter 兜底 |
| `node tests/harness/run.js <url…> [--dark-scheme] [--wait=ms] [--headed] [--shot=dir]` | 对任意网址做诊断：视口亮度采样、低对比度文字、样式表处理情况、注入的样式、是否触发兜底，并保存截图 |
| `node tests/harness/run.js <url> --probe='<selector>'` | 列出匹配元素并设置 `color` 的所有规则（站点规则 + 引擎覆盖规则），用于定位"谁把文字画成这个颜色" |
| `node tests/harness/run.js <url> --eval=<file.js>` | 在扩展生效的页面里执行任意表达式并打印结果 |
| `node tests/harness/make-before.js` | 把引擎补丁逆向还原到临时目录，配合 `run.js --ext=<dir>` 做补丁前后 A/B |
| `node tests/harness/serve.js [port]` | 启动 fixture 静态服务（`check-fixtures.js` 会自动启动） |
| `node tests/harness/sw-dnr-test.js` | 单独验证 Service Worker 里 declarativeNetRequest 注入 Referer 抓取防盗链 CSS 是否可用 |

Fixture 位于 `tests/fixtures/`：`modern-css.html` 覆盖 `@layer`（含 `!important` 工具类）、CSS 嵌套、
`@container`、`@scope`、`@supports`、oklch / color-mix / light-dark / 相对颜色、Tailwind v3/v4 与
shadcn 的变量写法、渐变文字；`adopted-late.html` 覆盖"加载后才挂载/修改 constructable stylesheet"
（含 shadow root 内 `::slotted`）；`filter-fallback.html` 引用一份扩展抓不到的跨域样式表，用来验证兜底。
