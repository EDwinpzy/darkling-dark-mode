// Launches Chromium with the extension loaded, opens each URL and reports
// how dark the rendered page actually is plus which stylesheets the engine
// managed to process. Usage:
//   node tests/harness/run.js <url> [<url> ...] [--headed] [--wait=ms] [--shot=dir]
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execSync } = require("node:child_process");

const globalRoot = execSync("npm root -g").toString().trim();
const { chromium } = require(path.join(globalRoot, "playwright"));

const EXT_DIR = path.resolve((process.argv.find((a) => a.startsWith("--ext=")) || `--ext=${path.resolve(__dirname, "..", "..")}`).split("=")[1]);

const args = process.argv.slice(2);
const urls = args.filter((a) => !a.startsWith("--"));
const headed = args.includes("--headed");
const darkScheme = args.includes("--dark-scheme");
const waitMs = Number((args.find((a) => a.startsWith("--wait=")) || "--wait=4000").split("=")[1]);
const shotDir = (args.find((a) => a.startsWith("--shot=")) || "--shot=out/harness").split("=")[1];
const viewportHeight = Number((args.find((a) => a.startsWith("--vh=")) || "--vh=900").split("=")[1]);
const probeSelector = (args.find((a) => a.startsWith("--probe=")) || "--probe=").slice("--probe=".length);
const evalFile = (args.find((a) => a.startsWith("--eval=")) || "--eval=").slice("--eval=".length);

// Lists every rule (site and engine) that matches the element and touches `color`, in cascade order.
const PROBE = (selector) => `((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { error: "no element for " + sel };
    const hits = [];
    const walk = (rules, sheetLabel, ctx) => {
        for (const r of rules) {
            if (r.selectorText) {
                let ok = false; try { ok = el.matches(r.selectorText); } catch (e) {}
                if (ok && r.style && (r.style.color || r.style.webkitTextFillColor)) hits.push({ sheet: sheetLabel, ctx, selector: r.selectorText.slice(0, 80), color: r.style.color, fill: r.style.webkitTextFillColor, important: r.style.getPropertyPriority("color") });
                if (r.cssRules) walk(r.cssRules, sheetLabel, ctx + " > " + r.selectorText.slice(0, 4000));
            } else if (r.cssRules) walk(r.cssRules, sheetLabel, ctx + " > " + (r.cssText.split("{")[0].trim().slice(0, 4000)));
        }
    };
    for (const s of document.styleSheets) { let rules; try { rules = s.cssRules; } catch (e) { continue; } walk(rules, (s.ownerNode && s.ownerNode.className) || s.href || "inline", ""); }
    const cs = getComputedStyle(el);
    return { computedColor: cs.color, fill: cs.webkitTextFillColor, inlineStyle: el.getAttribute("style"), hits };
})(${JSON.stringify(selector)})`;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";

// Evaluated in the page: samples the viewport on a grid, resolves the first
// painted background behind each point, and returns luminance statistics.
const DIAG = `(() => {
    const lum = (r, g, b) => {
        const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    let cvs = null;
    const parse = (s) => {
        const m = s && s.match(/^rgba?\\(([^)]+)\\)$/);
        if (m) {
            const p = m[1].split(/[\\s,\\/]+/).map((x) => parseFloat(x));
            return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        }
        if (!s || s === "transparent") return null;
        // oklch()/color(srgb ...)/lab() computed values: rasterise to get sRGB channels.
        if (cvs === null) { const c = document.createElement("canvas"); c.width = c.height = 1; cvs = c.getContext("2d", { willReadFrequently: true }); }
        cvs.clearRect(0, 0, 1, 1); cvs.fillStyle = "rgba(0,0,0,0)"; cvs.fillStyle = s; cvs.fillRect(0, 0, 1, 1);
        const d = cvs.getImageData(0, 0, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    };
    const SKIP = new Set(["IMG", "VIDEO", "CANVAS", "SVG", "PICTURE", "IFRAME", "EMBED", "OBJECT"]);
    const w = innerWidth, h = innerHeight;
    const cols = 12, rows = 12;
    let light = 0, dark = 0, unknown = 0;
    const lightEls = new Map();
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = Math.floor((i + 0.5) * w / cols), y = Math.floor((j + 0.5) * h / rows);
        let el = document.elementFromPoint(x, y);
        if (!el) { unknown++; continue; }
        if (SKIP.has(el.tagName) || el.closest("svg")) continue;
        let found = null;
        for (let n = el; n; n = n.parentElement) {
            const cs = getComputedStyle(n);
            const c = parse(cs.backgroundColor);
            if (c && c.a > 0.5) { found = c; break; }
            if (cs.backgroundImage && cs.backgroundImage !== "none") { found = "image"; break; }
        }
        if (!found) { const c = parse(getComputedStyle(document.documentElement).backgroundColor); found = c && c.a > 0 ? c : null; }
        if (!found || found === "image") { unknown++; continue; }
        const L = lum(found.r, found.g, found.b);
        if (L > 0.5) {
            light++;
            const key = el.tagName + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "");
            lightEls.set(key, (lightEls.get(key) || 0) + 1);
        } else dark++;
    }
    const sheets = [...document.styleSheets].map((s) => {
        try { return { href: s.href, ok: true, n: s.cssRules.length, owner: s.ownerNode && s.ownerNode.className }; }
        catch (e) { return { href: s.href, ok: false, err: e.name }; }
    });
    // Text contrast: walk visible elements that own text and compare the
    // computed color against the first painted background behind them.
    const bgOf = (el) => {
        for (let n = el; n; n = n.parentElement) {
            const cs = getComputedStyle(n);
            const c = parse(cs.backgroundColor);
            if (c && c.a > 0.5) return c;
            if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
        }
        const c = parse(getComputedStyle(document.documentElement).backgroundColor);
        return c && c.a > 0 ? c : { r: 255, g: 255, b: 255 };
    };
    const contrast = (a, b) => { const la = lum(a.r, a.g, a.b), lb = lum(b.r, b.g, b.b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
    let textChecked = 0, lowContrast = 0;
    const worst = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let t; (t = walker.nextNode()) && textChecked < 600;) {
        if (!t.nodeValue.trim() || t.nodeValue.trim().length < 2) continue;
        const el = t.parentElement;
        if (!el || seen.has(el) || SKIP.has(el.tagName) || el.closest("script, style, noscript, svg")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.3) continue;
        const fg = parse(cs.color); if (!fg || fg.a < 0.5) continue;
        const bg = bgOf(el); if (!bg) continue;
        seen.add(el); textChecked++;
        const cr = contrast(fg, bg);
        if (cr < 2.5) { lowContrast++; if (worst.length < 10) worst.push({ text: t.nodeValue.trim().slice(0, 30), fg: cs.color, bg: "rgb(" + bg.r + "," + bg.g + "," + bg.b + ")", cr: +cr.toFixed(2), tag: el.tagName + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "") }); }
    }
    const injected = [...document.querySelectorAll("style.dmm2, link.dmm2")].map((s) => s.className + ":" + (s.textContent || "").length);
    const html = getComputedStyle(document.documentElement);
    const body = document.body ? getComputedStyle(document.body) : null;
    // Under the filter fallback the page is inverted at paint time, so computed colours read backwards.
    const inverted = document.documentElement.hasAttribute("data-darkling-filter");
    return {
        light: inverted ? dark : light, dark: inverted ? light : dark, unknown,
        textChecked, lowContrast, worst,
        lightEls: [...lightEls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
        htmlBg: html.backgroundColor, htmlColor: html.color, colorScheme: html.colorScheme,
        bodyBg: body && body.backgroundColor, bodyColor: body && body.color,
        rootAttrs: [...document.documentElement.attributes].filter((a) => /theme|mode|scheme|dark|light/i.test(a.name)).map((a) => a.name + "=" + a.value),
        sheets, injected,
        adopted: (document.adoptedStyleSheets || []).length,
        filterFallback: document.documentElement.hasAttribute("data-darkling-filter"),
        metaColorScheme: (document.querySelector('meta[name="color-scheme"]') || {}).content || null,
    };
})()`;

// Loads the extension, visits each URL and returns { url, diag, logs, screenshot } per page.
async function runPages(pageUrls, opts = {}) {
    const o = { headed, darkScheme, waitMs, shotDir, viewportHeight, extDir: EXT_DIR, quiet: false, ...opts };
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "darkling-harness-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: !o.headed,
        channel: "chromium",
        viewport: { width: 1280, height: o.viewportHeight },
        locale: "zh-CN",
        colorScheme: o.darkScheme ? "dark" : "light",
        userAgent: UA,
        args: [
            `--disable-extensions-except=${o.extDir}`,
            `--load-extension=${o.extDir}`,
            "--no-first-run",
            "--disable-blink-features=AutomationControlled",
        ],
    });
    // Give the service worker time to register the content scripts.
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 }).catch(() => null);
    if (!o.quiet) console.log("service worker:", sw ? sw.url() : "NONE");
    await new Promise((r) => setTimeout(r, 1500));

    fs.mkdirSync(o.shotDir, { recursive: true });
    const results = [];
    try {
        for (const url of pageUrls) {
            const page = await context.newPage();
            const logs = [];
            page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
            page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
            let gotoError = null;
            try {
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
            } catch (e) {
                gotoError = e.message;
            }
            await page.waitForTimeout(o.waitMs);
            const diag = await page.evaluate(DIAG).catch((e) => ({ error: e.message, light: 0, dark: 0, unknown: 0 }));
            const extra = {};
            if (probeSelector) extra.probe = await page.evaluate(PROBE(probeSelector)).catch((e) => ({ error: e.message }));
            const evalCode = o.evalCode || (evalFile ? fs.readFileSync(evalFile, "utf8") : null);
            if (evalCode) extra.eval = await page.evaluate(evalCode).catch((e) => ({ error: e.message }));
            const screenshot = path.join(o.shotDir, url.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) + ".png");
            await page.screenshot({ path: screenshot }).catch(() => {});
            await page.close();
            results.push({ url, gotoError, diag, logs, extra, screenshot });
        }
    } finally {
        await context.close();
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
    return results;
}

function report({ url, gotoError, diag, logs, extra }) {
    console.log("\n==============================");
    console.log("URL:", url);
    if (gotoError) console.log("goto error:", gotoError);
    const total = diag.light + diag.dark + diag.unknown;
    console.log(`darkness: dark=${diag.dark} light=${diag.light} unknown=${diag.unknown} (of ${total})`);
    console.log(`text contrast: ${diag.lowContrast} low-contrast of ${diag.textChecked} checked`);
    if (diag.worst && diag.worst.length) for (const wv of diag.worst) console.log("   LOW", wv.cr, wv.fg, "on", wv.bg, wv.tag, JSON.stringify(wv.text));
    console.log("root attrs:", diag.rootAttrs);
    console.log("html:", diag.htmlBg, "/", diag.htmlColor, "| body:", diag.bodyBg, "/", diag.bodyColor, "| color-scheme:", diag.colorScheme, "| meta:", diag.metaColorScheme, "| filter-fallback:", diag.filterFallback);
    console.log("injected:", diag.injected);
    console.log("adoptedStyleSheets:", diag.adopted);
    console.log("sheets:");
    for (const s of diag.sheets || []) console.log("  ", s.ok ? "OK  " : "FAIL", s.n ?? s.err, s.href || `(inline ${s.owner || ""})`);
    if (diag.lightEls && diag.lightEls.length) console.log("light elements:", diag.lightEls);
    const wanted = logs.filter((l) => /Darkling|dm-|error|Error|warn/i.test(l)).slice(0, 40);
    if (wanted.length) console.log("console:\n  " + wanted.join("\n  "));
    if (extra.probe) console.log("probe", probeSelector, "=>", JSON.stringify(extra.probe, null, 1));
    if (extra.eval) console.log("eval", evalFile, "=>", JSON.stringify(extra.eval, null, 1));
}

module.exports = { runPages, report };

if (require.main === module) {
    runPages(urls).then((results) => results.forEach(report)).catch((e) => { console.error(e); process.exit(1); });
}
