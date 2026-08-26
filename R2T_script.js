// ==UserScript==
// @name         Rezka → TapeOp
// @namespace    rezka2tapeop
// @version      3.6.0
// @description  Вкладки [TapeOp | Rezka]; строгий матчинг, без чужого контента; пауза видео при переключении вкладок; 1с воспроизведения Rezka для истории просмотра
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
var SCRIPT_VERSION = '3.6.0'; // должно совпадать с @version
var tickTimer = null, tickRetry = null;
if (/(^|\.)tapeop\.dev$/.test(location.hostname)) onTapeop();
else onRezka();

/* ═══ REZKA ═══ */
function onRezka() {
if (!/\/(films|series|cartoons|animation)\/.+\.html/.test(location.pathname)) return;
// document-start: DOM ещё не готов — ждём DOMContentLoaded, затем короткий поллинг
onReady(function () {
var tries = 0;
var timer = setInterval(function () {
if (document.getElementById('r2t-switcher')) { clearInterval(timer); return; }
var player = document.getElementById('player');
if (player && installUi(player)) { clearInterval(timer); return; }
if (++tries > 50) clearInterval(timer); // ~15 с
}, 300);
});
}

function installUi(player) {
var movie = parseMovie();
if (!movie) return false;
var switcher = document.createElement('div');
switcher.id = 'r2t-switcher';
switcher.className = 'b-translators__block';
switcher.innerHTML =
'<div class="b-translators__title">Источник:</div>' +
'<ul class="b-translators__list">' +
'<li class="b-translator__item" data-src="tapeop">TapeOp</li>' +
'<li class="b-translator__item" data-src="rezka">Rezka</li></ul>';
// Оверлей с iframe живёт ВНУТРИ #player (position:relative):
// плеер не прячется и не переносится, а просто накрывается сверху.
var embed = document.createElement('div');
embed.id = 'r2t-embed';
embed.style.cssText = 'display:none;position:absolute;top:0;left:0;width:100%;height:100%;z-index:999999;background:#000;';
var iframe = document.createElement('iframe');
iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#000;';
iframe.allowFullscreen = true;
iframe.allow = 'autoplay; fullscreen; encrypted-media';
iframe.src = 'about:blank';
embed.appendChild(iframe);
player.style.position = 'relative';
player.appendChild(embed);
// сам switcher ещё не вставлен в DOM — фильтр :not не нужен
var translators = document.querySelector('.b-translators__block');
var anchor = translators || player;
anchor.parentNode.insertBefore(switcher, anchor);
var hideEls = [];
if (translators) hideEls.push(translators);
['simple-seasons-tabs', 'simple-episodes-tabs'].forEach(function (id) {
var el = document.getElementById(id);
if (el) hideEls.push(el);
});
var tabs = switcher.querySelectorAll('.b-translator__item');
var started = false;

function pauseRezkaPlayer() {
// ПАУЗА, не стоп: плеер остаётся загруженным, позиция сохраняется,
// после возврата на вкладку Rezka воспроизведение продолжается с того же места.
// Сначала через API плеера (чтобы не рассинхронизировалась кнопка play),
// затем гарантированно ставим на паузу все медиаэлементы страницы.
var w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
try { if (w.player && typeof w.player.pause === 'function') w.player.pause(); } catch (e) {}
try {
if (typeof w.jwplayer === 'function') {
var p = w.jwplayer();
if (p && typeof p.pause === 'function') p.pause();
}
} catch (e) {}
document.querySelectorAll('video, audio').forEach(function (m) {
try { m.pause(); } catch (e) {}
});
}

/* — 1 секунда воспроизведения Rezka (для истории просмотра) — */
function setMediaMuted(mute) {
document.querySelectorAll('video, audio').forEach(function (m) {
try {
if (mute) {
if (m.dataset.r2tMuted === undefined) m.dataset.r2tMuted = m.muted ? '1' : '0';
m.muted = true;
} else if (m.dataset.r2tMuted !== undefined) {
m.muted = m.dataset.r2tMuted === '1';
delete m.dataset.r2tMuted;
}
} catch (e) {}
});
}
function requestRezkaPlay() {
var w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
try { if (w.player && typeof w.player.play === 'function') w.player.play(); } catch (e) {}
try {
if (typeof w.jwplayer === 'function') {
var p = w.jwplayer();
if (p && typeof p.play === 'function') p.play(true);
}
} catch (e) {}
document.querySelectorAll('video, audio').forEach(function (m) {
try { m.play(); } catch (e) {}
});
}
function tickRezkaPlayer() {
cancelTick();
setMediaMuted(true);   // глушим, чтобы звук не играл в два потока
requestRezkaPlay();
tickRetry = setTimeout(requestRezkaPlay, 400); // дубль, если плеер ещё не был готов
tickTimer = setTimeout(function () {
tickTimer = null;
if (tickRetry) { clearTimeout(tickRetry); tickRetry = null; }
pauseRezkaPlayer();    // стоп через 1 секунду — факт просмотра записан
setMediaMuted(false);  // возвращаем прежний mute-статус
}, 1000);
}
function cancelTick() {
if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
if (tickRetry) { clearTimeout(tickRetry); tickRetry = null; }
setMediaMuted(false);
}

function unloadTapeop() {
// Внутри tapeop.dev видео играет в кросс-доменном iframe стороннего плеера —
// поставить его на паузу извне невозможно, пауза здесь только выгрузкой.
// При возврате на вкладку TapeOp iframe загрузится заново: скрипт снова
// вызовет init(), сайт восстановит фильм и выбранный источник из кэша.
if (started) { iframe.src = 'about:blank'; started = false; }
}
function showTapeop() {
tickRezkaPlayer(); // 1с воспроизведения Rezka → фильм попадает в историю сайта
GM_setValue(KEY, { movie: movie, ts: Date.now() });
if (!started) { iframe.src = 'https://tapeop.dev/'; started = true; }
hideEls.forEach(function (el) { el.style.display = 'none'; });
embed.style.display = 'block';
}
function showRezka() {
cancelTick(); // если 1 секунда ещё не докрутилась — отменяем, не мешаем пользователю
unloadTapeop();
embed.style.display = 'none';
hideEls.forEach(function (el) { el.style.display = ''; });
}
function activate(src) {
tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.src === src); });
if (src === 'tapeop') showTapeop(); else showRezka();
}
tabs.forEach(function (t) {
t.addEventListener('click', function () { activate(t.dataset.src); });
});
activate('tapeop');
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
// Перехват Kinobox ставим на document-start — до разбора страницы,
// чтобы ни один fetch не прошёл мимо. Валидация: точные id (KP/IMDb)
// принимаем как есть; для поиска по названию — один проход по плеерам:
// /serial/|/anime/ = сериал, /film/|/movie/ = фильм;
// нераспознанные пути = "неизвестно → разрешить".
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
'window.fetch=function(i,o){' +
'var s=(i&&i.url)?i.url:String(i);' +
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
s.textContent = code; // не innerHTML: без HTML-парсинга, безопасно при любых символах в названии
(document.head || document.documentElement).appendChild(s);
s.remove();
}
})();
