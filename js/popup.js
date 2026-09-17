(function() {
    function D(h, z, j) {
        function F(Z, A) {
            if (!z[Z]) {
                if (!h[Z]) {
                    var q = "function" == typeof require && require;
                    if (!A && q) return q(Z, !0);
                    if (l) return l(Z, !0);
                    var Q = new Error("Cannot find module '" + Z + "'");
                    throw Q.code = "MODULE_NOT_FOUND", Q;
                }
                var I = z[Z] = {
                    exports: {}
                };
                h[Z][0].call(I.exports, (function(D) {
                    var z = h[Z][1][D];
                    return F(z || D);
                }), I, I.exports, D, h, z, j);
            }
            return z[Z].exports;
        }
        for (var l = "function" == typeof require && require, Z = 0; Z < j.length; Z++) F(j[Z]);
        return F;
    }
    return D;
})()({
    1: [ function(D, h, z) {
        "use strict";
        async function j() {
            let D;
            const h = await chrome.tabs.query({
                currentWindow: true,
                active: true
            });
            if (h.length) D = h[0].url;
            return D;
        }
        Object.defineProperty(z, "__esModule", {
            value: true
        }), z.getCurrentUrl = void 0, z.getCurrentUrl = j;
    }, {} ],
    2: [ function(D, h, z) {
        "use strict";
        Object.defineProperty(z, "__esModule", {
            value: true
        });
        const j = D("1p"), F = document.getElementById("mainBtn"), l = document.getElementById("domainBtn");
        async function Z() {
            const D = await chrome.runtime.sendMessage({
                action: "isEnabled"
            });
            if (D) F.innerHTML = chrome.i18n.getMessage("disable"), document.body.classList.add("enabled"); else F.innerHTML = chrome.i18n.getMessage("enable"),
            document.body.classList.remove("enabled");
            const h = await (0, j.getCurrentUrl)(), z = await chrome.runtime.sendMessage({
                action: "isBlacklist",
                url: h
            });
            if (z) l.innerHTML = chrome.i18n.getMessage("removeFromBlacklist"), l.classList.add("added-to-blacklist"); else l.innerHTML = chrome.i18n.getMessage("addToBlacklist"),
            l.classList.remove("added-to-blacklist");
        }
        F.addEventListener("click", (async () => {
            await chrome.runtime.sendMessage({
                action: "toggle"
            }), await Z();
        })), l.addEventListener("click", (async () => {
            await chrome.runtime.sendMessage({
                action: "toggleBlacklist"
            }), await Z();
        })), Z();
    }, {
        "1p": 1
    } ]
}, {}, [ 2 ]);