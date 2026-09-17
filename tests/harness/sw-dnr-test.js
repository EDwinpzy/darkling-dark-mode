const path = require("node:path"), fs = require("node:fs"), os = require("node:os"), { execSync } = require("node:child_process");
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
(async () => {
  const ext = path.resolve("D:/MyProjects/darkling-dark-mode"), udd = fs.mkdtempSync(path.join(os.tmpdir(), "dl-dnr-"));
  const ctx = await chromium.launchPersistentContext(udd, { headless: true, channel: "chromium", viewport: { width: 800, height: 600 }, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--no-first-run"] });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  const url = "https://post.sspai.com/styles.cd3800d3.css";
  const r = await sw.evaluate(async (u) => {
    const out = {};
    try {
      const escaped = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [9001],
        addRules: [{ id: 9001, priority: 1, action: { type: "modifyHeaders", requestHeaders: [{ header: "Referer", operation: "set", value: "https://sspai.com/" }] }, condition: { regexFilter: "^" + escaped + "$", resourceTypes: ["xmlhttprequest"] } }]
      });
      const a = await fetch(u, { cache: "no-store", credentials: "omit" });
      out.dnrReferer = a.status + " len=" + (await a.text()).length;
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [9001] });
    } catch (e) { out.dnrReferer = "ERR " + e.message; }
    return out;
  }, url);
  console.log(JSON.stringify(r, null, 1));
  await ctx.close();
  fs.rmSync(udd, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
