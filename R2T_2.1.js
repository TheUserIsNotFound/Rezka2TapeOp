// ==UserScript==
// @name         Rezka2TapeOp
// @namespace    rezka2tapeop
// @version      2.1.0
// @description  Добавление дополнительного плеера TapeOp на сайт Rezka
// @match        *://rezka.fi/*
// @match        *://rezka.ag/*
// @match        *://rezka.co/*
// @match        *://rezka.today/*
// @match        *://rezka.zone/*
// @match        *://rezka.la/*
// @match        *://rezkago.com/*
// @match        *://*.rezka.ag/*
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

    if (/(^|\.)tapeop\.dev$/.test(location.hostname)) {
        onTapeop();
    } else {
        onRezka();
    }

    /* ═══ REZKA ═══ */
    function onRezka() {
        if (!/\/(films|series|cartoons|animation)\/.+\.html/.test(location.pathname)) return;

        onReady(function () {
            var player = document.getElementById('player');
            if (player) installUi(player);
        });
    }

    function installUi(player) {
        var movie = parseMovie();
        if (!movie) return false;

        var embed = document.createElement('div');
        embed.style.cssText = 'margin:0 0 20px;';

        var iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:480px;border:0;display:block;background:#000;';
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; fullscreen; encrypted-media';
        iframe.src = 'about:blank';
        embed.appendChild(iframe);

        var translators = document.querySelector('.b-translators__block');
        var anchor = translators || player;
        anchor.parentNode.insertBefore(embed, anchor);

        // Сохраняем данные (поддержка нескольких открытых вкладок + обратная совместимость)
        var tabId = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7);
        var store = GM_getValue(KEY, {});
        if (!store || typeof store !== 'object' || store.movie) store = {};

        // Очистка записей старше 10 минут
        var now = Date.now();
        for (var k in store) {
            if (now - (store[k].ts || 0) > 10 * 60 * 1000) delete store[k];
        }

        store[tabId] = { movie: movie, ts: now };
        store.latest = { movie: movie, ts: now };
        GM_setValue(KEY, store);

        iframe.src = 'https://tapeop.dev/#r2t=' + tabId;
        return true;
    }

    function parseMovie() {
        var cleanTitle = null, year = null, orig = null;

        // 1. Чистое название берём из H1
        var h1 = document.querySelector('.b-post__title h1, h1[itemprop="name"], h1');
        if (h1) cleanTitle = (h1.textContent || '').trim();

        // 2. Из og:title вытаскиваем год (и название только если H1 не найден)
        var og = document.querySelector('meta[property="og:title"]');
        if (og && og.content) {
            var m = og.content.match(/^(.+?)\s*\((\d{4})\)/);
            if (m) {
                if (!cleanTitle) cleanTitle = m[1].trim();
                year = m[2];
            } else if (!cleanTitle) {
                cleanTitle = og.content.trim();
            }
        }

        if (!cleanTitle) return null;
        // Если в самом H1 уже был год в скобках, отделяем его для чистого поиска
        var tm = cleanTitle.match(/^(.+?)\s*\((\d{4})\)$/);
        if (tm) {
            cleanTitle = tm[1].trim();
            if (!year) year = tm[2];
        }

        var o = document.querySelector('.b-post__origtitle');
        if (o) orig = (o.textContent || '').trim();

        if (!year) {
            var my = location.pathname.match(/-(\d{4})(?:-latest)?\.html$/);
            if (my) year = my[1];
        }

        var displayTitle = (year && cleanTitle.indexOf('(') === -1)
            ? cleanTitle + ' (' + year + ')'
            : cleanTitle;

        var ogType = document.querySelector('meta[property="og:type"]');
        var isSeries = !!(
            (ogType && (ogType.content === 'video.tv_series' || ogType.content === 'video.episode')) ||
            /^\/series\//.test(location.pathname) ||
            document.querySelector('#simple-episodes-tabs, .b-simple_episodes__list')
        );

        return {
            title: displayTitle,
            cleanTitle: cleanTitle,
            orig: orig || null,
            year: year || null,
            isSeries: isSeries,
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
            var decoded = decodeURIComponent(atob(decodeURIComponent(b64)));
            var m = decoded.match(pattern);
            return m ? (m[1] || m[0]) : null;
        } catch (e) {
            return null;
        }
    }

    /* ═══ TAPEOP ═══ */
    function onTapeop() {
        // Не перехватываем сайт, если пользователь открыл tapeop.dev напрямую во вкладке
        if (window.self === window.top) return;

        var store = GM_getValue(KEY, null);
        if (!store) return;

        var hashMatch = location.hash.match(/r2t=([a-z0-9_]+)/i);
        var entry = (hashMatch && store[hashMatch[1]]) || store.latest || (store.movie ? store : null);

        if (!entry || !entry.movie) return;
        if (Date.now() - (entry.ts || 0) > 10 * 60 * 1000) return;

        // Очищаем технический хэш из адресной строки iframe, чтобы не влиять на роутинг tapeop
        if (hashMatch && history.replaceState) {
            history.replaceState(null, '', location.pathname + location.search);
        }

        var jsonLit = JSON.stringify(JSON.stringify(entry.movie));
        var verLit = JSON.stringify(SCRIPT_VERSION);

        injectScript(
            '(function(){' +
            'var D=JSON.parse(' + jsonLit + ');' +
            'var V=' + verLit + ';' +
            'var OF=window.fetch.bind(window);' +
            'function ok(j,strict){' +
                'var a=((j&&j.data)||[]).filter(function(x){return x&&x.iframeUrl;});' +
                'if(!a.length)return false;' +
                'if(!strict)return true;' +
                'var s=0,m=0;' +
                'for(var i=0;i<a.length;i++){' +
                    'var u=a[i].iframeUrl;' +
                    'if(/\\/(serial|season)\\//i.test(u))s++;' +
                    'else if(/\\/(film|movie)\\//i.test(u))m++;' +
                '}' +
                'if(s+m===0)return true;' +
                'return D.isSeries?s>=m:m>s;' +
            '}' +
            'function url(p){' +
                'var u=new URL("https://api.kinobox.tv/api/players");' +
                'for(var k in p)if(p[k])u.searchParams.set(k,p[k]);' +
                'return u.toString();' +
            '}' +
            'var C=[],tClean=D.cleanTitle||D.title;' +
            'if(D.kinopoisk&&D.imdb)C.push({s:0,p:{kinopoisk:D.kinopoisk,imdb:D.imdb,title:tClean}});' +
            'else if(D.kinopoisk)C.push({s:0,p:{kinopoisk:D.kinopoisk,title:tClean}});' +
            'else if(D.imdb)C.push({s:0,p:{imdb:D.imdb,title:tClean}});' +
            'if(D.orig){' +
                'var parts=D.orig.split(/\\s*\\/\\s*/);' +
                'for(var i=0;i<parts.length;i++){' +
                    'if(parts[i]&&parts[i]!==tClean)C.push({s:1,p:{title:parts[i]}});' +
                '}' +
            '}' +
            'C.push({s:1,p:{title:tClean}});' +
            'window.fetch=function(i,o){' +
                'var s=(i&&i.url)?i.url:String(i);' +
                'if(s.indexOf("api.kinobox.tv/api/players")===-1)return OF(i,o);' +
                'return (async function(){' +
                    'for(var n=0;n<C.length;n++){try{' +
                        'var r=await OF(url(C[n].p));' +
                        'if(r.ok&&ok(await r.clone().json(),C[n].s))return r;' +
                    '}catch(e){}}' +
                    'return new Response(JSON.stringify({data:[]}),{status:200,headers:{"Content-Type":"application/json"}});' +
                '})();' +
            '};' +
            'var st=Date.now(),tm=setInterval(function(){' +
                'if(typeof globalThis.init==="function"){' +
                    'clearInterval(tm);' +
                    'globalThis.init(D,V);' +
                '}else if(Date.now()-st>20000)clearInterval(tm);' +
            '},100);' +
            '})();'
        );
    }

    function onReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    function injectScript(code) {
        var s = document.createElement('script');
        s.textContent = code;
        (document.head || document.documentElement).appendChild(s);
        s.remove();
    }
})();
