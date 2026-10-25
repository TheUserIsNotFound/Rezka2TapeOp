// ==UserScript==
// @name         Rezka2TapeOp
// @namespace    rezka2tapeop
// @version      2.0.0
// @description  Добавление дополнительного плеера TapeOp на сайт Rezka
// @match        *://rezka.fi/*
// @match        *://rezka.ag/*
// @match        *://rezka.co/*
// @match        *://rezka.today/*
// @match        *://rezka.zone/*
// @match        *://rezka.la/*
// @match        *://rezkago.com/*
// @match        *://tapeop.dev/*
// @match        *://www.tapeop.dev/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==
(function () {
'use strict';
var KEY = 'rezka2tapeop-movie';
var SCRIPT_VERSION = '3.5.1'; // версия протокола с tapeop — не менять
if (/(^|\.)tapeop\.dev$/.test(location.hostname)) onTapeop();
else onRezka();

/* ═══ REZKA ═══ */
function onRezka() {
if (!/\/(films|series|cartoons|animation)\/.+\.html/.test(location.pathname)) return;
// #player статичен в HTML (см. исходник страницы) — поллинг не нужен,
// достаточно одного вызова после DOMContentLoaded.
onReady(function () {
var player = document.getElementById('player');
if (player) installUi(player);
});
}
function installUi(player) {
var movie = parseMovie();
if (!movie) return false;

// Плеер TapeOp — обычный блок в потоке страницы, без шапки и без id
// (id был нужен только флагу в упразднённом поллинге).
var embed = document.createElement('div');
embed.style.cssText = 'margin:0 0 20px;';
var iframe = document.createElement('iframe');
iframe.style.cssText = 'width:100%;height:480px;border:0;display:block;background:#000;';
iframe.allowFullscreen = true;
iframe.allow = 'autoplay; fullscreen; encrypted-media';
iframe.src = 'about:blank';
embed.appendChild(iframe);

// Вставляем НАД блоком озвучек: описание → TapeOp → озвучки → плеер Rezka.
var translators = document.querySelector('.b-translators__block');
var anchor = translators || player;
anchor.parentNode.insertBefore(embed, anchor);

GM_setValue(KEY, { movie: movie, ts: Date.now() });
iframe.src = 'https://tapeop.dev/';
return true;
}
function parseMovie() {
var title = null, year = null, orig = null;
var og = document.querySelector('meta[property="og:title"]');
if (og && og.content) {
var m = og.content.match(/^(.+?)\s*\((\d{4})\)/);
if (m) { title = m[1]; year = m[2]; } else title = og.content.trim();
}
if (!title) {
var h1 = document.querySelector('h1[itemprop="name"]') || document.querySelector('h1');
if (h1) title = (h1.textContent || '').trim();
}
var o = document.querySelector('.b-post__origtitle');
if (o) orig = (o.textContent || '').trim();
if (!year) {
var my = location.pathname.match(/-(\d{4})(?:-latest)?.html$/);
if (my) year = my[1];
}
if (title && year && title.indexOf('(') === -1) title += ' (' + year + ')';
var ogType = document.querySelector('meta[property="og:type"]');
var isSeries = !!(ogType && (ogType.content === 'video.tv_series' || ogType.content === 'video.episode')) ||
/^\/series\//.test(location.pathname);
if (!title) return null;
return {
title: title, orig: orig || null, year: year || null, isSeries: isSeries,
imdb: decodeHelp('.b-post__info_rates.imdb a', /(tt\d+)/),
kinopoisk: decodeHelp('.b-post__info_rates.kp a', /\/(?:film|series)\/(\d+)/)
};
}
function decodeHelp(selector, pattern) {
try {
var a = document.querySelector(selector);
if (!a) return null;
var b64 = ((a.getAttribute('href') || '').split('/help/')[1] || '').split('/')[0];
if (!b64) return null;
var m = decodeURIComponent(atob(b64)).match(pattern);
return m ? (m[1] || m[0]) : null;
} catch (e) { return null; }
}

/* ═══ TAPEOP ═══ */
function onTapeop() {
var stored = GM_getValue(KEY, null);
if (!stored || !stored.movie) return;
if (Date.now() - (stored.ts || 0) > 10 * 60 * 1000) return;
var jsonLit = JSON.stringify(JSON.stringify(stored.movie));
// Перехват Kinobox на document-start. Валидация: точные id (KP/IMDb)
// принимаем как есть; поиск по названию — один проход по плеерам:
// /serial/|/anime/ = сериал, /film/|/movie/ = фильм; нераспознанное = разрешить.
injectScript('(function(){' +
'var D=JSON.parse(' + jsonLit + ');' +
'var OF=window.fetch.bind(window);' +
'function ok(j,strict){' +
'var a=((j&&j.data)||[]).filter(function(x){return x&&x.iframeUrl;});' +
'if(!a.length)return false;' +
'if(!strict)return true;' +
'var s=0,m=0;' +
'for(var i=0;i<a.length;i++){var u=a[i].iframeUrl;' +
'if(u.indexOf("/serial/")!==-1||u.indexOf("/anime/")!==-1)s++;' +
'else if(u.indexOf("/film/")!==-1||u.indexOf("/movie/")!==-1)m++;}' +
'if(s+m===0)return true;' +
'return D.isSeries?s>=m:m>s;}' +
'function url(p){var u=new URL("https://api.kinobox.tv/api/players");' +
'for(var k in p)if(p[k])u.searchParams.set(k,p[k]);return u.toString();}' +
'var C=[];' +
'if(D.kinopoisk&&D.imdb)C.push({s:0,p:{kinopoisk:D.kinopoisk,imdb:D.imdb,title:D.title}});' +
'else if(D.kinopoisk)C.push({s:0,p:{kinopoisk:D.kinopoisk,title:D.title}});' +
'else if(D.imdb)C.push({s:0,p:{imdb:D.imdb,title:D.title}});' +
'if(D.orig&&D.orig!==D.title)C.push({s:1,p:{title:D.orig}});' +
'C.push({s:1,p:{title:D.title}});' +
'window.fetch=function(i,o){var s=(i&&i.url)?i.url:String(i);' +
'if(s.indexOf("api.kinobox.tv")===-1)return OF(i,o);' +
'return (async function(){' +
'for(var n=0;n<C.length;n++){try{' +
'var r=await OF(url(C[n].p));' +
'if(ok(await r.clone().json(),C[n].s))return r;' +
'}catch(e){}}' +
'return new Response(JSON.stringify({data:[]}),{status:200,headers:{"Content-Type":"application/json"}});' +
'})();};' +
'})();');

// Ждём глобальный init() от страницы и запускаем его с нашим фильмом.
var started = Date.now();
var timer = setInterval(function () {
var w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
if (typeof w.init === 'function') {
clearInterval(timer);
injectScript('globalThis.init(JSON.parse(' + jsonLit + '),' +
JSON.stringify(SCRIPT_VERSION) + ');');
} else if (Date.now() - started > 20000) clearInterval(timer);
}, 200);
}
function onReady(fn) {
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', fn, { once: true });
} else fn();
}
function injectScript(code) {
var s = document.createElement('script');
s.textContent = code; // не innerHTML: безопасно при любых символах в названии
(document.head || document.documentElement).appendChild(s);
s.remove();
}
})();
