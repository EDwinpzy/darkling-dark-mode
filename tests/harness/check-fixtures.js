// End-to-end check of the engine against the local fixtures. Starts the fixture server if
// needed, loads the extension in Chromium and asserts the rendered outcome.
//   node tests/harness/check-fixtures.js
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const { runPages } = require("./run.js");

const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;

function probe(url) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode === 200); });
        req.on("error", () => resolve(false));
        req.setTimeout(1500, () => { req.destroy(); resolve(false); });
    });
}

async function ensureServer() {
    if (await probe(`${BASE}/modern-css.html`)) return null;
    const child = spawn(process.execPath, [path.join(__dirname, "serve.js"), String(PORT)], { stdio: "ignore" });
    for (let i = 0; i < 30; i++) {
        if (await probe(`${BASE}/modern-css.html`)) return child;
        await new Promise((r) => setTimeout(r, 200));
    }
    child.kill();
    throw new Error("fixture server did not start");
}

async function main() {
    const server = await ensureServer();
    const failures = [];
    const expect = (name, ok, detail) => {
        console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
        if (!ok) failures.push(name);
    };
    try {
        const [modern] = await runPages([`${BASE}/modern-css.html`], { waitMs: 2500, viewportHeight: 1500, shotDir: "out/check-fixtures", quiet: true });
        const d = modern.diag;
        expect("modern CSS: no light background samples", d.light === 0, `dark=${d.dark} light=${d.light} unknown=${d.unknown}`);
        expect("modern CSS: page mostly dark", d.dark >= 100, `dark=${d.dark}`);
        expect("modern CSS: no low-contrast text", d.lowContrast === 0, `${d.lowContrast} of ${d.textChecked}`);
        expect("modern CSS: dynamic theme succeeded without filter fallback", d.filterFallback === false);
        expect("modern CSS: oklch variable text was lightened", /^rgb\(2\d\d, 2\d\d, 2\d\d\)$/.test(d.bodyColor || ""), `body color ${d.bodyColor}`);

        const [fallback] = await runPages([`${BASE}/filter-fallback.html`], { waitMs: 9000, shotDir: "out/check-fixtures", quiet: true });
        const f = fallback.diag;
        expect("unreadable stylesheet: guard switched to filter fallback", f.filterFallback === true);
        expect("unreadable stylesheet: page renders dark under the filter", f.light === 0 && f.dark >= 100, `dark=${f.dark} light=${f.light}`);
        expect("unreadable stylesheet: escalation was logged", fallback.logs.some((l) => l.includes("switching to filter fallback")));

        // Sheets adopted or edited after load leave no DOM trace; the engine has to poll for them.
        const LATE_EVAL = `(() => {
            const lum = (s) => { const m = /rgba?\\(([^)]+)\\)/.exec(s || ""); if (!m) return null; const [r, g, b] = m[1].split(/[\\s,\\/]+/).map(parseFloat); const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
            const card = document.querySelector("late-card"), box = card.shadowRoot.querySelector(".box"), p = card.querySelector("p");
            const doc = document.querySelector(".late-doc"), edit = document.querySelector(".late-edit");
            return {
                shadowBoxBg: lum(getComputedStyle(box).backgroundColor), slottedText: lum(getComputedStyle(p).color),
                docBg: lum(getComputedStyle(doc).backgroundColor), docText: lum(getComputedStyle(doc).color),
                editBg: lum(getComputedStyle(edit).backgroundColor), editText: lum(getComputedStyle(edit).color),
                shadowSheets: card.shadowRoot.adoptedStyleSheets.length, docSheets: document.adoptedStyleSheets.length,
            };
        })()`;
        const [late] = await runPages([`${BASE}/adopted-late.html`], { waitMs: 9000, shotDir: "out/check-fixtures", quiet: true, evalCode: LATE_EVAL });
        const l = late.extra.eval || {};
        const fmt = (v) => (typeof v === "number" ? v.toFixed(2) : String(v));
        expect("late adopted sheet in shadow root: box background darkened", l.shadowBoxBg !== null && l.shadowBoxBg < 0.2, `luminance ${fmt(l.shadowBoxBg)} (sheets: ${l.shadowSheets})`);
        expect("late adopted sheet in shadow root: slotted text lightened", l.slottedText !== null && l.slottedText > 0.5, `luminance ${fmt(l.slottedText)}`);
        expect("late adopted sheet on document: background darkened and text lightened", l.docBg < 0.2 && l.docText > 0.5, `bg ${fmt(l.docBg)} text ${fmt(l.docText)} (sheets: ${l.docSheets})`);
        expect("rule inserted into an adopted sheet later: background darkened and text lightened", l.editBg < 0.2 && l.editText > 0.5, `bg ${fmt(l.editBg)} text ${fmt(l.editText)}`);
    } finally {
        if (server) server.kill();
    }
    if (failures.length) {
        console.error(`\n${failures.length} check(s) failed`);
        process.exit(1);
    }
    console.log("\nall fixture checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
