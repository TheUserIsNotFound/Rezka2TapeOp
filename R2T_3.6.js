// ==UserScript==
// @name         Rezka2TapeOp
// @namespace    rezka2tapeop
// @version      3.6
// @description  Единый дизайн кнопок TapeOp/Rezka (30px), «Посмотреть позже», статичная шапка и рейтинги RT
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
// @grant        GM_xmlhttpRequest
// @connect      www.rottentomatoes.com
// @connect      rottentomatoes.com
// @connect      query.wikidata.org
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    var KEY = 'rezka2tapeop-movie';
    var RT_CACHE_KEY = 'rezka2tapeop-rt-cache';
    var SCRIPT_VERSION = '3.5.1'; // версия протокола с tapeop — не менять

    if (/(^|\.)tapeop\.dev$/.test(location.hostname)) {
        onTapeop();
    } else {
        onRezka();
    }

    /* ═══ REZKA ═══ */
    function onRezka() {
        onReady(function () {
            injectRezkaStyles();
            installTopHeadLinks();

            if (!/\/(films|series|cartoons|animation)\/.+\.html/.test(location.pathname)) return;
            var player = document.getElementById('player');
            if (player) installUi(player);
        });
    }

    function injectRezkaStyles() {
        if (document.getElementById('r2t-styles')) return;
        var st = document.createElement('style');
        st.id = 'r2t-styles';
        st.textContent =
            /* Фиксированная шапка */
            '#r2t-header-fixed{position:fixed !important;top:0 !important;left:0 !important;right:0 !important;width:100% !important;z-index:99999 !important;display:flex !important;flex-direction:column !important;overflow:visible !important;background:#09161c;}' +
            'html body #r2t-header-fixed #top-head{position:relative !important;top:0 !important;left:0 !important;right:0 !important;width:100% !important;margin:0 !important;transform:none !important;z-index:2 !important;overflow:visible !important;}' +
            'html body #r2t-header-fixed #top-nav{position:relative !important;top:0 !important;left:0 !important;right:0 !important;width:100% !important;margin:0 !important;transform:none !important;z-index:1 !important;overflow:visible !important;}' +
            '#top-nav-wrapper{display:none !important;height:0 !important;}' +
            '.b-tophead__subscribe-dropdown,.b-tophead__holiday_icon{display:none !important;}' +
            'html body #top-head .b-tophead-left{float:left !important;display:flex !important;align-items:center !important;height:40px !important;}' +
            'html body #top-head .b-tophead__logo{position:static !important;left:auto !important;top:auto !important;margin:0 !important;float:none !important;display:inline-flex !important;align-items:center !important;}' +
            '.r2t-tophead-actual,.r2t-tophead-actual a{text-transform:none !important;letter-spacing:normal !important;font-family:inherit !important;font-size:inherit !important;font-weight:inherit !important;}' +
            '.r2t-tophead-actual{float:left !important;display:inline-block !important;color:#b6bec2;font-family:Arial,sans-serif;font-size:12px;line-height:40px;white-space:nowrap;padding:0 !important;margin:0 18px 0 0 !important;}' +
            '.r2t-tophead-actual a{color:inherit !important;text-decoration:none !important;padding:0 !important;margin:0 !important;background:none !important;border:0 !important;float:none !important;display:inline !important;transition:color .15s;}' +
            '.r2t-tophead-actual a:hover{color:#fff !important;text-decoration:underline !important;}' +

            /* Рейтинги в 1 столбец */
            '#r2t-rt-holder{display:block !important;float:none !important;clear:both !important;margin:0 !important;padding:0 !important;}' +
            'html body .b-post__info_rates{display:block !important;float:none !important;clear:both !important;margin:0 0 4px 0 !important;padding:0 !important;}' +
            'html body td > .b-post__info_rates:last-child{margin-bottom:0 !important;}' +

            /* Контейнер плеера */
            '.r2t-hidden{display:none !important;}' +
            '.r2t-player-box{width:100%;background:#000;position:relative;margin:0 0 20px 0;clear:both;}' +
            '.r2t-iframe{width:100%;height:460px;border:0;display:block;background:#000;}' +

            /* Сетка верхних кнопок озвучки (растягивается на 100% ширины плеера при любом числе кнопок) */
            'html body .b-translators__block{width:100% !important;box-sizing:border-box !important;padding:12px 0 6px 0 !important;margin:0 !important;background:transparent !important;border:0 !important;}' +
            'html body .b-translators__title{margin:0 0 8px 0 !important;padding:0 !important;font-family:Arial,sans-serif !important;font-size:15px !important;font-weight:bold !important;}' +
            'html body .b-translators__list{display:flex !important;flex-wrap:wrap !important;gap:2px !important;width:100% !important;margin:0 !important;padding:0 !important;list-style:none !important;background:transparent !important;box-sizing:border-box !important;}' +
            'html body .b-translators__list::before,html body .b-translators__list::after{display:none !important;content:none !important;}' +
            'html body .b-translators__list .b-translator__item{flex:1 1 calc(33.333% - 2px) !important;max-width:none !important;min-width:160px !important;}' +

            /* Сетка нижних кнопок действий (3 равные колонки во всю ширину плеера) */
            'html body .r2t-actions-row{display:grid !important;grid-template-columns:repeat(3,minmax(0,1fr)) !important;gap:2px !important;width:100% !important;margin:14px 0 20px 0 !important;padding:0 !important;clear:both !important;box-sizing:border-box !important;background:transparent !important;overflow:visible !important;}' +
            'html body .r2t-actions-row::before,html body .r2t-actions-row::after{display:none !important;content:none !important;}' +
            'html body .r2t-actions-col{width:100% !important;min-width:0 !important;max-width:none !important;margin:0 !important;padding:0 !important;float:none !important;position:relative !important;display:flex !important;align-items:stretch !important;box-sizing:border-box !important;background:transparent !important;overflow:visible !important;}' +

            /* Единый стиль кнопки (высота 30px — на 20% меньше, без разрывов gap внутри текста) */
            'html body .b-translators__list .b-translator__item,' +
            'html body .r2t-action-item{' +
                'display:inline-flex !important;align-items:center !important;justify-content:center !important;gap:0 !important;' +
                'width:100% !important;height:30px !important;min-height:30px !important;max-height:30px !important;' +
                'padding:0 10px !important;margin:0 !important;float:none !important;box-sizing:border-box !important;' +
                'border:0 !important;border-radius:2px !important;box-shadow:none !important;' +
                'font-family:Arial,sans-serif !important;font-size:13px !important;font-weight:bold !important;line-height:30px !important;' +
                'text-align:center !important;white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;' +
                'text-decoration:none !important;cursor:pointer !important;user-select:none !important;' +
                'background:#e2e6ea !important;color:#222 !important;transition:background .15s ease,color .15s ease !important;' +
            '}' +
            'html body.b-theme__template__night .b-translators__list .b-translator__item,' +
            'html body.b-theme__template__night .r2t-action-item{' +
                'background:#2d3438 !important;color:#cfd8dc !important;' +
            '}' +
            'html body .b-translators__list .b-translator__item img{vertical-align:middle !important;margin-left:5px !important;flex-shrink:0 !important;}' +

            /* Наведение на неактивные кнопки */
            'html body .b-translators__list .b-translator__item:hover,' +
            'html body .r2t-action-item:hover{' +
                'background:#d0d6dc !important;color:#000 !important;' +
            '}' +
            'html body.b-theme__template__night .b-translators__list .b-translator__item:hover,' +
            'html body.b-theme__template__night .r2t-action-item:hover{' +
                'background:#384147 !important;color:#fff !important;' +
            '}' +

            /* Активные состояния */
            'html body .b-translators__list .b-translator__item.active,' +
            'html body.b-theme__template__night .b-translators__list .b-translator__item.active,' +
            'html body .r2t-action-item.r2t-reviews-btn,' +
            'html body.b-theme__template__night .r2t-action-item.r2t-reviews-btn,' +
            'html body .r2t-later-btn.is-saved,' +
            'html body.b-theme__template__night .r2t-later-btn.is-saved{' +
                'background:#00a0b0 !important;color:#fff !important;' +
            '}' +
            'html body .r2t-action-item.r2t-reviews-btn:hover,' +
            'html body.b-theme__template__night .r2t-action-item.r2t-reviews-btn:hover,' +
            'html body .r2t-later-btn.is-saved:hover,' +
            'html body.b-theme__template__night .r2t-later-btn.is-saved:hover{' +
                'background:#00b4c6 !important;color:#fff !important;' +
            '}' +

            /* Состояния «Просмотрено» и «Ошибка» */
            'html body .r2t-later-btn.is-watched,' +
            'html body.b-theme__template__night .r2t-later-btn.is-watched{' +
                'background:#2e7d32 !important;color:#fff !important;' +
            '}' +
            'html body .r2t-later-btn.is-watched:hover,' +
            'html body.b-theme__template__night .r2t-later-btn.is-watched:hover{' +
                'background:#388e3c !important;color:#fff !important;' +
            '}' +
            'html body .r2t-later-btn.is-error,' +
            'html body.b-theme__template__night .r2t-later-btn.is-error{' +
                'background:#c62828 !important;color:#fff !important;' +
            '}' +
            'html body .r2t-later-btn:disabled{opacity:.7 !important;cursor:default !important;}';
        (document.head || document.documentElement).appendChild(st);
    }

    function installTopHeadLinks() {
        var topHead = document.getElementById('top-head');
        var topNav = document.getElementById('top-nav');

        if (topHead && topNav && !document.getElementById('r2t-header-fixed')) {
            var parent = topHead.parentNode;
            var fixedWrap = document.createElement('div');
            fixedWrap.id = 'r2t-header-fixed';

            var spacer = document.createElement('div');
            spacer.id = 'r2t-header-spacer';

            if (window.getComputedStyle) {
                var headBg = window.getComputedStyle(topHead).backgroundColor;
                var bodyBg = window.getComputedStyle(document.body).backgroundColor;
                if (headBg && headBg !== 'rgba(0, 0, 0, 0)' && headBg !== 'transparent') {
                    fixedWrap.style.backgroundColor = headBg;
                } else if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') {
                    fixedWrap.style.backgroundColor = bodyBg;
                }
            }

            parent.insertBefore(fixedWrap, topHead);
            fixedWrap.appendChild(topHead);
            fixedWrap.appendChild(topNav);
            parent.insertBefore(spacer, fixedWrap.nextSibling);

            var syncSpacerHeight = function () {
                var h = fixedWrap.offsetHeight;
                if (h > 0) spacer.style.height = h + 'px';
            };
            syncSpacerHeight();
            window.addEventListener('load', syncSpacerHeight);
            window.addEventListener('resize', syncSpacerHeight);
        }

        if (document.getElementById('r2t-tophead-actual')) return;

        var rightContainer = document.querySelector('#top-head .b-tophead-right');
        var contwatchEl = document.querySelector('#top-head .b-tophead__contwatch');
        var favsEl = document.querySelector('#top-head .b-tophead__favs');
        var refEl = contwatchEl || favsEl || document.querySelector('#top-head .b-tophead__profile');

        var box = document.createElement('div');
        box.id = 'r2t-tophead-actual';
        box.className = 'r2t-tophead-actual';

        if (refEl && window.getComputedStyle) {
            var cs = window.getComputedStyle(refEl);
            box.style.setProperty('font-family', cs.fontFamily, 'important');
            box.style.setProperty('font-size', cs.fontSize, 'important');
            box.style.setProperty('font-weight', cs.fontWeight, 'important');
            if (cs.lineHeight && cs.lineHeight !== 'normal') {
                box.style.setProperty('line-height', cs.lineHeight, 'important');
            }
            box.style.setProperty('padding-top', cs.paddingTop, 'important');
            box.style.setProperty('padding-bottom', cs.paddingBottom, 'important');
            box.style.setProperty('margin-top', cs.marginTop, 'important');
            box.style.setProperty('color', cs.color, 'important');
        }

        box.innerHTML =
            'Популярные ' +
            '<a href="https://rezka.fi/?filter=watching&genre=1">фильмы</a>, ' +
            '<a href="https://rezka.fi/?filter=watching&genre=2">сериалы</a>, ' +
            '<a href="https://rezka.fi/?filter=watching&genre=3">мультфильмы</a>';

        if (rightContainer && refEl) {
            if (contwatchEl && favsEl) {
                var gap = Math.round(favsEl.getBoundingClientRect().left - contwatchEl.getBoundingClientRect().right);
                if (gap > 0) {
                    contwatchEl.style.setProperty('margin-left', '0px', 'important');
                    box.style.setProperty('margin-right', gap + 'px', 'important');
                }
            }
            rightContainer.insertBefore(box, refEl);
        } else {
            var fallback = document.querySelector('#top-head .b-tophead');
            if (fallback) fallback.appendChild(box);
        }
    }

    /* ═══ ROTTEN TOMATOES (Tomatometer & Popcornmeter) ═══ */
    function getScoreColor(value, maxVal) {
        var num = parseFloat(String(value).replace(',', '.'));
        if (isNaN(num)) return '';
        var ratio = Math.max(0, Math.min(1, num / maxVal));
        var hue = Math.round(ratio * 120);
        return 'hsl(' + hue + ', 85%, 52%)';
    }

    function cleanDigitsOnly(val) {
        if (val === undefined || val === null) return '';
        var digits = String(val).replace(/\D+/g, '');
        if (!digits) return '';
        return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    function formatNativeRates(ratesCell) {
        var imdbEl = ratesCell.querySelector('.b-post__info_rates.imdb');
        var kpEl = ratesCell.querySelector('.b-post__info_rates.kp');

        if (kpEl) {
            var kpLink = kpEl.querySelector('a');
            if (kpLink) kpLink.textContent = 'Kinopoisk';
        }
        if (imdbEl && kpEl && imdbEl.nextSibling !== kpEl) {
            ratesCell.appendChild(imdbEl);
            ratesCell.appendChild(kpEl);
        }

        var nativeRates = [imdbEl, kpEl];
        for (var i = 0; i < nativeRates.length; i++) {
            var el = nativeRates[i];
            if (!el) continue;
            el.style.setProperty('display', 'block', 'important');
            el.style.setProperty('float', 'none', 'important');
            el.style.setProperty('clear', 'both', 'important');
            el.style.setProperty('margin', i === nativeRates.length - 1 ? '0' : '0 0 4px 0', 'important');

            var boldEl = el.querySelector('.bold');
            if (boldEl) {
                var color = getScoreColor(boldEl.textContent, 10);
                if (color) boldEl.style.setProperty('color', color, 'important');
            }
        }
    }

    function installRottenTomatoesRatings(movie) {
        var ratesCell = findOrCreateRatesCell();
        if (!ratesCell) return;

        formatNativeRates(ratesCell);

        if (document.getElementById('r2t-rt-holder')) return;

        var holder = document.createElement('div');
        holder.id = 'r2t-rt-holder';
        ratesCell.insertBefore(holder, ratesCell.firstChild);

        var cacheKey = movie.imdb || ((movie.orig || movie.cleanTitle) + '_' + (movie.year || ''));
        var cache = GM_getValue(RT_CACHE_KEY, {});
        var now = Date.now();

        for (var k in cache) {
            if (now - (cache[k].ts || 0) > 24 * 60 * 60 * 1000) delete cache[k];
        }

        if (cache[cacheKey] && (cache[cacheKey].tomatometer || cache[cacheKey].popcornmeter)) {
            renderRtScores(holder, cache[cacheKey]);
            return;
        }

        fetchRottenTomatoesData(movie).then(function (data) {
            if (!data || (!data.tomatometer && !data.popcornmeter)) return;
            cache[cacheKey] = {
                url: data.url,
                tomatometer: data.tomatometer,
                tomatometerCount: data.tomatometerCount,
                popcornmeter: data.popcornmeter,
                popcornmeterCount: data.popcornmeterCount,
                ts: Date.now()
            };
            GM_setValue(RT_CACHE_KEY, cache);
            renderRtScores(holder, data);
        }).catch(function () {});
    }

    function findOrCreateRatesCell() {
        var existingRate = document.querySelector('.b-post__info_rates');
        if (existingRate && existingRate.parentNode) {
            return existingRate.parentNode;
        }
        var infoTable = document.querySelector('table.b-post__info tbody, table.b-post__info');
        if (!infoTable) return null;
        var tr = document.createElement('tr');
        tr.innerHTML = '<td class="l"><h2>Рейтинги:</h2></td><td></td>';
        infoTable.insertBefore(tr, infoTable.firstChild);
        return tr.querySelector('td:last-child');
    }

    function renderRtScores(holder, data) {
        var url = data.url || 'https://www.rottentomatoes.com/';
        var html = '';

        function buildRow(label, rawScore, rawCount) {
            var numScore = rawScore ? String(rawScore).replace(/%+$/, '') : null;
            var displayScore = numScore ? (numScore + '%') : '—';
            var color = numScore ? getScoreColor(numScore, 100) : '';
            var styleAttr = color ? (' style="color:' + color + ' !important;"') : '';
            var cleanCount = cleanDigitsOnly(rawCount);
            var countHtml = cleanCount ? (' <i>(' + cleanCount + ')</i>') : '';

            return '<div class="b-post__info_rates r2t-rt" style="display:block !important;float:none !important;clear:both !important;margin:0 0 4px 0 !important;">' +
                   '<a href="' + url + '" target="_blank" rel="nofollow noopener">' + label + '</a>: ' +
                   '<span class="bold"' + styleAttr + '>' + displayScore + '</span>' +
                   countHtml +
                   '</div>';
        }

        html += buildRow('Tomatometer', data.tomatometer, data.tomatometerCount);
        html += buildRow('Popcornmeter', data.popcornmeter, data.popcornmeterCount);

        holder.innerHTML = html;
    }

    function gmFetchText(url, headers) {
        return new Promise(function (resolve, reject) {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('GM_xmlhttpRequest unavailable'));
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: headers || { 'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8' },
                onload: function (res) {
                    if (res.status >= 200 && res.status < 400 && res.responseText) {
                        resolve(res.responseText);
                    } else {
                        reject(new Error('HTTP ' + res.status));
                    }
                },
                onerror: function () { reject(new Error('Network error')); },
                ontimeout: function () { reject(new Error('Timeout')); }
            });
        });
    }

    function fetchRottenTomatoesData(movie) {
        var slugPromise = movie.imdb
            ? gmFetchText(
                'https://query.wikidata.org/sparql?format=json&query=' +
                encodeURIComponent('SELECT ?rt WHERE { ?item wdt:P345 "' + movie.imdb + '" . ?item wdt:P1258 ?rt . } LIMIT 1'),
                { 'Accept': 'application/sparql-results+json' }
            ).then(function (txt) {
                var j = JSON.parse(txt);
                var b = j && j.results && j.results.bindings;
                if (b && b.length && b[0].rt && b[0].rt.value) {
                    return 'https://www.rottentomatoes.com/' + b[0].rt.value.replace(/^\/+/, '');
                }
                return null;
            }).catch(function () { return null; })
            : Promise.resolve(null);

        return slugPromise.then(function (exactUrl) {
            if (exactUrl) {
                return gmFetchText(exactUrl).then(function (html) {
                    var parsed = parseRtPageHtml(html, exactUrl);
                    if (parsed) return parsed;
                    return searchRtByTitle(movie);
                }).catch(function () {
                    return searchRtByTitle(movie);
                });
            }
            return searchRtByTitle(movie);
        });
    }

    function searchRtByTitle(movie) {
        var candidates = [];
        if (movie.orig) {
            var parts = movie.orig.split(/\s*\/\s*/);
            for (var i = 0; i < parts.length; i++) {
                if (/[a-zA-Z]/.test(parts[i])) candidates.push(parts[i].trim());
            }
            for (var j = 0; j < parts.length; j++) {
                if (candidates.indexOf(parts[j].trim()) === -1) candidates.push(parts[j].trim());
            }
        }
        if (movie.cleanTitle && candidates.indexOf(movie.cleanTitle) === -1) {
            candidates.push(movie.cleanTitle);
        }
        if (!candidates.length) return Promise.resolve(null);

        var query = candidates[0];
        var searchUrl = 'https://www.rottentomatoes.com/search?search=' + encodeURIComponent(query);

        return gmFetchText(searchUrl).then(function (html) {
            var bestUrl = pickBestRtSearchResult(html, query, movie);
            if (!bestUrl) return null;
            return gmFetchText(bestUrl).then(function (pageHtml) {
                return parseRtPageHtml(pageHtml, bestUrl);
            });
        });
    }

    function pickBestRtSearchResult(html, query, movie) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var rows = doc.querySelectorAll('search-page-media-row');
        var targetYears = getTargetYears(movie.year);
        var normQuery = normalizeTitle(query);
        var best = null;
        var bestScore = -999;

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var a = row.querySelector('a[data-qa="info-name"], a[slot="title"], a[href*="/m/"], a[href*="/tv/"]');
            if (!a) continue;
            var href = a.getAttribute('href') || '';
            if (!href) continue;
            if (href.indexOf('http') !== 0) href = 'https://www.rottentomatoes.com' + href;

            var name = normalizeTitle(a.textContent || '');
            var rYear = parseInt(row.getAttribute('release-year') || row.getAttribute('start-year') || '0', 10);
            var isTvUrl = href.indexOf('/tv/') !== -1;

            var score = 0;
            if (movie.isSeries === isTvUrl) score += 25;
            else score -= 15;

            if (name === normQuery) score += 50;
            else if (name.indexOf(normQuery) !== -1 || normQuery.indexOf(name) !== -1) score += 20;

            if (rYear && targetYears.length) {
                var minDiff = 999;
                for (var y = 0; y < targetYears.length; y++) {
                    var diff = Math.abs(rYear - targetYears[y]);
                    if (diff < minDiff) minDiff = diff;
                }
                if (minDiff === 0) score += 40;
                else if (minDiff === 1) score += 25;
                else if (minDiff === 2) score += 5;
                else score -= 20;
            }

            if (row.getAttribute('tomatometerscore')) score += 5;

            if (score > bestScore) {
                bestScore = score;
                best = href;
            }
        }

        if (best) return best;

        var fallbackLinks = doc.querySelectorAll('a[href*="/m/"], a[href*="/tv/"]');
        for (var k = 0; k < fallbackLinks.length; k++) {
            var lnk = fallbackLinks[k].getAttribute('href') || '';
            if (/^https?:\/\/www\.rottentomatoes\.com\/(m|tv)\/[a-z0-9_-]+$/i.test(lnk)) {
                return lnk;
            }
        }
        return null;
    }

    function getTargetYears(primaryYear) {
        var years = [];
        if (primaryYear && !isNaN(Number(primaryYear))) {
            years.push(parseInt(primaryYear, 10));
        }
        var cells = document.querySelectorAll('.b-post__info td');
        for (var i = 0; i < cells.length; i++) {
            var txt = cells[i].textContent || '';
            var m = txt.match(/\b(19\d{2}|20\d{2})\s*год/i);
            if (m) {
                var y = parseInt(m[1], 10);
                if (years.indexOf(y) === -1) years.push(y);
            }
        }
        return years;
    }

    function normalizeTitle(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/['’`":!?,.\-—()[\]]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function parseRtPageHtml(html, pageUrl) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var tomatometer = null, tomatometerCount = null;
        var popcornmeter = null, popcornmeterCount = null;

        var scorecardScript = doc.getElementById('media-scorecard-json');
        if (scorecardScript && scorecardScript.textContent) {
            try {
                var sc = JSON.parse(scorecardScript.textContent);
                if (sc.criticsScore) {
                    tomatometer = sc.criticsScore.score || sc.criticsScore.scorePercent || null;
                    tomatometerCount = cleanDigitsOnly(sc.criticsScore.reviewCount || sc.criticsScore.ratingCount || sc.criticsScore.bandedRatingCount);
                }
                if (sc.audienceScore) {
                    popcornmeter = sc.audienceScore.score || sc.audienceScore.scorePercent || null;
                    popcornmeterCount = cleanDigitsOnly(sc.audienceScore.reviewCount || sc.audienceScore.ratingCount || sc.audienceScore.bandedRatingCount);
                }
            } catch (e) {}
        }

        if (!tomatometer) {
            var cEl = doc.querySelector('rt-text[slot="criticsScore"], rt-text[slot="critics-score"], [slot="criticsScore"]');
            if (cEl) {
                var cm = (cEl.textContent || '').match(/(\d+)\s*%/);
                if (cm) tomatometer = cm[1];
            }
        }
        if (!popcornmeter) {
            var aEl = doc.querySelector('rt-text[slot="audienceScore"], rt-text[slot="audience-score"], [slot="audienceScore"]');
            if (aEl) {
                var am = (aEl.textContent || '').match(/(\d+)\s*%/);
                if (am) popcornmeter = am[1];
            }
        }

        var sb = doc.querySelector('score-board');
        if (sb) {
            if (!tomatometer && sb.getAttribute('tomatometerscore')) {
                tomatometer = sb.getAttribute('tomatometerscore');
            }
            if (!popcornmeter && sb.getAttribute('audiencescore')) {
                popcornmeter = sb.getAttribute('audiencescore');
            }
        }

        if (!tomatometer) {
            var rmC = html.match(/"criticsScore"\s*:\s*\{[^}]*?"score"\s*:\s*"(\d+)"/);
            if (rmC) tomatometer = rmC[1];
        }
        if (!popcornmeter) {
            var rmA = html.match(/"audienceScore"\s*:\s*\{[^}]*?"score"\s*:\s*"(\d+)"/);
            if (rmA) popcornmeter = rmA[1];
        }

        if (!tomatometer && !popcornmeter) return null;

        return {
            url: pageUrl,
            tomatometer: tomatometer,
            tomatometerCount: tomatometerCount || null,
            popcornmeter: popcornmeter,
            popcornmeterCount: popcornmeterCount || null
        };
    }

    /* ═══ ПЛЕЕР И ОЗВУЧКИ (TapeOp в «Выбрать озвучку:») ═══ */
    function getNativePlayerNodes(player) {
        var selectors = [
            '#player',
            '#simple-episodes-tabs',
            '.b-simple_episodes__list',
            '#simple-episodes-list',
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

        // 1. Рейтинги Rotten Tomatoes
        installRottenTomatoesRatings(movie);

        // 2. Создаём контейнер плеера TapeOp (над родным #player)
        var playerBox = document.createElement('div');
        playerBox.className = 'r2t-player-box';

        var iframe = document.createElement('iframe');
        iframe.className = 'r2t-iframe';
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; fullscreen; encrypted-media';
        iframe.src = 'about:blank';
        playerBox.appendChild(iframe);

        player.parentNode.insertBefore(playerBox, player);

        // 3. Встраиваем вкладку TapeOp на 1-е место в «Выбрать озвучку:» и выбираем по умолчанию
        installTapeopTranslatorTab(player, playerBox, iframe);

        // 4. Скрываем родной плеер Rezka по умолчанию
        var nativeNodes = getNativePlayerNodes(player);
        for (var i = 0; i < nativeNodes.length; i++) {
            nativeNodes[i].classList.add('r2t-hidden');
        }

        // 5. Выстраиваем «Отзывы», «В закладках» и «Посмотреть позже» в 1 симметричный ряд
        installBottomActionsRow(movie, playerBox);

        // 6. Передаём данные фильма в iframe TapeOp
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

    function installTapeopTranslatorTab(player, playerBox, iframe) {
        var translatorsBlock = document.querySelector('.b-translators__block');
        var translatorsList = document.querySelector('#translators-list, .b-translators__list');

        if (!translatorsList) {
            translatorsBlock = document.createElement('div');
            translatorsBlock.className = 'b-translators__block';
            translatorsBlock.innerHTML =
                '<div class="b-translators__title">Выбрать озвучку:</div>' +
                '<ul id="translators-list" class="b-translators__list">' +
                '<li title="Rezka" class="b-translator__item r2t-single-rezka">Rezka</li>' +
                '</ul>';
            playerBox.parentNode.insertBefore(translatorsBlock, playerBox);
            translatorsList = translatorsBlock.querySelector('.b-translators__list');
        }

        var defaultActive = translatorsList.querySelector('.b-translator__item.active');
        if (defaultActive && defaultActive.getAttribute('data-translator_id')) {
            translatorsList.setAttribute('data-r2t-default-tr', defaultActive.getAttribute('data-translator_id'));
        }

        var sampleItem = translatorsList.querySelector('.b-translator__item');
        var tagName = sampleItem ? sampleItem.tagName : 'LI';

        var tapeopTab = document.createElement(tagName);
        tapeopTab.className = 'b-translator__item active r2t-translator-item';
        tapeopTab.setAttribute('title', 'Плеер TapeOp');
        tapeopTab.textContent = 'TapeOp';

        var allItems = translatorsList.querySelectorAll('.b-translator__item');
        for (var i = 0; i < allItems.length; i++) {
            allItems[i].classList.remove('active');
        }

        translatorsList.insertBefore(tapeopTab, translatorsList.firstChild);

        function activateTapeopMode() {
            var items = translatorsList.querySelectorAll('.b-translator__item');
            for (var j = 0; j < items.length; j++) {
                if (items[j] !== tapeopTab) items[j].classList.remove('active');
            }
            tapeopTab.classList.add('active');

            pauseRezkaNativePlayer();
            var nodes = getNativePlayerNodes(document.getElementById('player'));
            for (var k = 0; k < nodes.length; k++) {
                nodes[k].classList.add('r2t-hidden');
            }
            playerBox.classList.remove('r2t-hidden');
        }

        function activateRezkaMode(clickedItem) {
            tapeopTab.classList.remove('active');
            if (clickedItem) {
                var items = translatorsList.querySelectorAll('.b-translator__item');
                for (var j = 0; j < items.length; j++) {
                    if (items[j] !== clickedItem) items[j].classList.remove('active');
                }
                clickedItem.classList.add('active');
                if (clickedItem.getAttribute('data-translator_id')) {
                    translatorsList.setAttribute('data-r2t-default-tr', clickedItem.getAttribute('data-translator_id'));
                }
            }

            pauseTapeopPlayer(iframe);
            playerBox.classList.add('r2t-hidden');

            var nodes = getNativePlayerNodes(document.getElementById('player'));
            for (var k = 0; k < nodes.length; k++) {
                nodes[k].classList.remove('r2t-hidden');
            }
            window.dispatchEvent(new Event('resize'));
        }

        tapeopTab.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            activateTapeopMode();
        }, true);

        translatorsList.addEventListener('click', function (ev) {
            var item = ev.target && ev.target.closest ? ev.target.closest('.b-translator__item') : null;
            if (!item || item === tapeopTab) return;
            activateRezkaMode(item);
        }, true);
    }

    /* ═══ КНОПКИ «ОТЗЫВЫ», «В ЗАКЛАДКАХ» И «ПОСМОТРЕТЬ ПОЗЖЕ» В 1 СТРОКУ ═══ */
    function formatReviewsButtonText(reviewsBtn) {
        if (!reviewsBtn) return;
        var walker = document.createTreeWalker(reviewsBtn, NodeFilter.SHOW_TEXT, null, false);
        var textNodes = [];
        var n;
        while ((n = walker.nextNode())) {
            textNodes.push(n);
        }
        for (var i = 0; i < textNodes.length; i++) {
            var t = textNodes[i].nodeValue;
            if (!t) continue;
            var updated = t
                .replace(/\(\s+/g, '(')
                .replace(/\s+\)/g, ')')
                .replace(/Отзывы\s*\(/gi, 'Отзывы (');
            if (updated !== t) textNodes[i].nodeValue = updated;
        }
    }

    function shortenFavButtonText(favBtn) {
        if (!favBtn) return;

        var fullText = (favBtn.textContent || '').replace(/\s+/g, ' ').trim();
        if (!fullText) return;

        var walker = document.createTreeWalker(favBtn, NodeFilter.SHOW_TEXT, null, false);
        var textNodes = [];
        var n;
        while ((n = walker.nextNode())) {
            textNodes.push(n);
        }

        for (var i = 0; i < textNodes.length; i++) {
            var t = textNodes[i].nodeValue;
            if (!t || !t.trim()) continue;
            var updated = t
                .replace(/Находится[\s\u00A0]+в[\s\u00A0]+закладках/gi, 'В закладках')
                .replace(/Добавить[\s\u00A0]+(?:к[\s\u00A0]+себе[\s\u00A0]+)?в[\s\u00A0]+закладки\.*/gi, 'В закладки')
                .replace(/\([\s\u00A0]*в[\s\u00A0]+(\d+)[\s\u00A0]*раздел[а-яё]*[\s\u00A0]*\)/gi, '($1)')
                .replace(/в[\s\u00A0]+(\d+)[\s\u00A0]*раздел[а-яё]*/gi, '$1')
                .replace(/\([\s\u00A0]*в[\s\u00A0]+/gi, '(')
                .replace(/[\s\u00A0]*раздел[а-яё]*[\s\u00A0]*\)/gi, ')')
                .replace(/[\s\u00A0]*раздел[а-яё]*/gi, '');
            if (updated !== t) {
                textNodes[i].nodeValue = updated;
            }
        }

        var afterText = (favBtn.textContent || '').replace(/\s+/g, ' ').trim();
        if (/Находится|Добавить|раздел/i.test(afterText)) {
            var countMatch = afterText.match(/(\d+)/);
            if (/Находится|В закладках/i.test(afterText) && countMatch) {
                if (favBtn.children.length === 0) {
                    favBtn.textContent = 'В закладках (' + countMatch[1] + ')';
                }
            } else if (/Добавить/i.test(afterText)) {
                if (favBtn.children.length === 0) {
                    favBtn.textContent = 'В закладки';
                }
            }
        }
    }

    function findReviewsAndFavElements() {
        var reviewsRe = /^(?:Отзывы\s*\(\s*\d+\s*\)|Добавить\s+отзыв)$/i;
        var favRe = /^(?:Находится\s+в\s+закладках\s*(?:\([^)]*\))?|Добавить\s+(?:к\s+себе\s+)?в\s+закладки\.{0,3}|В\s+закладках\s*(?:\(\s*\d+\s*\))?|В\s+закладки)$/i;

        var reviewsBtn = null;
        var favBtn = null;

        var all = document.querySelectorAll('a, button, div, span');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (el.offsetParent === null) continue;
            var txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (!txt || txt.length > 70) continue;

            if (reviewsRe.test(txt)) {
                reviewsBtn = el;
            } else if (favRe.test(txt)) {
                favBtn = el;
            }
        }

        while (reviewsBtn && reviewsBtn.tagName === 'SPAN' && reviewsBtn.parentElement &&
               (reviewsBtn.parentElement.textContent || '').replace(/\s+/g, ' ').trim() === (reviewsBtn.textContent || '').replace(/\s+/g, ' ').trim()) {
            reviewsBtn = reviewsBtn.parentElement;
        }
        while (favBtn && favBtn.tagName === 'SPAN' && favBtn.parentElement &&
               (favBtn.parentElement.textContent || '').replace(/\s+/g, ' ').trim() === (favBtn.textContent || '').replace(/\s+/g, ' ').trim()) {
            favBtn = favBtn.parentElement;
        }

        return { reviewsBtn: reviewsBtn, favBtn: favBtn };
    }

    function installBottomActionsRow(movie, playerBox) {
        var watchLaterBtn = createWatchLaterButton(movie);
        var found = findReviewsAndFavElements();
        var reviewsBtn = found.reviewsBtn;
        var favBtn = found.favBtn;

        if (reviewsBtn) {
            formatReviewsButtonText(reviewsBtn);
        }

        if (favBtn) {
            shortenFavButtonText(favBtn);

            var favHolder = favBtn.closest('[data-post_id], .b-userset__fav_holder') || favBtn.parentElement;
            if (favHolder) {
                var isUpdatingFav = false;
                var favObs = new MutationObserver(function () {
                    if (isUpdatingFav) return;
                    isUpdatingFav = true;
                    var latest = findReviewsAndFavElements().favBtn || favBtn;
                    shortenFavButtonText(latest);
                    latest.classList.add('r2t-action-item', 'r2t-fav-btn');
                    isUpdatingFav = false;
                });
                favObs.observe(favHolder, { childList: true, characterData: true, subtree: true });
            }
        }

        if (reviewsBtn && favBtn) {
            var ancestors = [];
            var p = reviewsBtn;
            while (p && p !== document.body) {
                ancestors.push(p);
                p = p.parentElement;
            }
            var commonParent = favBtn;
            while (commonParent && ancestors.indexOf(commonParent) === -1) {
                commonParent = commonParent.parentElement;
            }

            if (commonParent && commonParent !== document.body) {
                var colReviews = reviewsBtn;
                while (colReviews.parentElement && colReviews.parentElement !== commonParent) {
                    colReviews = colReviews.parentElement;
                }
                var colFav = favBtn;
                while (colFav.parentElement && colFav.parentElement !== commonParent) {
                    colFav = colFav.parentElement;
                }

                var curR = reviewsBtn.parentElement;
                while (curR && curR !== commonParent) {
                    curR.style.setProperty('width', '100%', 'important');
                    curR.style.setProperty('margin', '0', 'important');
                    curR.style.setProperty('padding', '0', 'important');
                    curR.style.setProperty('background', 'transparent', 'important');
                    curR = curR.parentElement;
                }
                var curF = favBtn.parentElement;
                while (curF && curF !== commonParent) {
                    curF.style.setProperty('width', '100%', 'important');
                    curF.style.setProperty('margin', '0', 'important');
                    curF.style.setProperty('padding', '0', 'important');
                    curF.style.setProperty('background', 'transparent', 'important');
                    curF = curF.parentElement;
                }

                commonParent.classList.add('r2t-actions-row');
                colReviews.classList.add('r2t-actions-col');
                colFav.classList.add('r2t-actions-col');

                var colWatchLater = document.createElement('div');
                colWatchLater.className = 'r2t-actions-col';
                colWatchLater.appendChild(watchLaterBtn);

                reviewsBtn.classList.add('r2t-action-item', 'r2t-reviews-btn');
                favBtn.classList.add('r2t-action-item', 'r2t-fav-btn');
                watchLaterBtn.classList.add('r2t-action-item');

                commonParent.appendChild(colWatchLater);
                return;
            }
        }

        var fallbackRow = document.createElement('div');
        fallbackRow.className = 'r2t-actions-row';
        var fallbackCol = document.createElement('div');
        fallbackCol.className = 'r2t-actions-col';
        watchLaterBtn.classList.add('r2t-action-item');
        fallbackCol.appendChild(watchLaterBtn);
        fallbackRow.appendChild(fallbackCol);
        playerBox.parentNode.insertBefore(fallbackRow, playerBox.nextSibling);
    }

    function createWatchLaterButton(movie) {
        var watchLaterBtn = document.createElement('button');
        watchLaterBtn.type = 'button';
        watchLaterBtn.className = 'r2t-later-btn r2t-action-item';
        watchLaterBtn.textContent = 'Посмотреть позже';

        // step: 0 = нет в списке, 1 = в списке (не просмотрено), 2 = просмотрено
        var state = { step: 0, rowId: null };

        function renderBtnState() {
            watchLaterBtn.disabled = false;
            var baseCls = 'r2t-later-btn r2t-action-item';
            if (state.step === 1) {
                watchLaterBtn.className = baseCls + ' is-saved';
                watchLaterBtn.textContent = 'Посмотреть позже';
                watchLaterBtn.title = 'Нажмите, чтобы отметить как просмотренное';
            } else if (state.step === 2) {
                watchLaterBtn.className = baseCls + ' is-watched';
                watchLaterBtn.textContent = 'Просмотрено';
                watchLaterBtn.title = 'Нажмите, чтобы удалить из просмотренного';
            } else {
                watchLaterBtn.className = baseCls;
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

        watchLaterBtn.addEventListener('click', function () {
            var uEl = document.getElementById('member_user_id');
            if (!uEl || !uEl.value || uEl.value === '0') {
                watchLaterBtn.className = 'r2t-later-btn r2t-action-item is-error';
                watchLaterBtn.textContent = 'Войдите в аккаунт';
                return;
            }

            var currentParams = getRezkaWatchParams(movie.isSeries);
            if (!currentParams.post_id) {
                watchLaterBtn.className = 'r2t-later-btn r2t-action-item is-error';
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
                    watchLaterBtn.className = 'r2t-later-btn r2t-action-item is-error';
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
                        watchLaterBtn.className = 'r2t-later-btn r2t-action-item is-error';
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
                        watchLaterBtn.className = 'r2t-later-btn r2t-action-item is-error';
                        watchLaterBtn.textContent = 'Ошибка удаления';
                    });
            }
        });

        return watchLaterBtn;
    }

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

        var translatorsList = document.querySelector('#translators-list, .b-translators__list');
        var activeTr = document.querySelector('.b-translator__item.active:not(.r2t-translator-item)');
        if (activeTr && activeTr.getAttribute('data-translator_id')) {
            translatorId = activeTr.getAttribute('data-translator_id');
        } else if (translatorsList && translatorsList.getAttribute('data-r2t-default-tr')) {
            translatorId = translatorsList.getAttribute('data-r2t-default-tr');
        } else {
            var firstTr = document.querySelector('.b-translator__item[data-translator_id]');
            if (firstTr) translatorId = firstTr.getAttribute('data-translator_id');
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
