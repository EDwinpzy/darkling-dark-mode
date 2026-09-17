// Builds a copy of the extension with the engine patches reverted, so the harness can
// compare "before" and "after" on the same fixture. Output: <tmp>/darkling-before
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const src = path.resolve(__dirname, "..", "..");
const dst = path.join(os.tmpdir(), "darkling-before");
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const entry of ["manifest.json", "_locales", "config", "icons", "js", "popup"]) {
    fs.cpSync(path.join(src, entry), path.join(dst, entry), { recursive: true });
}

const file = path.join(dst, "js", "content.js");
let code = fs.readFileSync(file, "utf8");

function revert(label, from, to) {
    const count = code.split(from).length - 1;
    if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
    code = code.replace(from, to);
}
function revertAll(label, from, to, expected) {
    const count = code.split(from).length - 1;
    if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
    code = code.split(from).join(to);
}

// 0. gradient text (background-clip: text)
revert("gradient text helper",
    code.slice(code.indexOf("                // Gradient text (background-clip: text) paints the glyphs"), code.indexOf("stopModifier = clipsToText ? A.modifyForegroundColor : A.modifyGradientColor;\n") + "stopModifier = clipsToText ? A.modifyForegroundColor : A.modifyGradientColor;\n".length),
    "");
revertAll("gradient stop modifier", "stopModifier(h, ", "(0, A.modifyGradientColor)(h, ", 3);
revert("inline element ref", "                    style: D.style,\n                    element: D\n", "                    style: D.style\n");
revert("ua sheet layer",
    code.slice(code.indexOf("            // This sheet stands in for the browser's user-agent styles"), code.indexOf("            h.textContent = `@layer ${K.MISC_PREFIX}-ua {")),
    "");
revert("ua sheet assignment",
    '            h.textContent = `@layer ${K.MISC_PREFIX}-ua {\\n${(0, l.getModifiedUserAgentStyle)(v, G, v.styleSystemControls)}\\n}`, document.head.insertBefore(h, D.nextSibling),',
    '            h.textContent = (0, l.getModifiedUserAgentStyle)(v, G, v.styleSystemControls), document.head.insertBefore(h, D.nextSibling),');

// 1. iterateCSSRules
revert("iterateCSSRules",
    code.slice(code.indexOf("                if (D.selectorText) {\n                    h(D);\n                    // CSS nesting"), code.indexOf("                } else (0, Z.logWarn)(`CSSRule type not supported`, D);")),
    `                if (D.selectorText) h(D); else if (D.href) try {
                    A(D.styleSheet.cssRules, h, z);
                } catch (D) {
                    (0, Z.logInfo)(\`Found a non-loaded link.\`), z && z();
                } else if (D.media) {
                    const j = Array.from(D.media), F = j.some((D => D.startsWith("screen") || D.startsWith("all") || D.startsWith("("))), l = j.some((D => D.startsWith("print") || D.startsWith("speech")));
                    if (F || !l) A(D.cssRules, h, z);
                } else if (D.conditionText) {
                    if (CSS.supports(D.conditionText)) A(D.cssRules, h, z);
`);

// 2. cache key
revert("cache key",
    code.slice(code.indexOf("                    // Identical rule text can live under different"), code.indexOf("                    J.delete(j);\n") + "                    J.delete(j);\n".length),
    "                    if (J.delete(j), D.parentRule instanceof CSSMediaRule) j += `;${D.parentRule.media.mediaText}`;\n");

// 3. render group function
revert("render group",
    code.slice(code.indexOf("                        const {rule: z} = D, j = h.cssRules.length, F = D => (h.insertRule(D, j), h.cssRules[j]);"), code.indexOf("                        // Anonymous @layer blocks cannot be re-joined and are flattened into the parent.\n                        return h;")),
    `                        const {rule: z} = D;
                        if (z instanceof CSSMediaRule) {
                            const {media: D} = z, j = h.cssRules.length;
                            return h.insertRule(\`@media \${D.mediaText} {}\`, j), h.cssRules[j];
                        }
`);
revert("render group comment", "                        // Anonymous @layer blocks cannot be re-joined and are flattened into the parent.\n", "");

// 4. colour parser
revert("parser helpers",
    code.slice(code.indexOf("        // Colour syntaxes the hand-written parser does not understand"), code.indexOf("        function w(D) {\n            const h = D.trim().toLowerCase();")),
    "");
revert("parser relative colours", `            if (relativeColor.test(h)) return h.includes("var(") ? null : resolveColorWithBrowser(h);\n`, "");
revert("parser fallback", `            if (modernColorFunction.test(h) && !h.includes("var(")) return resolveColorWithBrowser(h);\n`, "");

// 5. guard (module 3)
revert("guard helpers",
    code.slice(code.indexOf('        const FILTER_FALLBACK_ID = "darkling-filter-fallback"'), code.indexOf("        async function A(D, h, z) {\n            if ((D === null || D === void 0 ? void 0 : D.action) === \"cleanStyle\") removeFilterFallback(),")),
    "");
revert("guard cleanup", 'removeFilterFallback(), (0, l.removeDynamicTheme)();', '(0, l.removeDynamicTheme)();');
revert("guard wiring", "                // Frames are painted by their parent document; only top-level pages get the guard.\n                if (!h) startDarknessGuard();\n", "");

fs.writeFileSync(file, code);
require("node:child_process").execFileSync(process.execPath, ["--check", file]);
console.log("before-copy at", dst, "| CSSLayerBlockRule mentions:", (code.match(/CSSLayerBlockRule|@layer/g) || []).length, "| guard mentions:", (code.match(/startDarknessGuard/g) || []).length);
