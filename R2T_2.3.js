// ==UserScript==
// @name         Rezka2TapeOp
// @namespace    rezka2tapeop
// @version      2.3.0
// @description  Встраивание плеера TapeOp в нативном стиле HDRezka + сохранение в /continue/
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

    function injectRezkaStyles() {
        if (document.getElementById('r2t-styles')) return;
        var st = document.createElement('style');
        st.id = 'r2t-styles';
        st.textContent =
            '.r2t-wrap{margin:20px 0 24px;background:#f5f5f5;border:0;font-family:Arial,sans-serif;}' +
            '.b-theme__template__night .r2t-wrap{background:#121212;}' +
            '.r2t-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 15px;background:#e9ecef;border-bottom:1px solid #dcdcdc;}' +
            '.b-theme__template__night .r2t-head{background:#171717;border-bottom:1px solid #22292d;}' +
            '.r2t-title{font-size:16px;font-weight:bold;color:#222;display:flex;align-items:center;gap:8px;}' +
            '.b-theme__template__night .r2t-title{color:#fff;}' +
            '.r2t-badge{font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.4px;padding:2px 6px;background:#00a0b0;color:#fff;border-radius:2px;}' +
            '.r2t-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}' +
            '.r2t-field{display:inline-flex;align-items:center;background:#dde2e6;height:28px;padding:0 8px;font-size:12px;color:#444;}' +
            '.b-theme__template__night .r2t-field{background:#2d3438;color:#b0bec5;}' +
            '.r2t-field input{width:38px;background:transparent;border:0;color:inherit;font-weight:bold;font-size:12px;text-align:center;outline:none;margin-left:4px;}' +
            '.r2t-btn{height:28px;padding:0 12px;border:0;background:#dde2e6;color:#222;font-size:12px;font-weight:bold;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background .15s,color .15s;}' +
            '.b-theme__template__night .r2t-btn{background:#30383d;color:#fff;}' +
            '.r2t-btn:hover{background:#00a0b0 !important;color:#fff !important;}' +
            '.r2t-btn.is-saved{background:#00a0b0 !important;color:#fff !important;}' +
            '.r2t-btn.is-error{background:#c62828 !important;color:#fff !important;}' +
            '.r2t-btn:disabled{opacity:.65;cursor:default;}' +
            '.r2t-btn-toggle{padding:0 10px;font-weight:normal;opacity:.85;}' +
            '.r2t-player-box{width:100%;background:#000;position:relative;}' +
            '.r2t-iframe{width:100%;height:452px;border:0;display:block;background:#000;}';
        (document.head || document.documentElement).appendChild(st);
    }

    function installUi(player) {
        var movie = parseMovie();
        if (!movie) return false;

        injectRezkaStyles();

        var wrap = document.createElement('div');
        wrap.className = 'r2t-wrap';

        var playerBox = document.createElement('div');
        playerBox.className = 'r2t-player-box';

        var iframe = document.createElement('iframe');
        iframe.className = 'r2t-iframe';
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; fullscreen; encrypted-media';
        iframe.src = 'about:blank';
        playerBox.appendChild(iframe);

        var head = createHeaderBar(movie, playerBox);
        wrap.appendChild(head);
        wrap.appendChild(playerBox);

        var translators = document.querySelector('.b-translators__block');
        var anchor = translators || player;
        anchor.parentNode.insertBefore(wrap, anchor);

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

    function createHeaderBar(movie, playerBox) {
        var params = getRezkaWatchParams(movie.isSeries);

        var head = document.createElement('div');
        head.className = 'r2t-head';

        var titleEl = document.createElement('div');
        titleEl.className = 'r2t-title';
        titleEl.innerHTML = '<span>Смотреть в:</span><span class="r2t-badge">TapeOp</span>';
        head.appendChild(titleEl);

        var controls = document.createElement('div');
        controls.className = 'r2t-controls';

        var seasonInput = null;
        var episodeInput = null;

        if (movie.isSeries) {
            var sField = document.createElement('label');
            sField.className = 'r2t-field';
            sField.textContent = 'Сезон:';
            seasonInput = document.createElement('input');
            seasonInput.type = 'number';
            seasonInput.min = '1';
            seasonInput.value = String(params.season || 1);
            sField.appendChild(seasonInput);
            controls.appendChild(sField);

            var eField = document.createElement('label');
            eField.className = 'r2t-field';
            eField.textContent = 'Серия:';
            episodeInput = document.createElement('input');
            episodeInput.type = 'number';
            episodeInput.min = '1';
            episodeInput.value = String(params.episode || 1);
            eField.appendChild(episodeInput);
            controls.appendChild(eField);

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

        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'r2t-btn';
        saveBtn.textContent = '+ В просмотренное';
        saveBtn.title = 'Сохранить в раздел «Досмотреть» (/continue/)';

        saveBtn.addEventListener('click', function () {
            var userIdEl = document.getElementById('member_user_id');
            if (!userIdEl || !userIdEl.value || userIdEl.value === '0') {
                saveBtn.className = 'r2t-btn is-error';
                saveBtn.textContent = 'Войдите в аккаунт';
                return;
            }

            var currentParams = getRezkaWatchParams(movie.isSeries);
            if (!currentParams.post_id) {
                saveBtn.className = 'r2t-btn is-error';
                saveBtn.textContent = 'Ошибка ID';
                return;
            }

            var season = movie.isSeries ? (parseInt(seasonInput.value, 10) || 1) : 0;
            var episode = movie.isSeries ? (parseInt(episodeInput.value, 10) || 1) : 0;

            saveBtn.disabled = true;
            saveBtn.textContent = 'Сохранение...';

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
                saveBtn.disabled = false;
                if (res && res.success !== false) {
                    saveBtn.className = 'r2t-btn is-saved';
                    saveBtn.textContent = movie.isSeries
                        ? ('✓ Сохранено (' + season + ' с. ' + episode + ' сер.)')
                        : '✓ В просмотренном';

                    if (res.count) {
                        var countEl = document.getElementById('saves-count');
                        if (countEl) countEl.textContent = String(res.count);
                    }
                } else {
                    saveBtn.className = 'r2t-btn is-error';
                    saveBtn.textContent = 'Ошибка сохранения';
                }
            })
            .catch(function () {
                saveBtn.disabled = false;
                saveBtn.className = 'r2t-btn is-error';
                saveBtn.textContent = 'Ошибка сети';
            });
        });

        var toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'r2t-btn r2t-btn-toggle';
        toggleBtn.textContent = 'Свернуть';
        toggleBtn.addEventListener('click', function () {
            var hidden = playerBox.style.display === 'none';
            playerBox.style.display = hidden ? 'block' : 'none';
            toggleBtn.textContent = hidden ? 'Свернуть' : 'Развернуть';
        });

        controls.appendChild(saveBtn);
        controls.appendChild(toggleBtn);
        head.appendChild(controls);
        return head;
    }

    function getRezkaWatchParams(isSeries) {
        var postId = null, translatorId = null, season = isSeries ? 1 : 0, episode = isSeries ? 1 : 0;

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

        var activeTr = document.querySelector('.b-translator__item.active') ||
                       document.querySelector('.b-translator__item');
        if (activeTr && activeTr.getAttribute('data-translator_id')) {
            translatorId = activeTr.getAttribute('data-translator_id');
        }

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

        // Убираем внешние поля, рамки и дублирующую шапку внутри iframe tapeop.dev
        cleanTapeopEmbedUi();

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

    function cleanTapeopEmbedUi() {
        var st = document.createElement('style');
        st.textContent =
            'html, body {' +
            '  margin: 0 !important;' +
            '  padding: 0 !important;' +
            '  width: 100% !important;' +
            '  height: 100% !important;' +
            '  background: #000 !important;' +
            '  overflow: hidden !important;' +
            '}';
        (document.head || document.documentElement).appendChild(st);

        function fitPlayer() {
            var kb = document.querySelector('.kinobox_wrapper, [class*="kinobox"], #player, .player');
            if (!kb) return;

            // Растягиваем все родительские обёртки tapeop.dev на 100% без отступов и рамок
            var el = kb;
            while (el && el !== document.body && el !== document.documentElement) {
                el.style.setProperty('margin', '0', 'important');
                el.style.setProperty('padding', '0', 'important');
                el.style.setProperty('max-width', '100%', 'important');
                el.style.setProperty('width', '100%', 'important');
                el.style.setProperty('border', 'none', 'important');
                el.style.setProperty('border-radius', '0', 'important');
                el.style.setProperty('box-shadow', 'none', 'important');
                el.style.setProperty('background', '#000', 'important');

                // Скрываем верхнюю шапку tapeop.dev (с названием фильма и "movies watched")
                var parent = el.parentElement;
                if (parent) {
                    for (var i = 0; i < parent.children.length; i++) {
                        var sib = parent.children[i];
                        if (sib !== el && sib.tagName !== 'SCRIPT' && sib.tagName !== 'STYLE') {
                            var txt = sib.textContent || '';
                            if (txt.indexOf('watched') !== -1 || sib.offsetHeight < 70) {
                                sib.style.setProperty('display', 'none', 'important');
                            }
                        }
                    }
                }
                el = parent;
            }
            kb.style.setProperty('height', '100vh', 'important');
        }

        onReady(function () {
            fitPlayer();
            var obs = new MutationObserver(fitPlayer);
            obs.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(function () { obs.disconnect(); }, 15000);
        });
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
