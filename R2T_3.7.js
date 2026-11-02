// ==UserScript==
// @name         Rezka2TapeOp
// @namespace    rezka2tapeop
// @version      3.7
// @description  Все источники TapeOp (Alloha, Gencit, Kodik, Veoveo, Videoseed, Collaps, Turbo) + защита от подмены фильмов-тёзок других лет
// @match        *://rezka.fi/*
// @match        *://rezka.ag/*
// @match        *://rezka.co/*
// @match        *://rezka.today/*
// @match        *://rezka.zone/*
// @match        *://rezka.la/*
// @match        *://rezkago.com/*
// @match        *://*.rezka.ag/*
// @match        *://*.rezka.fi/*
// @match        *://tapeop.dev/*
// @match        *://www.tapeop.dev/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      www.rottentomatoes.com
// @connect      rottentomatoes.com
// @connect      query.wikidata.org
// @connect      www.wikidata.org
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    var STORAGE_KEY = 'rezka2tapeop-movie-v311';
    var RT_CACHE_KEY = 'rezka2tapeop-rt-cache-v311';
    var WD_CACHE_KEY = 'rezka2tapeop-wd-cache-v311';
    var TAPEOP_PROTOCOL_VERSION = '3.5.1';

    if (/(^|\.)tapeop\.dev$/i.test(location.hostname)) {
        initTapeopSide();
    } else {
        initRezkaSide();
    }

    /* ═══════════════════════════════════════════════════════════════════
     * ЧАСТЬ 1. СТОРОНА REZKA: ПАРСИНГ, ЗАЩИТА ОТ ОМОНИМОВ И WIKIDATA
     * ═══════════════════════════════════════════════════════════════════ */

    function initRezkaSide() {
        onDomReady(function () {
            injectRezkaStyles();
            installTopHeadLinks();

            if (!/\/(films|series|cartoons|animation|show)\/.+\.html/i.test(location.pathname)) return;
            var playerNode = document.getElementById('player');
            if (playerNode) {
                installRezkaPlayerUi(playerNode);
            }
        });
    }

    function extractRezkaMedia() {
        var catMatch = location.pathname.match(/^\/(?:ua\/)?(films|series|cartoons|animation|show)\//i);
        var category = catMatch ? catMatch[1].toLowerCase() : 'films';
        var isAnime = category === 'animation' || !!document.querySelector('.b-post__info a[href*="/animation/"], .b-post__info a[href*="/anime/"]');

        // 1. Анализ инлайн-скриптов плеерной инициализации
        var cdnInitType = null;
        var cdnPostId = null;
        var cdnSeason = null;
        var cdnEpisode = null;

        var scripts = document.querySelectorAll('script:not([src])');
        for (var i = 0; i < scripts.length; i++) {
            var code = scripts[i].textContent || '';
            var serMatch = code.match(/initCDNSeriesEvents\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (serMatch) {
                cdnInitType = 'series';
                cdnPostId = serMatch[1];
                cdnSeason = parseInt(serMatch[3], 10) || 1;
                cdnEpisode = parseInt(serMatch[4], 10) || 1;
                break;
            }
            var movMatch = code.match(/initCDNMoviesEvents\(\s*(\d+)\s*,\s*(\d+)/);
            if (movMatch) {
                cdnInitType = 'movie';
                cdnPostId = movMatch[1];
                break;
            }
        }

        // 2. Определение сериал / фильм
        var ogTypeEl = document.querySelector('meta[property="og:type"]');
        var ogType = ogTypeEl ? (ogTypeEl.getAttribute('content') || '').trim() : '';
        var hasEpisodesDom = !!document.querySelector('#simple-episodes-tabs, #simple-seasons-tabs, .b-simple_episodes__list');

        var isSeries;
        if (cdnInitType === 'series') {
            isSeries = true;
        } else if (cdnInitType === 'movie') {
            isSeries = false;
        } else {
            isSeries = ogType === 'video.tv_series' || ogType === 'video.episode' || category === 'series' || hasEpisodesDom;
        }

        // 3. Проверка: является ли страница анонсом/трейлером без вышедшего видео
        var hasCdnPlayer = !!document.getElementById('cdnplayer');
        var hasWaitStatus = !!document.querySelector('.b-post__go_status, #ownplayer');
        var isUpcomingTrailer = !hasCdnPlayer && hasWaitStatus;

        // 4. Извлечение русского заголовка (H1 и og:title)
        var h1El = document.querySelector('.b-post__title h1, h1[itemprop="name"], h1');
        var rawH1 = h1El ? (h1El.textContent || '').trim() : '';

        var ogTitleEl = document.querySelector('meta[property="og:title"]');
        var rawOg = ogTitleEl ? (ogTitleEl.getAttribute('content') || '').trim() : '';

        var ogYear = null;
        if (rawOg) {
            var ogYearMatch = rawOg.match(/\((\d{4})(?:\s*[-–—]\s*(?:\d{4}|\.{3}))?\)\s*$/);
            if (ogYearMatch) {
                ogYear = parseInt(ogYearMatch[1], 10);
                rawOg = rawOg.replace(/\s*\(\d{4}(?:\s*[-–—]\s*(?:\d{4}|\.{3}))?\)\s*$/, '').trim();
            }
        }

        var rawRuTitle = rawH1 || rawOg;
        if (!rawRuTitle) return null;

        // 5. Определение номера сезона для сериалов и аниме ([ТВ-3], вкладки сезонов)
        var detectedSeason = cdnSeason;
        var tvTagMatch = rawRuTitle.match(/\[\s*(?:ТВ|TV)\s*[-–—]?\s*(\d+)\s*\]/i);
        if (tvTagMatch) {
            detectedSeason = parseInt(tvTagMatch[1], 10);
        }
        if (!detectedSeason && isSeries) {
            var activeSeasonTab = document.querySelector('#simple-seasons-tabs .b-simple_season__item.active, #simple-seasons-tabs .b-simple_season__item');
            if (activeSeasonTab && activeSeasonTab.getAttribute('data-tab_id')) {
                var tabSeason = parseInt(activeSeasonTab.getAttribute('data-tab_id'), 10);
                var allSeasonTabs = document.querySelectorAll('#simple-seasons-tabs .b-simple_season__item');
                if (allSeasonTabs.length === 1 && tabSeason > 1) {
                    detectedSeason = tabSeason;
                }
            }
        }

        // 6. Оригинальное название (.b-post__origtitle)
        var origEl = document.querySelector('.b-post__origtitle');
        var rawOrigTitle = origEl ? (origEl.textContent || '').trim() : '';

        var parsedTitles = buildTitleCandidates(rawRuTitle, rawOrigTitle, detectedSeason);

        // 7. Точное определение года текущего релиза и проверка франшизы на полные тёзки (омонимы)
        var yearAndFranchise = analyzeYearsAndFranchise(ogYear, isSeries, parsedTitles.baseRu[0] || parsedTitles.cleanRuFull);
        var primaryYear = yearAndFranchise.primaryYear;

        // 8. Извлечение ID Кинопоиска и IMDb со страницы
        var kpId = extractExternalId('.b-post__info_rates.kp a', [
            /kinopoisk\.ru\/(?:film|series)\/(\d+)/i,
            /\/(\d+)\/?$/
        ]);
        var imdbId = extractExternalId('.b-post__info_rates.imdb a', [
            /(tt\d{5,10})/i
        ]);

        var mainTitle = parsedTitles.baseRu[0] || parsedTitles.cleanRuFull;
        var displayTitle = primaryYear ? (mainTitle + ' (' + primaryYear + ')') : mainTitle;

        return {
            postId: cdnPostId || extractPostIdFromDom(),
            category: category,
            isSeries: isSeries,
            isAnime: isAnime,
            isUpcomingTrailer: isUpcomingTrailer,
            season: detectedSeason || null,
            episode: cdnEpisode || null,
            title: displayTitle,
            cleanTitle: mainTitle,
            rawRuTitle: rawRuTitle,
            rawOrigTitle: rawOrigTitle || null,
            orig: parsedTitles.allOrig[0] || null,
            ruCandidates: parsedTitles.allRu,
            baseRuCandidates: parsedTitles.baseRu,
            seasonRuCandidates: parsedTitles.seasonRu,
            origCandidates: parsedTitles.allOrig,
            baseOrigCandidates: parsedTitles.baseOrig,
            englishCandidates: parsedTitles.englishOrig,
            seasonOrigCandidates: parsedTitles.seasonOrig,
            year: primaryYear ? String(primaryYear) : null,
            primaryYear: primaryYear || null,
            validYears: yearAndFranchise.validYears,
            conflictingYears: yearAndFranchise.conflictingYears,
            hasHomonym: yearAndFranchise.hasHomonym,
            homonymUrls: yearAndFranchise.homonymUrls,
            seriesFranchiseUrls: yearAndFranchise.seriesFranchiseUrls,
            kinopoisk: kpId || null,
            imdb: imdbId || null,
            tmdb: null,
            rtSlug: null,
            blacklistKp: [],
            blacklistImdb: []
        };
    }

    /**
     * Строгий анализ года релиза и таблицы франшизы (.b-post__partcontent).
     * Омонимами считаются ТОЛЬКО тайтлы со строго совпадающим названием (normCurrentTitle === normRowTitle)
     * и разницей в годах >= 2 (например, «Обитель зла» 2026 и «Обитель зла» 2002).
     * Сиквелы («Пипец 2» и «Пипец») имеют разные названия и НЕ считаются омонимами.
     */
    function analyzeYearsAndFranchise(ogYear, isSeries, currentBaseRuTitle) {
        var tableYear = null;
        var currentPartYear = null;
        var urlYear = null;

        var yearLink = document.querySelector('.b-post__info a[href*="/year/"]');
        if (yearLink) {
            var ym = (yearLink.getAttribute('href') || '').match(/\/year\/(\d{4})/) ||
                     (yearLink.textContent || '').match(/\b(19\d{2}|20\d{2})\b/);
            if (ym) tableYear = parseInt(ym[1], 10);
        }

        var currentPartRow = document.querySelector('.b-post__partcontent .b-post__partcontent_item.current .td.year');
        if (currentPartRow) {
            var cpm = (currentPartRow.textContent || '').match(/\b(19\d{2}|20\d{2})\b/);
            if (cpm) currentPartYear = parseInt(cpm[1], 10);
        }

        var pathYearMatch = location.pathname.match(/-((?:19|20)\d{2})(?:-latest)?\.html$/i);
        if (pathYearMatch) {
            urlYear = parseInt(pathYearMatch[1], 10);
        }

        var primaryYear = tableYear || currentPartYear || ogYear || urlYear || null;
        var validYears = [];
        var conflictingYears = [];
        var homonymUrls = [];
        var seriesFranchiseUrls = [];
        var hasHomonym = false;

        function addValidYear(y) {
            var n = parseInt(y, 10);
            if (n >= 1895 && n <= 2035 && validYears.indexOf(n) === -1) {
                validYears.push(n);
            }
        }

        if (primaryYear) addValidYear(primaryYear);
        if (ogYear && primaryYear && Math.abs(ogYear - primaryYear) <= 1) addValidYear(ogYear);
        if (urlYear && primaryYear && Math.abs(urlYear - primaryYear) <= 1) addValidYear(urlYear);

        var normCurrentTitle = normalizeForComparison(currentBaseRuTitle);

        var partRows = document.querySelectorAll('.b-post__partcontent .b-post__partcontent_item:not(.current)');
        for (var i = 0; i < partRows.length; i++) {
            var row = partRows[i];
            var dataUrl = row.getAttribute('data-url') || '';
            var titleEl = row.querySelector('.td.title');
            var yearEl = row.querySelector('.td.year');

            var rawRowTitle = titleEl ? (titleEl.textContent || '').trim() : '';
            var cleanRowBaseTitle = rawRowTitle
                .replace(/\[\s*(?:ТВ|TV|OVA|ONA)[^\]]*\]/gi, '')
                .replace(/\(\d{4}\)/g, '')
                .split('/')[0]
                .trim();
            var normRowTitle = normalizeForComparison(cleanRowBaseTitle);

            var rowYear = null;
            if (yearEl) {
                var rym = (yearEl.textContent || '').match(/\b(19\d{2}|20\d{2})\b/);
                if (rym) rowYear = parseInt(rym[1], 10);
            }

            // Строгое равенство названий (чтобы «Пипец 2» НЕ совпадал с «Пипец»)
            var isExactSameName = !!(normCurrentTitle && normRowTitle && normCurrentTitle === normRowTitle);
            var isRowSeriesUrl = /\/(series|animation)\//i.test(dataUrl);
            var hasExplicitSeasonTag = /\[\s*(?:ТВ|TV)\s*[-–—]?\s*\d+\s*\]/i.test(rawRowTitle);

            if (isSeries && isRowSeriesUrl && isExactSameName && hasExplicitSeasonTag) {
                // Другой сезон того же самого аниме/сериала (например, «Монолог фармацевта [ТВ-1]»)
                if (rowYear) addValidYear(rowYear);
                if (dataUrl && seriesFranchiseUrls.indexOf(dataUrl) === -1) {
                    seriesFranchiseUrls.push(dataUrl);
                }
            } else if (isExactSameName && primaryYear && rowYear && Math.abs(rowYear - primaryYear) >= 2) {
                // Полный тёзка (омоним) другого года (например, «Обитель зла» 2002 vs 2026)
                hasHomonym = true;
                if (conflictingYears.indexOf(rowYear) === -1) {
                    conflictingYears.push(rowYear);
                }
                if (dataUrl && homonymUrls.indexOf(dataUrl) === -1) {
                    homonymUrls.push(dataUrl);
                }
            }
        }

        return {
            primaryYear: primaryYear,
            validYears: validYears,
            conflictingYears: conflictingYears,
            hasHomonym: hasHomonym,
            homonymUrls: homonymUrls,
            seriesFranchiseUrls: seriesFranchiseUrls
        };
    }

    function buildTitleCandidates(rawRu, rawOrig, seasonNum) {
        function stripTags(str) {
            return String(str || '')
                .replace(/\[\s*(?:ТВ|TV|OVA|ONA|Special|Movie|Фильм|Сериал)[^\]]*\]/gi, ' ')
                .replace(/\(\s*(?:фильм|сериал|аниме|мультфильм|спешл|special|movie|tv|ova|ona|\d{4}(?:\s*[-–—]\s*(?:\d{4}|\.{3}))?)\s*\)/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function stripTrailingSeasonNumber(str, sNum) {
            var cleaned = stripTags(str);
            if (sNum && sNum > 1) {
                var re = new RegExp('(?:\\s+(?:season|сезон|part|часть))?\\s+' + sNum + '\\s*$', 'i');
                cleaned = cleaned.replace(re, '').trim();
            }
            cleaned = cleaned
                .replace(/\s+(?:season|сезон)\s+\d+\s*$/i, '')
                .replace(/\s+\d+\s+(?:season|сезон)\s*$/i, '')
                .trim();
            return cleaned;
        }

        function addUnique(arr, val) {
            var v = String(val || '').replace(/\s+/g, ' ').trim();
            if (v && v.length > 0 && arr.indexOf(v) === -1) {
                arr.push(v);
            }
        }

        var ruParts = String(rawRu || '').split(/\s+\/\s+|\s*\/\s*/);
        var baseRu = [];
        var seasonRu = [];
        var allRu = [];

        for (var i = 0; i < ruParts.length; i++) {
            var cleanPart = stripTags(ruParts[i]);
            if (!cleanPart) continue;
            var basePart = stripTrailingSeasonNumber(cleanPart, seasonNum);

            if (seasonNum && seasonNum > 1) {
                addUnique(seasonRu, basePart + ' ' + seasonNum);
            }
            addUnique(baseRu, basePart);
            addUnique(allRu, cleanPart);
            addUnique(allRu, basePart);
        }

        var origParts = String(rawOrig || '').split(/\s+\/\s+|\s*\/\s*/);
        var baseOrig = [];
        var seasonOrig = [];
        var englishOrig = [];
        var allOrig = [];

        var romajiRe = /\b(no|wa|ga|wo|ni|de|to|kara|made|tachi|monogatari|hitorigoto|kusuriya|shingeki|kimetsu|jujutsu|boku|watashi|ore|kami|mahou|isekai|tensei|sensou|densetsu)\b/i;

        var tempOrig = [];
        for (var j = 0; j < origParts.length; j++) {
            var op = stripTags(origParts[j]);
            if (!op) continue;
            var bp = stripTrailingSeasonNumber(op, seasonNum);
            var isLikelyEnglish = /[a-zA-Z]/.test(bp) && !romajiRe.test(bp);
            tempOrig.push({ full: op, base: bp, isEnglish: isLikelyEnglish });
        }

        for (var k = 0; k < tempOrig.length; k++) {
            if (tempOrig[k].isEnglish) {
                addUnique(englishOrig, tempOrig[k].base);
                addUnique(baseOrig, tempOrig[k].base);
                if (seasonNum && seasonNum > 1) {
                    addUnique(seasonOrig, tempOrig[k].base + ' ' + seasonNum);
                }
                addUnique(allOrig, tempOrig[k].base);
                addUnique(allOrig, tempOrig[k].full);
            }
        }
        for (var m = 0; m < tempOrig.length; m++) {
            if (!tempOrig[m].isEnglish) {
                addUnique(baseOrig, tempOrig[m].base);
                if (seasonNum && seasonNum > 1) {
                    addUnique(seasonOrig, tempOrig[m].base + ' ' + seasonNum);
                }
                addUnique(allOrig, tempOrig[m].base);
                addUnique(allOrig, tempOrig[m].full);
            }
        }

        return {
            cleanRuFull: stripTags(rawRu),
            baseRu: baseRu,
            seasonRu: seasonRu,
            allRu: allRu,
            baseOrig: baseOrig,
            englishOrig: englishOrig,
            seasonOrig: seasonOrig,
            allOrig: allOrig
        };
    }

    function extractExternalId(selector, patterns) {
        var link = document.querySelector(selector);
        if (!link) return null;
        var href = link.getAttribute('href') || '';
        if (!href) return null;

        var candidateUrls = [href];
        if (href.indexOf('/help/') !== -1) {
            try {
                var b64 = (href.split('/help/')[1] || '').split('/')[0];
                if (b64) {
                    var normB64 = decodeURIComponent(b64).replace(/-/g, '+').replace(/_/g, '/');
                    while (normB64.length % 4 !== 0) normB64 += '=';
                    var decoded = atob(normB64);
                    try {
                        decoded = decodeURIComponent(decoded);
                    } catch (e) {}
                    candidateUrls.unshift(decoded);
                }
            } catch (e) {}
        }

        for (var i = 0; i < candidateUrls.length; i++) {
            var u = candidateUrls[i];
            for (var j = 0; j < patterns.length; j++) {
                var m = u.match(patterns[j]);
                if (m && m[1]) return m[1];
            }
        }
        return null;
    }

    function extractPostIdFromDom() {
        var favHolder = document.querySelector('[data-post_id]');
        if (favHolder && favHolder.getAttribute('data-post_id')) {
            return favHolder.getAttribute('data-post_id');
        }
        var postInput = document.getElementById('post_id');
        if (postInput && postInput.value) return postInput.value;
        var m = location.pathname.match(/\/(\d+)-[^/]+\.html/);
        return m ? m[1] : null;
    }

    function resolveAndVerifyMediaMetadata(movie) {
        var step1SeriesFallback = Promise.resolve();

        if (movie.isSeries && !movie.kinopoisk && !movie.imdb && movie.season && movie.season > 1 && movie.seriesFranchiseUrls.length > 0) {
            var s1Url = movie.seriesFranchiseUrls[movie.seriesFranchiseUrls.length - 1];
            step1SeriesFallback = fetch(s1Url, { credentials: 'same-origin' })
                .then(function (r) { return r.ok ? r.text() : ''; })
                .then(function (html) {
                    if (!html) return;
                    var doc = new DOMParser().parseFromString(html, 'text/html');
                    var kpA = doc.querySelector('.b-post__info_rates.kp a');
                    if (kpA) {
                        var kp = extractIdFromAnchorNode(kpA, /kinopoisk\.ru\/(?:film|series)\/(\d+)/i);
                        if (kp) movie.kinopoisk = kp;
                    }
                    var imdbA = doc.querySelector('.b-post__info_rates.imdb a');
                    if (imdbA) {
                        var imdb = extractIdFromAnchorNode(imdbA, /(tt\d{5,10})/i);
                        if (imdb) movie.imdb = imdb;
                    }
                })
                .catch(function () {});
        }

        var step2HomonymBlacklist = Promise.resolve();
        if (movie.hasHomonym && movie.homonymUrls && movie.homonymUrls.length > 0) {
            var urlsToInspect = movie.homonymUrls.slice(0, 3);
            step2HomonymBlacklist = Promise.all(urlsToInspect.map(function (u) {
                return fetch(u, { credentials: 'same-origin' })
                    .then(function (r) { return r.ok ? r.text() : ''; })
                    .then(function (html) {
                        if (!html) return;
                        var doc = new DOMParser().parseFromString(html, 'text/html');
                        var kpA = doc.querySelector('.b-post__info_rates.kp a');
                        if (kpA) {
                            var badKp = extractIdFromAnchorNode(kpA, /kinopoisk\.ru\/(?:film|series)\/(\d+)/i);
                            if (badKp && badKp !== movie.kinopoisk && movie.blacklistKp.indexOf(badKp) === -1) {
                                movie.blacklistKp.push(badKp);
                            }
                        }
                        var imdbA = doc.querySelector('.b-post__info_rates.imdb a');
                        if (imdbA) {
                            var badImdb = extractIdFromAnchorNode(imdbA, /(tt\d{5,10})/i);
                            if (badImdb && badImdb !== movie.imdb && movie.blacklistImdb.indexOf(badImdb) === -1) {
                                movie.blacklistImdb.push(badImdb);
                            }
                        }
                    })
                    .catch(function () {});
            }));
        }

        return Promise.all([step1SeriesFallback, step2HomonymBlacklist])
            .then(function () {
                return enrichViaWikidata(movie);
            })
            .catch(function () {
                return movie;
            });
    }

    function extractIdFromAnchorNode(aNode, regex) {
        try {
            var href = aNode.getAttribute('href') || '';
            var b64 = (href.split('/help/')[1] || '').split('/')[0];
            if (!b64) return null;
            var decoded = decodeURIComponent(atob(decodeURIComponent(b64)));
            var m = decoded.match(regex);
            return m ? m[1] : null;
        } catch (e) {
            return null;
        }
    }

    function enrichViaWikidata(movie) {
        var cacheKey = (movie.imdb || '') + '|' + (movie.kinopoisk || '') + '|' + (movie.cleanTitle || '') + '|' + (movie.primaryYear || '');
        var cache = GM_getValue(WD_CACHE_KEY, {});
        var now = Date.now();

        for (var k in cache) {
            if (now - (cache[k].ts || 0) > 7 * 24 * 60 * 60 * 1000) delete cache[k];
        }

        if (cache[cacheKey] && cache[cacheKey].data) {
            applyWikidataEnrichment(movie, cache[cacheKey].data);
            return Promise.resolve(movie);
        }

        var sparqlPromise;
        if (movie.imdb || movie.kinopoisk) {
            var filterClauses = [];
            if (movie.imdb) filterClauses.push('{ ?item wdt:P345 "' + movie.imdb + '" . }');
            if (movie.kinopoisk) filterClauses.push('{ ?item wdt:P2603 "' + movie.kinopoisk + '" . }');

            var query =
                'SELECT ?item ?imdb ?kp ?tmdbMovie ?tmdbTv ?rt (MIN(YEAR(?pubDate)) AS ?minYear) (MAX(YEAR(?pubDate)) AS ?maxYear) ?enLabel ?ruLabel WHERE {\n' +
                '  ' + filterClauses.join(' UNION ') + '\n' +
                '  OPTIONAL { ?item wdt:P345 ?imdb . }\n' +
                '  OPTIONAL { ?item wdt:P2603 ?kp . }\n' +
                '  OPTIONAL { ?item wdt:P4947 ?tmdbMovie . }\n' +
                '  OPTIONAL { ?item wdt:P4983 ?tmdbTv . }\n' +
                '  OPTIONAL { ?item wdt:P1258 ?rt . }\n' +
                '  OPTIONAL { ?item wdt:P577 ?pubDate . }\n' +
                '  OPTIONAL { ?item rdfs:label ?enLabel . FILTER(LANG(?enLabel) = "en") }\n' +
                '  OPTIONAL { ?item rdfs:label ?ruLabel . FILTER(LANG(?ruLabel) = "ru") }\n' +
                '} GROUP BY ?item ?imdb ?kp ?tmdbMovie ?tmdbTv ?rt ?enLabel ?ruLabel LIMIT 5';

            sparqlPromise = gmFetchText(
                'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query),
                { 'Accept': 'application/sparql-results+json' }
            ).then(function (txt) {
                var json = JSON.parse(txt);
                var bindings = (json && json.results && json.results.bindings) || [];
                return parseWikidataBindings(bindings, movie);
            }).catch(function () { return null; });
        } else {
            sparqlPromise = searchWikidataByTitleAndYear(movie);
        }

        return sparqlPromise.then(function (wdData) {
            if (wdData) {
                cache[cacheKey] = { data: wdData, ts: Date.now() };
                GM_setValue(WD_CACHE_KEY, cache);
                applyWikidataEnrichment(movie, wdData);
            }
            return movie;
        });
    }

    function parseWikidataBindings(bindings, movie) {
        if (!bindings || !bindings.length) return null;

        var best = null;
        for (var i = 0; i < bindings.length; i++) {
            var b = bindings[i];
            var minYear = b.minYear && b.minYear.value ? parseInt(b.minYear.value, 10) : null;
            var maxYear = b.maxYear && b.maxYear.value ? parseInt(b.maxYear.value, 10) : null;
            var bImdb = b.imdb && b.imdb.value ? b.imdb.value : null;
            var bKp = b.kp && b.kp.value ? b.kp.value : null;

            if (!movie.isSeries && movie.primaryYear && minYear) {
                var diffMin = Math.abs(minYear - movie.primaryYear);
                var diffMax = maxYear ? Math.abs(maxYear - movie.primaryYear) : diffMin;
                if (Math.min(diffMin, diffMax) > 2) {
                    if (bKp && movie.blacklistKp.indexOf(bKp) === -1) movie.blacklistKp.push(bKp);
                    if (bImdb && movie.blacklistImdb.indexOf(bImdb) === -1) movie.blacklistImdb.push(bImdb);
                    continue;
                }
            }

            best = {
                imdb: bImdb,
                kinopoisk: bKp,
                tmdb: (movie.isSeries ? (b.tmdbTv && b.tmdbTv.value) : (b.tmdbMovie && b.tmdbMovie.value)) ||
                      (b.tmdbMovie && b.tmdbMovie.value) || (b.tmdbTv && b.tmdbTv.value) || null,
                rtSlug: b.rt && b.rt.value ? b.rt.value : null,
                enLabel: b.enLabel && b.enLabel.value ? b.enLabel.value : null,
                ruLabel: b.ruLabel && b.ruLabel.value ? b.ruLabel.value : null,
                year: minYear || maxYear || null
            };
            break;
        }
        return best;
    }

    function searchWikidataByTitleAndYear(movie) {
        if (!movie.primaryYear) return Promise.resolve(null);
        var searchTerm = (movie.englishCandidates && movie.englishCandidates[0]) ||
                         (movie.baseOrigCandidates && movie.baseOrigCandidates[0]) ||
                         (movie.baseRuCandidates && movie.baseRuCandidates[0]);
        if (!searchTerm) return Promise.resolve(null);

        var searchLang = /[а-яёА-ЯЁ]/.test(searchTerm) ? 'ru' : 'en';
        var apiUrl = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=' +
                     encodeURIComponent(searchTerm) + '&language=' + searchLang + '&limit=5&format=json&origin=*';

        return gmFetchText(apiUrl, { 'Accept': 'application/json' }).then(function (txt) {
            var data = JSON.parse(txt);
            var list = (data && data.search) || [];
            var qIds = [];
            for (var i = 0; i < list.length; i++) {
                if (list[i].id && /^Q\d+$/.test(list[i].id)) qIds.push('wd:' + list[i].id);
            }
            if (!qIds.length) return null;

            var sparql =
                'SELECT ?item ?imdb ?kp ?tmdbMovie ?tmdbTv ?rt (MIN(YEAR(?pubDate)) AS ?minYear) (MAX(YEAR(?pubDate)) AS ?maxYear) ?enLabel ?ruLabel WHERE {\n' +
                '  VALUES ?item { ' + qIds.join(' ') + ' }\n' +
                '  ?item wdt:P577 ?pubDate .\n' +
                '  OPTIONAL { ?item wdt:P345 ?imdb . }\n' +
                '  OPTIONAL { ?item wdt:P2603 ?kp . }\n' +
                '  OPTIONAL { ?item wdt:P4947 ?tmdbMovie . }\n' +
                '  OPTIONAL { ?item wdt:P4983 ?tmdbTv . }\n' +
                '  OPTIONAL { ?item wdt:P1258 ?rt . }\n' +
                '  OPTIONAL { ?item rdfs:label ?enLabel . FILTER(LANG(?enLabel) = "en") }\n' +
                '  OPTIONAL { ?item rdfs:label ?ruLabel . FILTER(LANG(?ruLabel) = "ru") }\n' +
                '} GROUP BY ?item ?imdb ?kp ?tmdbMovie ?tmdbTv ?rt ?enLabel ?ruLabel';

            return gmFetchText(
                'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(sparql),
                { 'Accept': 'application/sparql-results+json' }
            ).then(function (sTxt) {
                var sJson = JSON.parse(sTxt);
                var bindings = (sJson && sJson.results && sJson.results.bindings) || [];
                var filtered = bindings.filter(function (b) {
                    var y1 = b.minYear && b.minYear.value ? parseInt(b.minYear.value, 10) : 0;
                    var y2 = b.maxYear && b.maxYear.value ? parseInt(b.maxYear.value, 10) : y1;
                    if (!y1) return false;
                    for (var v = 0; v < movie.validYears.length; v++) {
                        var vy = movie.validYears[v];
                        if (Math.abs(y1 - vy) <= 1 || Math.abs(y2 - vy) <= 1) return true;
                    }
                    return false;
                });
                return parseWikidataBindings(filtered, movie);
            });
        }).catch(function () { return null; });
    }

    function applyWikidataEnrichment(movie, wd) {
        if (!wd) return;

        if (movie.kinopoisk && movie.blacklistKp.indexOf(movie.kinopoisk) !== -1) {
            movie.kinopoisk = null;
        }
        if (movie.imdb && movie.blacklistImdb.indexOf(movie.imdb) !== -1) {
            movie.imdb = null;
        }

        if (wd.kinopoisk && !movie.kinopoisk && movie.blacklistKp.indexOf(wd.kinopoisk) === -1) {
            movie.kinopoisk = wd.kinopoisk;
        }
        if (wd.imdb && !movie.imdb && movie.blacklistImdb.indexOf(wd.imdb) === -1) {
            movie.imdb = wd.imdb;
        }
        if (wd.tmdb && !movie.tmdb) {
            movie.tmdb = wd.tmdb;
        }
        if (wd.rtSlug && !movie.rtSlug) {
            movie.rtSlug = wd.rtSlug;
        }

        if (wd.enLabel) {
            var cleanEn = wd.enLabel.replace(/\s*\(\d{4}[^)]*\)\s*$/, '').trim();
            if (cleanEn && movie.englishCandidates.indexOf(cleanEn) === -1) {
                movie.englishCandidates.unshift(cleanEn);
            }
            if (cleanEn && movie.baseOrigCandidates.indexOf(cleanEn) === -1) {
                movie.baseOrigCandidates.unshift(cleanEn);
            }
        }
        if (wd.ruLabel) {
            var cleanRu = wd.ruLabel.replace(/\s*\(\d{4}[^)]*\)\s*$/, '').trim();
            if (cleanRu && movie.baseRuCandidates.indexOf(cleanRu) === -1) {
                movie.baseRuCandidates.push(cleanRu);
            }
        }
    }

    /* ═══ УСТАНОВКА ПЛЕЕРА И ИНТЕРФЕЙСА НА REZKA ═══ */

    function installRezkaPlayerUi(player) {
        var movie = extractRezkaMedia();
        if (!movie) return false;

        var playerBox = document.createElement('div');
        playerBox.className = 'r2t-player-box';

        var iframe = document.createElement('iframe');
        iframe.className = 'r2t-iframe';
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; fullscreen; encrypted-media';
        iframe.src = 'about:blank';
        playerBox.appendChild(iframe);

        player.parentNode.insertBefore(playerBox, player);

        var tabController = installTapeopTranslatorTab(player, playerBox, iframe);

        var nativeNodes = getNativePlayerNodes(player);
        for (var i = 0; i < nativeNodes.length; i++) {
            nativeNodes[i].classList.add('r2t-hidden');
        }

        installBottomActionsRow(movie, playerBox);

        window.addEventListener('message', function (ev) {
            if (!ev.data || ev.data.type !== 'r2t-no-players') return;
            if (tabController && tabController.tapeopTab) {
                tabController.tapeopTab.setAttribute('title', 'В базе TapeOp пока нет источников для этого релиза (' + (movie.year || '') + ')');
            }
        });

        resolveAndVerifyMediaMetadata(movie).then(function (verifiedMovie) {
            installRottenTomatoesRatings(verifiedMovie);
            launchTapeopIframe(iframe, verifiedMovie);
        });

        return true;
    }

    function launchTapeopIframe(iframe, movie) {
        var tabId = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 8);
        var now = Date.now();

        var store = GM_getValue(STORAGE_KEY, {});
        if (!store || typeof store !== 'object') store = {};
        for (var k in store) {
            if (now - (store[k].ts || 0) > 30 * 60 * 1000) delete store[k];
        }
        store[tabId] = { movie: movie, ts: now };
        store.latest = { movie: movie, ts: now };
        GM_setValue(STORAGE_KEY, store);

        var encodedPayload = '';
        try {
            encodedPayload = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(movie)))));
        } catch (e) {}

        iframe.src = 'https://tapeop.dev/#r2t=' + tabId + (encodedPayload ? ('&r2td=' + encodedPayload) : '');
    }

    /* ═══════════════════════════════════════════════════════════════════
     * ЧАСТЬ 2. СТОРОНА TAPEOP: ПОЛНЫЙ СБОР ВСЕХ 6+ ИСТОЧНИКОВ KINOBOX
     * ═══════════════════════════════════════════════════════════════════ */

    function initTapeopSide() {
        if (window.self === window.top) return;

        var movie = resolveMovieDataOnTapeop();
        if (!movie) return;

        try {
            window.name = 'r2t_cache:' + JSON.stringify(movie);
            if (location.hash && history.replaceState) {
                history.replaceState(null, '', location.pathname + location.search);
            }
        } catch (e) {}

        cleanTapeopEmbedUi();
        installTapeopPauseListener();
        injectKinoboxSmartSearch(movie);
    }

    function resolveMovieDataOnTapeop() {
        var hash = String(location.hash || '');

        var dataMatch = hash.match(/(?:[?#&]|^)r2td=([^&]+)/i);
        if (dataMatch && dataMatch[1]) {
            try {
                var jsonStr = decodeURIComponent(escape(atob(decodeURIComponent(dataMatch[1]))));
                var parsed = JSON.parse(jsonStr);
                if (parsed && parsed.title) return parsed;
            } catch (e) {}
        }

        var store = GM_getValue(STORAGE_KEY, null);
        var idMatch = hash.match(/(?:[?#&]|^)r2t=([a-z0-9_]+)/i);
        if (store && idMatch && store[idMatch[1]] && store[idMatch[1]].movie) {
            return store[idMatch[1]].movie;
        }

        try {
            if (window.name && window.name.indexOf('r2t_cache:') === 0) {
                var cached = JSON.parse(window.name.slice('r2t_cache:'.length));
                if (cached && cached.title) return cached;
            }
        } catch (e) {}

        if (store && store.latest && store.latest.movie && (Date.now() - (store.latest.ts || 0) < 30 * 60 * 1000)) {
            return store.latest.movie;
        }

        return null;
    }

    function installTapeopPauseListener() {
        window.addEventListener('message', function (ev) {
            if (!ev.data || ev.data.type !== 'r2t-pause') return;
            var videos = document.querySelectorAll('video');
            for (var i = 0; i < videos.length; i++) videos[i].pause();
            var frames = document.querySelectorAll('iframe');
            for (var j = 0; j < frames.length; j++) {
                try {
                    frames[j].contentWindow.postMessage(JSON.stringify({ api: 'pause', method: 'pause' }), '*');
                    frames[j].contentWindow.postMessage({
                        api: 'pause',
                        method: 'pause',
                        key: 'kodik_player_api',
                        value: { method: 'pause' }
                    }, '*');
                } catch (e) {}
            }
        });
    }

    /**
     * Запрашивает все источники Kinobox (Alloha, Gencit, Kodik, Veoveo, Videoseed, Collaps, Turbo),
     * передавая комбинированный набор { kinopoisk, imdb, tmdb, title }, и защищает от фильмов-тёзок других лет.
     */
    function injectKinoboxSmartSearch(movie) {
        var movieLit = JSON.stringify(JSON.stringify(movie));
        var verLit = JSON.stringify(TAPEOP_PROTOCOL_VERSION);

        var code =
            '(function(){' +
            'var D = JSON.parse(' + movieLit + ');' +
            'var V = ' + verLit + ';' +
            'var origFetch = window.fetch.bind(window);' +

            'function buildApiUrl(params) {' +
            '  var u = new URL("https://api.kinobox.tv/api/players");' +
            '  for (var k in params) {' +
            '    if (params[k] !== undefined && params[k] !== null && String(params[k]).trim() !== "") {' +
            '      u.searchParams.set(k, String(params[k]).trim());' +
            '    }' +
            '  }' +
            '  return u.toString();' +
            '}' +

            /* Полный URL вместе с query-параметрами (без обрезки '?'), чтобы никогда не блокировать домены Alloha/Veoveo/Gencit/Kodik */
            'function getFullUrlKey(urlStr) {' +
            '  return String(urlStr || "").replace(/^https?:/i, "").trim();' +
            '}' +

            'function isPlayerValidForTarget(player, isTitleOnlyQuery, blacklistedExactUrls) {' +
            '  if (!player || !player.iframeUrl) return false;' +
            '  var rawUrl = String(player.iframeUrl);' +
            '  var lowerUrl = rawUrl.toLowerCase();' +

            /* 1. Точное совпадение полного URL с плеером старого фильма-тёзки */
            '  if (blacklistedExactUrls && blacklistedExactUrls[getFullUrlKey(rawUrl)]) return false;' +

            /* 2. Проверка вшитых ID из чёрного списка омонимов */
            '  var badKp = D.blacklistKp || [];' +
            '  for (var i = 0; i < badKp.length; i++) {' +
            '    var bkp = String(badKp[i]);' +
            '    if (bkp && new RegExp("(?:kp|kinopoisk|id)[=/_-]" + bkp + "(?:\\\\D|$)", "i").test(rawUrl)) return false;' +
            '  }' +
            '  var badImdb = D.blacklistImdb || [];' +
            '  for (var j = 0; j < badImdb.length; j++) {' +
            '    var bimdb = String(badImdb[j]).toLowerCase();' +
            '    if (bimdb && lowerUrl.indexOf(bimdb) !== -1) return false;' +
            '  }' +

            /* 3. Для чисто текстовых запросов (без ID) проверяем соответствие типа (сериал / фильм) */
            '  if (isTitleOnlyQuery) {' +
            '    var isSerialUrl = /\\/(serial|season|seria|tv|show)\\//i.test(lowerUrl);' +
            '    var isMovieUrl = /\\/(film|movie)\\//i.test(lowerUrl);' +
            '    if (D.isSeries && isMovieUrl && !isSerialUrl) return false;' +
            '    if (!D.isSeries && isSerialUrl && !isMovieUrl) return false;' +
            '  }' +

            '  return true;' +
            '}' +

            /* Объединяет плееры по имени балансера (source: Alloha, Gencit, Kodik, Veoveo, Videoseed, Collaps, Turbo) */
            'function mergePlayers(targetList, seenSources, newItems, isTitleOnlyQuery, blacklistedExactUrls) {' +
            '  if (!Array.isArray(newItems)) return;' +
            '  for (var i = 0; i < newItems.length; i++) {' +
            '    var item = newItems[i];' +
            '    if (!isPlayerValidForTarget(item, isTitleOnlyQuery, blacklistedExactUrls)) continue;' +
            '    var sourceKey = String(item.source || item.iframeUrl || i).toLowerCase().trim();' +
            '    if (!seenSources[sourceKey]) {' +
            '      seenSources[sourceKey] = true;' +
            '      targetList.push(item);' +
            '    }' +
            '  }' +
            '}' +

            'function hasBalancer(list, namePart) {' +
            '  for (var i = 0; i < list.length; i++) {' +
            '    var s = String(list[i].source || list[i].iframeUrl || "").toLowerCase();' +
            '    if (s.indexOf(namePart) !== -1) return true;' +
            '  }' +
            '  return false;' +
            '}' +

            'async function queryKinobox(params) {' +
            '  try {' +
            '    var res = await origFetch(buildApiUrl(params));' +
            '    if (!res.ok) return [];' +
            '    var json = await res.json();' +
            '    return (json && Array.isArray(json.data)) ? json.data : [];' +
            '  } catch (e) {' +
            '    return [];' +
            '  }' +
            '}' +

            /* Загружает точные полные URL только когда реально обнаружен фильм-тёзка другого года (D.hasHomonym === true) */
            'async function loadBlacklistedExactUrls() {' +
            '  var map = {};' +
            '  if (!D.hasHomonym) return map;' +
            '  var tasks = [];' +
            '  (D.blacklistKp || []).slice(0, 2).forEach(function(kp) {' +
            '    tasks.push(queryKinobox({ kinopoisk: kp, title: D.cleanTitle }));' +
            '  });' +
            '  (D.blacklistImdb || []).slice(0, 2).forEach(function(imdb) {' +
            '    tasks.push(queryKinobox({ imdb: imdb, title: D.cleanTitle }));' +
            '  });' +
            '  if (!tasks.length) return map;' +
            '  var results = await Promise.all(tasks);' +
            '  for (var i = 0; i < results.length; i++) {' +
            '    var arr = results[i] || [];' +
            '    for (var j = 0; j < arr.length; j++) {' +
            '      if (arr[j] && arr[j].iframeUrl) {' +
            '        map[getFullUrlKey(arr[j].iframeUrl)] = true;' +
            '      }' +
            '    }' +
            '  }' +
            '  return map;' +
            '}' +

            'function showNoSourcesNotice() {' +
            '  try {' +
            '    window.parent.postMessage({ type: "r2t-no-players" }, "*");' +
            '  } catch (e) {}' +
            '  if (document.getElementById("r2t-empty-notice")) return;' +
            '  var box = document.createElement("div");' +
            '  box.id = "r2t-empty-notice";' +
            '  box.style.cssText = "position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0d1317;color:#cfd8dc;font-family:Arial,sans-serif;text-align:center;padding:24px;box-sizing:border-box;";' +
            '  box.innerHTML = "<div style=\\"font-size:16px;font-weight:bold;color:#fff;margin-bottom:8px;\\">Источники для «" + (D.title || D.cleanTitle) + "» в базе TapeOp пока отсутствуют</div>" +' +
            '                  "<div style=\\"font-size:13px;color:#8fa1ab;max-width:480px;line-height:1.45;\\">Релиз ещё не появился у балансеров под своим ID (" + (D.imdb || D.kinopoisk || D.year || "новый релиз") + "). Одноимённые старые фильмы других лет заблокированы защитой от подмены.</div>";' +
            '  (document.body || document.documentElement).appendChild(box);' +
            '}' +

            'async function resolveBestPlayers() {' +
            '  var merged = [];' +
            '  var seenSources = {};' +
            '  var blacklistedExactUrls = await loadBlacklistedExactUrls();' +
            '  var tClean = D.cleanTitle || D.title;' +
            '  var tOrig = (D.englishCandidates && D.englishCandidates[0]) || (D.baseOrigCandidates && D.baseOrigCandidates[0]) || D.orig || null;' +
            '  var hasAuthoritativeId = !!(D.kinopoisk || D.imdb || D.tmdb);' +

            /* ЭТАП 1: Комбинированные запросы со всеми известными ID + названием (чтобы работали ВСЕ 6+ балансеров:
             * Alloha, Gencit, Kodik, Veoveo, Videoseed, Collaps, Turbo) */
            '  var combinedQueries = [];' +
            '  if (D.kinopoisk && D.imdb) {' +
            '    combinedQueries.push({ kinopoisk: D.kinopoisk, imdb: D.imdb, tmdb: D.tmdb, title: tClean });' +
            '    if (tOrig && tOrig !== tClean) {' +
            '      combinedQueries.push({ kinopoisk: D.kinopoisk, imdb: D.imdb, tmdb: D.tmdb, title: tOrig });' +
            '    }' +
            '  } else if (D.kinopoisk) {' +
            '    combinedQueries.push({ kinopoisk: D.kinopoisk, tmdb: D.tmdb, title: tClean });' +
            '    if (tOrig && tOrig !== tClean) {' +
            '      combinedQueries.push({ kinopoisk: D.kinopoisk, tmdb: D.tmdb, title: tOrig });' +
            '    }' +
            '  } else if (D.imdb) {' +
            /* Если есть фильм-тёзка другого года (как «Обитель зла» 2026 без КП ID), сначала запрашиваем чистый IMDb без старого названия */
            '    if (D.hasHomonym || D.isUpcomingTrailer) {' +
            '      combinedQueries.push({ imdb: D.imdb, tmdb: D.tmdb });' +
            '    } else {' +
            '      combinedQueries.push({ imdb: D.imdb, tmdb: D.tmdb, title: tClean });' +
            '      if (tOrig && tOrig !== tClean) {' +
            '        combinedQueries.push({ imdb: D.imdb, tmdb: D.tmdb, title: tOrig });' +
            '      }' +
            '    }' +
            '  } else if (D.tmdb) {' +
            '    combinedQueries.push({ tmdb: D.tmdb, title: tClean });' +
            '  }' +

            '  for (var i = 0; i < combinedQueries.length; i++) {' +
            '    var items = await queryKinobox(combinedQueries[i]);' +
            '    mergePlayers(merged, seenSources, items, false, blacklistedExactUrls);' +
            /* Если первый же комбинированный запрос вернул полный набор (>= 5 источников), второй запрос по tOrig не нужен */
            '    if (merged.length >= 5 && (!D.isAnime || hasBalancer(merged, "kodik"))) break;' +
            '  }' +

            /* ЭТАП 2: Для многосезонных аниме ([ТВ-2], [ТВ-3]) добираем Kodik/Gencit по сезонному названию, если их не было */
            '  if (D.isAnime && D.season && D.season > 1 && !hasBalancer(merged, "kodik")) {' +
            '    var seasonTitles = [].concat(D.seasonOrigCandidates || [], D.seasonRuCandidates || []);' +
            '    for (var s = 0; s < seasonTitles.length; s++) {' +
            '      var sItems = await queryKinobox({ title: seasonTitles[s] });' +
            '      mergePlayers(merged, seenSources, sItems, true, blacklistedExactUrls);' +
            '      if (hasBalancer(merged, "kodik")) break;' +
            '    }' +
            '  }' +

            '  if (merged.length > 0) return merged;' +

            /* ЗАЩИТА ОТ ПОДМЕНЫ ФИЛЬМОВ-ТЁЗОК:
             * Если у фильма есть точный ID (например, tt35538033 у «Обители зла» 2026) или есть фильм-тёзка 2002 года,
             * но по ID вернулось 0 плееров — НЕ ищем по голому названию без ID! */
            '  if (hasAuthoritativeId || D.isUpcomingTrailer || D.hasHomonym) {' +
            '    showNoSourcesNotice();' +
            '    return [];' +
            '  }' +

            /* ЭТАП 3: Поиск по названиям (только если на странице Rezka вообще не было ни КП, ни IMDb ID и нет омонимов) */
            '  var titleQueue = [];' +
            '  function addCandidate(t) {' +
            '    var c = String(t || "").trim();' +
            '    if (c && titleQueue.indexOf(c) === -1) titleQueue.push(c);' +
            '  }' +
            '  if (D.season && D.season > 1) {' +
            '    (D.seasonOrigCandidates || []).forEach(addCandidate);' +
            '    (D.seasonRuCandidates || []).forEach(addCandidate);' +
            '  }' +
            '  (D.englishCandidates || []).forEach(addCandidate);' +
            '  (D.baseOrigCandidates || []).forEach(addCandidate);' +
            '  (D.baseRuCandidates || []).forEach(addCandidate);' +

            '  for (var tIdx = 0; tIdx < titleQueue.length; tIdx++) {' +
            '    var tItems = await queryKinobox({ title: titleQueue[tIdx] });' +
            '    mergePlayers(merged, seenSources, tItems, true, blacklistedExactUrls);' +
            '    if (merged.length >= 5) break;' +
            '  }' +

            '  if (merged.length === 0) showNoSourcesNotice();' +
            '  return merged;' +
            '}' +

            'var cachedPromise = null;' +
            'window.fetch = function(input, init) {' +
            '  var urlStr = (input && input.url) ? input.url : String(input);' +
            '  if (urlStr.indexOf("api.kinobox.tv/api/players") === -1) {' +
            '    return origFetch(input, init);' +
            '  }' +
            '  if (!cachedPromise) {' +
            '    cachedPromise = resolveBestPlayers();' +
            '  }' +
            '  return cachedPromise.then(function(players) {' +
            '    return new Response(JSON.stringify({ data: players }), {' +
            '      status: 200,' +
            '      headers: { "Content-Type": "application/json" }' +
            '    });' +
            '  });' +
            '};' +

            'var startTs = Date.now();' +
            'var timer = setInterval(function() {' +
            '  if (typeof globalThis.init === "function") {' +
            '    clearInterval(timer);' +
            '    globalThis.init(D, V);' +
            '  } else if (Date.now() - startTs > 20000) {' +
            '    clearInterval(timer);' +
            '  }' +
            '}, 80);' +
            '})();';

        injectPageScript(code);
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
                        if (sib !== el && sib.id !== 'r2t-empty-notice' && sib.tagName !== 'SCRIPT' && sib.tagName !== 'STYLE') {
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

        onDomReady(function () {
            fitPlayer();
            var obs = new MutationObserver(fitPlayer);
            obs.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(function () { obs.disconnect(); }, 15000);
        });
    }

    /* ═══════════════════════════════════════════════════════════════════
     * ЧАСТЬ 3. ROTTEN TOMATOES (С ЖЁСТКОЙ ПРОВЕРКОЙ ГОДА И ЛОКАЛИЗАЦИЙ)
     * ═══════════════════════════════════════════════════════════════════ */

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

        var existingHolder = document.getElementById('r2t-rt-holder');
        if (existingHolder) existingHolder.remove();

        var holder = document.createElement('div');
        holder.id = 'r2t-rt-holder';
        ratesCell.insertBefore(holder, ratesCell.firstChild);

        var cacheKey = (movie.imdb || movie.kinopoisk || movie.cleanTitle || '') + '_' + (movie.primaryYear || '');
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

        holder.innerHTML =
            buildRow('Tomatometer', data.tomatometer, data.tomatometerCount) +
            buildRow('Popcornmeter', data.popcornmeter, data.popcornmeterCount);
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
        if (movie.rtSlug) {
            var exactUrl = 'https://www.rottentomatoes.com/' + movie.rtSlug.replace(/^\/+/, '');
            return gmFetchText(exactUrl).then(function (html) {
                var parsed = parseRtPageHtml(html, exactUrl);
                if (parsed) return parsed;
                return searchRtByCandidates(movie);
            }).catch(function () {
                return searchRtByCandidates(movie);
            });
        }
        return searchRtByCandidates(movie);
    }

    function searchRtByCandidates(movie) {
        var queries = [];
        function addQ(q) {
            var s = String(q || '').trim();
            if (s && queries.indexOf(s) === -1) queries.push(s);
        }

        (movie.englishCandidates || []).forEach(addQ);
        (movie.baseOrigCandidates || []).forEach(addQ);
        (movie.origCandidates || []).forEach(addQ);
        if (!queries.length) {
            (movie.baseRuCandidates || []).forEach(addQ);
        }

        function tryNextQuery(idx) {
            if (idx >= queries.length) return Promise.resolve(null);
            var q = queries[idx];
            var searchUrl = 'https://www.rottentomatoes.com/search?search=' + encodeURIComponent(q);
            return gmFetchText(searchUrl).then(function (html) {
                var bestUrl = pickBestRtSearchResult(html, q, movie);
                if (!bestUrl) return tryNextQuery(idx + 1);
                return gmFetchText(bestUrl).then(function (pageHtml) {
                    var parsed = parseRtPageHtml(pageHtml, bestUrl);
                    return parsed || tryNextQuery(idx + 1);
                }).catch(function () {
                    return tryNextQuery(idx + 1);
                });
            }).catch(function () {
                return tryNextQuery(idx + 1);
            });
        }

        return tryNextQuery(0);
    }

    function pickBestRtSearchResult(html, query, movie) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var rows = doc.querySelectorAll('search-page-media-row');
        var validYears = movie.validYears || (movie.primaryYear ? [movie.primaryYear] : []);
        var conflictingYears = movie.conflictingYears || [];

        var allKnownTitles = []
            .concat(movie.englishCandidates || [])
            .concat(movie.baseOrigCandidates || [])
            .concat(movie.origCandidates || [])
            .concat([query])
            .map(normalizeForComparison)
            .filter(Boolean);

        var best = null;
        var bestScore = -999;

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var a = row.querySelector('a[data-qa="info-name"], a[slot="title"], a[href*="/m/"], a[href*="/tv/"]');
            if (!a) continue;
            var href = a.getAttribute('href') || '';
            if (!href) continue;
            if (href.indexOf('http') !== 0) href = 'https://www.rottentomatoes.com' + href;

            var name = normalizeForComparison(a.textContent || '');
            if (!name) continue;

            var titleScore = 0;
            for (var t = 0; t < allKnownTitles.length; t++) {
                var candidate = allKnownTitles[t];
                if (name === candidate) {
                    titleScore = Math.max(titleScore, 60);
                } else if (name.length >= 4 && candidate.length >= 4 && (name.indexOf(candidate) !== -1 || candidate.indexOf(name) !== -1)) {
                    titleScore = Math.max(titleScore, 30);
                }
            }
            if (titleScore === 0) continue;

            var rYear = parseInt(row.getAttribute('release-year') || row.getAttribute('start-year') || '0', 10);
            var isTvUrl = href.indexOf('/tv/') !== -1;

            if (movie.isSeries !== isTvUrl) continue;

            var yearScore = 0;
            if (rYear) {
                if (conflictingYears.indexOf(rYear) !== -1) continue;
                if (validYears.length > 0) {
                    var minDiff = 999;
                    for (var y = 0; y < validYears.length; y++) {
                        var diff = Math.abs(rYear - validYears[y]);
                        if (diff < minDiff) minDiff = diff;
                    }
                    if (minDiff > 2) continue;
                    yearScore = (minDiff === 0) ? 45 : (minDiff === 1 ? 30 : 10);
                }
            } else if (movie.hasHomonym) {
                continue;
            }

            var score = titleScore + yearScore + 25;
            if (row.getAttribute('tomatometerscore')) score += 5;

            if (score > bestScore) {
                bestScore = score;
                best = href;
            }
        }

        return bestScore >= 70 ? best : null;
    }

    function normalizeForComparison(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
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

    /* ═══════════════════════════════════════════════════════════════════
     * ЧАСТЬ 4. СТИЛИ, ШАПКА, КНОПКИ ОЗВУЧЕК И «ПОСМОТРЕТЬ ПОЗЖЕ»
     * ═══════════════════════════════════════════════════════════════════ */

    function injectRezkaStyles() {
        if (document.getElementById('r2t-styles')) return;
        var st = document.createElement('style');
        st.id = 'r2t-styles';
        st.textContent =
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
            '#r2t-rt-holder{display:block !important;float:none !important;clear:both !important;margin:0 !important;padding:0 !important;}' +
            'html body .b-post__info_rates{display:block !important;float:none !important;clear:both !important;margin:0 0 4px 0 !important;padding:0 !important;}' +
            'html body td > .b-post__info_rates:last-child{margin-bottom:0 !important;}' +
            '.r2t-hidden{display:none !important;}' +
            '.r2t-player-box{width:100%;background:#000;position:relative;margin:0 0 20px 0;clear:both;}' +
            '.r2t-iframe{width:100%;height:460px;border:0;display:block;background:#000;}' +
            'html body .b-translators__block{width:100% !important;box-sizing:border-box !important;padding:12px 0 6px 0 !important;margin:0 !important;background:transparent !important;border:0 !important;}' +
            'html body .b-translators__title{margin:0 0 8px 0 !important;padding:0 !important;font-family:Arial,sans-serif !important;font-size:15px !important;font-weight:bold !important;}' +
            'html body .b-translators__list{display:flex !important;flex-wrap:wrap !important;gap:2px !important;width:100% !important;margin:0 !important;padding:0 !important;list-style:none !important;background:transparent !important;box-sizing:border-box !important;}' +
            'html body .b-translators__list::before,html body .b-translators__list::after{display:none !important;content:none !important;}' +
            'html body .b-translators__list .b-translator__item{flex:1 1 calc(33.333% - 2px) !important;max-width:none !important;min-width:160px !important;}' +
            'html body .r2t-actions-row{display:grid !important;grid-template-columns:repeat(3,minmax(0,1fr)) !important;gap:2px !important;width:100% !important;margin:14px 0 20px 0 !important;padding:0 !important;clear:both !important;box-sizing:border-box !important;background:transparent !important;overflow:visible !important;}' +
            'html body .r2t-actions-row::before,html body .r2t-actions-row::after{display:none !important;content:none !important;}' +
            'html body .r2t-actions-col{width:100% !important;min-width:0 !important;max-width:none !important;margin:0 !important;padding:0 !important;float:none !important;position:relative !important;display:flex !important;align-items:stretch !important;box-sizing:border-box !important;background:transparent !important;overflow:visible !important;}' +
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
            'html body .b-translators__list .b-translator__item:hover,' +
            'html body .r2t-action-item:hover{' +
                'background:#d0d6dc !important;color:#000 !important;' +
            '}' +
            'html body.b-theme__template__night .b-translators__list .b-translator__item:hover,' +
            'html body.b-theme__template__night .r2t-action-item:hover{' +
                'background:#384147 !important;color:#fff !important;' +
            '}' +
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
            '<a href="/?filter=watching&genre=1">фильмы</a>, ' +
            '<a href="/?filter=watching&genre=2">сериалы</a>, ' +
            '<a href="/?filter=watching&genre=3">мультфильмы</a>';

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

        var existingTapeop = translatorsList.querySelector('.r2t-translator-item');
        if (existingTapeop) existingTapeop.remove();

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
            var targetItem = clickedItem || translatorsList.querySelector('.b-translator__item:not(.r2t-translator-item)');
            if (targetItem) {
                var items = translatorsList.querySelectorAll('.b-translator__item');
                for (var j = 0; j < items.length; j++) {
                    if (items[j] !== targetItem) items[j].classList.remove('active');
                }
                targetItem.classList.add('active');
                if (targetItem.getAttribute('data-translator_id')) {
                    translatorsList.setAttribute('data-r2t-default-tr', targetItem.getAttribute('data-translator_id'));
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

        return {
            tapeopTab: tapeopTab,
            activateTapeopMode: activateTapeopMode,
            activateRezkaMode: activateRezkaMode
        };
    }

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

        var reviewsBtn = document.getElementById('comments-list-button');
        var favBtn = document.querySelector('.b-sideactions__fav button.add-favorite, .b-sideactions__fav a.add-favorite');

        if (!reviewsBtn || !favBtn) {
            var all = document.querySelectorAll('a, button, div, span');
            for (var i = 0; i < all.length; i++) {
                var el = all[i];
                if (el.offsetParent === null) continue;
                var txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (!txt || txt.length > 70) continue;

                if (!reviewsBtn && reviewsRe.test(txt)) {
                    reviewsBtn = el;
                } else if (!favBtn && favRe.test(txt)) {
                    favBtn = el;
                }
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
        var existingLater = document.querySelector('.r2t-later-btn');
        if (existingLater && existingLater.parentElement && existingLater.parentElement.classList.contains('r2t-actions-col')) {
            existingLater.parentElement.remove();
        }

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
        var postId = extractPostIdFromDom();
        var translatorId = null;
        var season = isSeries ? 1 : 0;
        var episode = isSeries ? 1 : 0;

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

    function onDomReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    function injectPageScript(code) {
        var s = document.createElement('script');
        s.textContent = code;
        (document.head || document.documentElement).appendChild(s);
        s.remove();
    }
})();
