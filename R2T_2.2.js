// ==UserScript==
// @name         Rezka2TapeOp
// @namespace    rezka2tapeop
// @version      2.2.0
// @description  Добавление дополнительного плеера TapeOp на сайт Rezka + сохранение в историю (/continue/)
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

        // Панель управления под плеером TapeOp
        var bar = createHistoryBar(movie);
        embed.appendChild(bar);

        var translators = document.querySelector('.b-translators__block');
        var anchor = translators || player;
        anchor.parentNode.insertBefore(embed, anchor);

        // Сохраняем данные для iframe
        var tabId = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7);
        var store = GM_getValue(KEY, {});
        if (!store || typeof store !== 'object' || store.movie) store = {};

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

    function createHistoryBar(movie) {
        var params = getRezkaWatchParams(movie.isSeries);

        var bar = document.createElement('div');
        bar.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;background:#1a242d;border-top:1px solid #283642;font-family:Arial,sans-serif;font-size:13px;color:#cfd8dc;';

        var seasonInput = null;
        var episodeInput = null;

        if (movie.isSeries) {
            var sLabel = document.createElement('label');
            sLabel.style.cssText = 'display:inline-flex;align-items:center;gap:5px;color:#90a4ae;';
            sLabel.textContent = 'Сезон:';
            seasonInput = document.createElement('input');
            seasonInput.type = 'number';
            seasonInput.min = '1';
            seasonInput.value = String(params.season || 1);
            seasonInput.style.cssText = 'width:52px;padding:4px 6px;background:#0d151b;color:#fff;border:1px solid #344654;border-radius:3px;font-size:13px;';
            sLabel.appendChild(seasonInput);
            bar.appendChild(sLabel);

            var eLabel = document.createElement('label');
            eLabel.style.cssText = 'display:inline-flex;align-items:center;gap:5px;color:#90a4ae;';
            eLabel.textContent = 'Серия:';
            episodeInput = document.createElement('input');
            episodeInput.type = 'number';
            episodeInput.min = '1';
            episodeInput.value = String(params.episode || 1);
            episodeInput.style.cssText = 'width:52px;padding:4px 6px;background:#0d151b;color:#fff;border:1px solid #344654;border-radius:3px;font-size:13px;';
            eLabel.appendChild(episodeInput);
            bar.appendChild(eLabel);

            // Синхронизация при клике по вкладкам сезонов/серий на самой странице Rezka
            document.addEventListener('click', function (ev) {
                var sEl = ev.target.closest && ev.target.closest('.b-simple_season__item');
                if (sEl && sEl.getAttribute('data-tab_id')) {
                    seasonInput.value = sEl.getAttribute('data-tab_id');
                }
                var eEl = ev.target.closest && ev.target.closest('.b-simple_episode__item');
                if (eEl && eEl.getAttribute('data-episode_id')) {
                    episodeInput.value = eEl.getAttribute('data-episode_id');
                }
            });
        }

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Добавить в просмотренное';
        btn.style.cssText = 'padding:6px 14px;background:#2e859e;color:#fff;border:0;border-radius:3px;cursor:pointer;font-size:13px;font-weight:bold;transition:background .15s;';

        var status = document.createElement('span');
        status.style.cssText = 'font-size:12px;color:#90a4ae;';

        btn.addEventListener('click', function () {
            var userIdEl = document.getElementById('member_user_id');
            if (!userIdEl || !userIdEl.value || userIdEl.value === '0') {
                status.style.color = '#ef5350';
                status.textContent = 'Требуется вход в аккаунт Rezka';
                return;
            }

            var currentParams = getRezkaWatchParams(movie.isSeries);
            if (!currentParams.post_id) {
                status.style.color = '#ef5350';
                status.textContent = 'Не удалось определить ID страницы';
                return;
            }

            var season = movie.isSeries ? (parseInt(seasonInput.value, 10) || 1) : 0;
            var episode = movie.isSeries ? (parseInt(episodeInput.value, 10) || 1) : 0;

            btn.disabled = true;
            btn.style.opacity = '0.7';
            status.style.color = '#90a4ae';
            status.textContent = 'Сохранение...';

            var body = new URLSearchParams({
                post_id: String(currentParams.post_id),
                translator_id: String(currentParams.translator_id),
                season: String(season),
                episode: String(episode),
                current_time: '60',
                duration: '5400'
            });

            fetch('/ajax/send_save/', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: body.toString()
            })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                btn.disabled = false;
                btn.style.opacity = '1';
                if (res && res.success !== false) {
                    btn.style.background = '#2e7d32';
                    btn.textContent = '✓ Добавлено в просмотренное';
                    status.style.color = '#81c784';
                    status.textContent = movie.isSeries
                        ? ('Сохранено: ' + season + ' сезон ' + episode + ' серия')
                        : 'Сохранено в /continue/';

                    if (res.count) {
                        var countEl = document.getElementById('saves-count');
                        if (countEl) countEl.textContent = String(res.count);
                    }
                } else {
                    status.style.color = '#ef5350';
                    status.textContent = (res && res.message) ? res.message : 'Ошибка сохранения';
                }
            })
            .catch(function () {
                btn.disabled = false;
                btn.style.opacity = '1';
                status.style.color = '#ef5350';
                status.textContent = 'Ошибка сети при обращении к /ajax/send_save/';
            });
        });

        bar.appendChild(btn);
        bar.appendChild(status);
        return bar;
    }

    function getRezkaWatchParams(isSeries) {
        var postId = null, translatorId = null, season = isSeries ? 1 : 0, episode = isSeries ? 1 : 0;

        // 1. post_id из DOM или URL
        var favHolder = document.querySelector('[data-post_id]');
        if (favHolder) postId = favHolder.getAttribute('data-post_id');
        if (!postId) {
            var pidInput = document.getElementById('post_id');
            if (pidInput && pidInput.value) postId = pidInput.value;
        }
        if (!postId) {
            var urlMatch = location.pathname.match(/\/(\d+)-[^/]+\.html/);
            if (urlMatch) postId = urlMatch[1];
        }

        // 2. Из inline-скрипта инициализации плеера (initCDNMoviesEvents / initCDNSeriesEvents)
        var scripts = document.querySelectorAll('script:not([src])');
        for (var i = 0; i < scripts.length; i++) {
            var txt = scripts[i].textContent || '';
            var ms = txt.match(/initCDNSeriesEvents\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (ms) {
                if (!postId) postId = ms[1];
                translatorId = ms[2];
                season = parseInt(ms[3], 10) || 1;
                episode = parseInt(ms[4], 10) || 1;
                break;
            }
            var mm = txt.match(/initCDNMoviesEvents\(\s*(\d+)\s*,\s*(\d+)/);
            if (mm) {
                if (!postId) postId = mm[1];
                translatorId = mm[2];
                break;
            }
        }

        // 3. Активная озвучка в DOM (если пользователь переключил озвучку на странице)
        var activeTr = document.querySelector('.b-translator__item.active') ||
                       document.querySelector('.b-translator__item');
        if (activeTr && activeTr.getAttribute('data-translator_id')) {
            translatorId = activeTr.getAttribute('data-translator_id');
        }

        // 4. Активные сезон и серия в DOM
        if (isSeries) {
            var activeSeason = document.querySelector('.b-simple_season__item.active') ||
                               document.querySelector('.b-simple_season__item');
            if (activeSeason && activeSeason.getAttribute('data-tab_id')) {
                season = parseInt(activeSeason.getAttribute('data-tab_id'), 10) || season;
            }
            var activeEp = document.querySelector('.b-simple_episode__item.active') ||
                           document.querySelector('.b-simple_episode__item');
            if (activeEp && activeEp.getAttribute('data-episode_id')) {
                episode = parseInt(activeEp.getAttribute('data-episode_id'), 10) || episode;
            }
        }

        return {
            post_id: postId,
            translator_id: translatorId || 1,
            season: season,
            episode: episode
        };
    }

    function parseMovie() {
        var cleanTitle = null, year = null, orig = null;

        var h1 = document.querySelector('.b-post__title h1, h1[itemprop="name"], h1');
        if (h1) cleanTitle = (h1.textContent || '').trim();

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
        if (window.self === window.top) return;

        var store = GM_getValue(KEY, null);
        if (!store) return;

        var hashMatch = location.hash.match(/r2t=([a-z0-9_]+)/i);
        var entry = (hashMatch && store[hashMatch[1]]) || store.latest || (store.movie ? store : null);

        if (!entry || !entry.movie) return;
        if (Date.now() - (entry.ts || 0) > 10 * 60 * 1000) return;

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
