// ==UserScript==
// @name         Rezka2TapeOp
// @namespace    rezka2tapeop
// @version      2.5.1
// @description  Вкладки переключения TapeOp / Rezka, кнопка «Посмотреть позже» и отметка «Просмотрено» по 2-му клику
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
            '.r2t-hidden{display:none !important;}' +
            '.r2t-wrap{margin:18px 0 22px;font-family:Arial,sans-serif;}' +
            '.r2t-wrap.is-rezka-mode{margin-bottom:14px;}' +
            '.r2t-bar{display:flex;align-items:stretch;width:100%;background:#dde2e6;gap:1px;user-select:none;}' +
            '.b-theme__template__night .r2t-bar{background:#1b2024;}' +
            '.r2t-btn{flex:1 1 0;min-height:38px;padding:0 14px;border:0;background:#e9ecef;color:#222;font-size:13px;font-weight:bold;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:background .15s,color .15s;text-align:center;line-height:1.2;}' +
            '.b-theme__template__night .r2t-btn{background:#30383d;color:#cfd8dc;}' +
            '.r2t-btn:hover{background:#d0d7de;color:#000;}' +
            '.b-theme__template__night .r2t-btn:hover{background:#3b444b;color:#fff;}' +
            '.r2t-tab.is-active,.b-theme__template__night .r2t-tab.is-active{background:#00a0b0 !important;color:#fff !important;cursor:default;}' +
            '.r2t-later.is-saved,.b-theme__template__night .r2t-later.is-saved{background:#00a0b0 !important;color:#fff !important;}' +
            '.r2t-later.is-watched,.b-theme__template__night .r2t-later.is-watched{background:#2e7d32 !important;color:#fff !important;}' +
            '.r2t-later.is-error,.b-theme__template__night .r2t-later.is-error{background:#c62828 !important;color:#fff !important;}' +
            '.r2t-btn:disabled{opacity:.7;cursor:default;}' +
            '.r2t-player-box{width:100%;background:#000;position:relative;}' +
            '.r2t-iframe{width:100%;height:460px;border:0;display:block;background:#000;}';
        (document.head || document.documentElement).appendChild(st);
    }

    function getNativeRezkaNodes(player) {
        var selectors = [
            '.b-translators__block',
            '#player',
            '#simple-episodes-tabs',
            '.b-simple_episodes__list',
            '.b-player__restricted'
        ];
        var nodes = [];
        for (var i = 0; i < selectors.length; i++) {
            var found = document.querySelectorAll(selectors[i]);
            for (var j = 0; j < found.length; j++) {
                if (nodes.indexOf(found[j]) === -1) nodes.push(found[j]);
            }
        }
        if (player && nodes.indexOf(player) === -1) nodes.push(player);
        return nodes;
    }

    function pauseRezkaNativePlayer() {
        try {
            var w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
            if (w.sof && w.sof.tv && w.sof.tv.player && typeof w.sof.tv.player.api === 'function') {
                w.sof.tv.player.api('pause');
            }
            var videos = document.querySelectorAll('#player video');
            for (var i = 0; i < videos.length; i++) videos[i].pause();
        } catch (e) {}
    }

    function pauseTapeopPlayer(iframe) {
        try {
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'r2t-pause' }, '*');
            }
        } catch (e) {}
    }

    function installUi(player) {
        var movie = parseMovie();
        if (!movie) return false;

        injectRezkaStyles();

        var nativeNodes = getNativeRezkaNodes(player);

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

        var bar = createTopBar(movie, wrap, playerBox, iframe, nativeNodes);
        wrap.appendChild(bar);
        wrap.appendChild(playerBox);

        var translators = document.querySelector('.b-translators__block');
        var anchor = translators || player;
        anchor.parentNode.insertBefore(wrap, anchor);

        // По умолчанию активна 1-я вкладка (TapeOp) — скрываем элементы родного плеера Rezka
        for (var i = 0; i < nativeNodes.length; i++) {
            nativeNodes[i].classList.add('r2t-hidden');
        }

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

function createTopBar(movie, wrap, playerBox, iframe, nativeNodes) {
        var bar = document.createElement('div');
        bar.className = 'r2t-bar';

        // 1 кнопка — Вкладка TapeOp
        var tabTapeop = document.createElement('button');
        tabTapeop.type = 'button';
        tabTapeop.className = 'r2t-btn r2t-tab is-active';
        tabTapeop.textContent = 'TapeOp';

        // 2 кнопка — Вкладка Rezka
        var tabRezka = document.createElement('button');
        tabRezka.type = 'button';
        tabRezka.className = 'r2t-btn r2t-tab';
        tabRezka.textContent = 'Rezka';

        // 3 кнопка — Цикл: Посмотреть позже -> В «Досмотреть» -> Просмотрено -> Сброс
        var watchLaterBtn = document.createElement('button');
        watchLaterBtn.type = 'button';
        watchLaterBtn.className = 'r2t-btn r2t-later';
        watchLaterBtn.textContent = 'Посмотреть позже';

        // step: 0 = нет в списке, 1 = в списке (не просмотрено), 2 = просмотрено
        var state = { step: 0, rowId: null };

        function renderBtnState() {
            watchLaterBtn.disabled = false;
            if (state.step === 1) {
                watchLaterBtn.className = 'r2t-btn r2t-later is-saved';
                watchLaterBtn.textContent = 'Посмотреть позже';
                watchLaterBtn.title = 'Нажмите, чтобы отметить как просмотренное';
            } else if (state.step === 2) {
                watchLaterBtn.className = 'r2t-btn r2t-later is-watched';
                watchLaterBtn.textContent = 'Просмотрено';
                watchLaterBtn.title = 'Нажмите, чтобы удалить из просмотренного';
            } else {
                watchLaterBtn.className = 'r2t-btn r2t-later';
                watchLaterBtn.textContent = 'Посмотреть позже';
                watchLaterBtn.title = 'Нажмите, чтобы добавить в список «Посмотреть позже»';
            }
        }

        function updateHeaderCounter(count) {
            if (count !== undefined && count !== null) {
                var countEl = document.getElementById('saves-count');
                if (countEl) countEl.textContent = String(count);
            }
        }

        // Синхронизация статуса с /continue/ при открытии страницы
        var initParams = getRezkaWatchParams(movie.isSeries);
        var userIdEl = document.getElementById('member_user_id');
        if (initParams.post_id && userIdEl && userIdEl.value && userIdEl.value !== '0') {
            getContinueRowInfo(initParams.post_id).then(function (info) {
                if (info) {
                    state.rowId = info.rowId;
                    state.step = info.isWatched ? 2 : 1;
                    renderBtnState();
                }
            }).catch(function () {});
        }

        // Переключение на TapeOp
        tabTapeop.addEventListener('click', function () {
            if (tabTapeop.classList.contains('is-active')) return;
            tabTapeop.classList.add('is-active');
            tabRezka.classList.remove('is-active');
            wrap.classList.remove('is-rezka-mode');

            pauseRezkaNativePlayer();
            for (var i = 0; i < nativeNodes.length; i++) {
                nativeNodes[i].classList.add('r2t-hidden');
            }
            playerBox.classList.remove('r2t-hidden');
        });

        // Переключение на Rezka
        tabRezka.addEventListener('click', function () {
            if (tabRezka.classList.contains('is-active')) return;
            tabRezka.classList.add('is-active');
            tabTapeop.classList.remove('is-active');
            wrap.classList.add('is-rezka-mode');

            pauseTapeopPlayer(iframe);
            playerBox.classList.add('r2t-hidden');

            var updatedNodes = getNativeRezkaNodes(document.getElementById('player'));
            for (var i = 0; i < updatedNodes.length; i++) {
                updatedNodes[i].classList.remove('r2t-hidden');
            }
            window.dispatchEvent(new Event('resize'));
        });

        // Обработка нажатий по кнопке (шаги 0 -> 1 -> 2 -> 0)
        watchLaterBtn.addEventListener('click', function () {
            var uEl = document.getElementById('member_user_id');
            if (!uEl || !uEl.value || uEl.value === '0') {
                watchLaterBtn.className = 'r2t-btn r2t-later is-error';
                watchLaterBtn.textContent = 'Войдите в аккаунт';
                return;
            }

            var currentParams = getRezkaWatchParams(movie.isSeries);
            if (!currentParams.post_id) {
                watchLaterBtn.className = 'r2t-btn r2t-later is-error';
                watchLaterBtn.textContent = 'Ошибка ID';
                return;
            }

            watchLaterBtn.disabled = true;

            // ШАГ 0 -> 1: Добавляем в список /continue/
            if (state.step === 0) {
                watchLaterBtn.textContent = 'Добавление...';
                var body = new URLSearchParams({
                    post_id: String(currentParams.post_id),
                    translator_id: String(currentParams.translator_id),
                    season: String(currentParams.season),
                    episode: String(currentParams.episode),
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
                    if (!res || res.success === false) throw new Error('Save failed');
                    updateHeaderCounter(res.count);
                    state.step = 1;
                    state.rowId = res.id ? String(res.id) : null;
                    renderBtnState();
                })
                .catch(function () {
                    watchLaterBtn.disabled = false;
                    watchLaterBtn.className = 'r2t-btn r2t-later is-error';
                    watchLaterBtn.textContent = 'Ошибка сохранения';
                });
                return;
            }

            // ШАГ 1 -> 2: Отмечаем как просмотренное (глазик)
            if (state.step === 1) {
                watchLaterBtn.textContent = 'Отмечаем...';
                ensureRowId(currentParams.post_id, state)
                    .then(function (rowId) {
                        return postSaveAction(['/engine/ajax/cdn_saves_view.php', '/ajax/send_save_view/'], rowId);
                    })
                    .then(function (res) {
                        updateHeaderCounter(res.count);
                        state.step = 2;
                        renderBtnState();
                    })
                    .catch(function () {
                        watchLaterBtn.disabled = false;
                        watchLaterBtn.className = 'r2t-btn r2t-later is-error';
                        watchLaterBtn.textContent = 'Ошибка отметки';
                    });
                return;
            }

            // ШАГ 2 -> 0: Удаляем из просмотренного (полный сброс статуса)
            if (state.step === 2) {
                watchLaterBtn.textContent = 'Удаление...';
                ensureRowId(currentParams.post_id, state)
                    .then(function (rowId) {
                        return postSaveAction(['/engine/ajax/cdn_saves_remove.php', '/ajax/send_save_remove/'], rowId);
                    })
                    .then(function (res) {
                        updateHeaderCounter(res.count);
                        state.step = 0;
                        state.rowId = null;
                        renderBtnState();
                    })
                    .catch(function () {
                        watchLaterBtn.disabled = false;
                        watchLaterBtn.className = 'r2t-btn r2t-later is-error';
                        watchLaterBtn.textContent = 'Ошибка удаления';
                    });
            }
        });

        bar.appendChild(tabTapeop);
        bar.appendChild(tabRezka);
        bar.appendChild(watchLaterBtn);
        return bar;
    }

    // Получает data-id и статус просмотра со страницы /continue/
    function getContinueRowInfo(postId) {
        return fetch('/continue/', { credentials: 'same-origin', cache: 'no-store' })
            .then(function (r) { return r.text(); })
            .then(function (html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                var rows = doc.querySelectorAll('.b-videosaves__list_item[id^="videosave-"]');
                var postRe = new RegExp('\\/' + postId + '-[^\\/]+\\.html');

                for (var i = 0; i < rows.length; i++) {
                    var row = rows[i];
                    var link = row.querySelector('.td.title a[href]');
                    var ctrlBtn = row.querySelector('.i-sprt.view[data-id], .i-sprt.delete[data-id]');
                    if (link && ctrlBtn && postRe.test(link.getAttribute('href'))) {
                        var id = ctrlBtn.getAttribute('data-id');
                        var viewBtn = row.querySelector('.i-sprt.view');
                        var watched = row.classList.contains('watched-row') ||
                                      !!(viewBtn && viewBtn.classList.contains('watched'));
                        return { rowId: id, isWatched: watched };
                    }
                }
                return null;
            });
    }

    function ensureRowId(postId, state) {
        if (state.rowId) return Promise.resolve(state.rowId);
        return getContinueRowInfo(postId).then(function (info) {
            if (!info || !info.rowId) throw new Error('Row ID not found');
            state.rowId = info.rowId;
            return info.rowId;
        });
    }

    function postSaveAction(endpoints, rowId) {
        var body = new URLSearchParams({ id: String(rowId) });
        function tryNext(idx) {
            if (idx >= endpoints.length) return Promise.reject(new Error('All endpoints failed'));
            return fetch(endpoints[idx], {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: body.toString()
            })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (res) {
                if (res && res.success !== false) return res;
                throw new Error('Action failed');
            })
            .catch(function () {
                return tryNext(idx + 1);
            });
        }
        return tryNext(0);
    }

    // Поиск data-id записи на /continue/ и переключение статуса "Отметить как просмотренный"
    function toggleContinueWatchedStatus(postId, state) {
        var findRowPromise = state.saveRowId
            ? Promise.resolve({ rowId: state.saveRowId, currentlyWatched: state.isWatched })
            : fetch('/continue/', { credentials: 'same-origin' })
                .then(function (r) { return r.text(); })
                .then(function (html) {
                    var doc = new DOMParser().parseFromString(html, 'text/html');
                    var rows = doc.querySelectorAll('.b-videosaves__list_item[id^="videosave-"]');
                    var postRe = new RegExp('\\/' + postId + '-[^\\/]+\\.html');

                    for (var i = 0; i < rows.length; i++) {
                        var row = rows[i];
                        var link = row.querySelector('.td.title a[href]');
                        var viewBtn = row.querySelector('.i-sprt.view[data-id]');
                        if (link && viewBtn && postRe.test(link.getAttribute('href'))) {
                            var id = viewBtn.getAttribute('data-id');
                            var watched = row.classList.contains('watched-row') || viewBtn.classList.contains('watched');
                            state.saveRowId = id;
                            return { rowId: id, currentlyWatched: watched };
                        }
                    }
                    throw new Error('Save row not found');
                });

        return findRowPromise.then(function (info) {
            var body = new URLSearchParams({ id: String(info.rowId) });
            var endpoints = ['/engine/ajax/cdn_saves_view.php', '/ajax/send_save_view/'];

            function tryEndpoint(idx) {
                if (idx >= endpoints.length) return Promise.reject(new Error('All endpoints failed'));
                return fetch(endpoints[idx], {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: body.toString()
                })
                .then(function (r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.json();
                })
                .then(function (res) {
                    if (res && res.success !== false) {
                        return {
                            isWatched: !info.currentlyWatched,
                            count: res.count || null
                        };
                    }
                    throw new Error('Endpoint returned error');
                })
                .catch(function () {
                    return tryEndpoint(idx + 1);
                });
            }

            return tryEndpoint(0);
        });
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

        cleanTapeopEmbedUi();

        window.addEventListener('message', function (ev) {
            if (!ev.data || ev.data.type !== 'r2t-pause') return;
            var videos = document.querySelectorAll('video');
            for (var i = 0; i < videos.length; i++) videos[i].pause();
            var frames = document.querySelectorAll('iframe');
            for (var j = 0; j < frames.length; j++) {
                try {
                    frames[j].contentWindow.postMessage(JSON.stringify({ api: 'pause', method: 'pause' }), '*');
                    frames[j].contentWindow.postMessage({ api: 'pause', method: 'pause', key: 'kodik_player_api', value: { method: 'pause' } }, '*');
                } catch (e) {}
            }
        });

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
