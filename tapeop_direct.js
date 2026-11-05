(function () {
    'use strict';

    if (window.plugin_tapeop_direct_ready) return;
    window.plugin_tapeop_direct_ready = true;

    // Публичный токен из вашей ссылки
    var ALLOHA_TOKEN = '48ac5259825fb8f20103dac69a9029';

    function openIframeOverlay(iframeUrl) {
        var prevController = Lampa.Controller.enabled().name;

        var overlay = $(
            '<div id="tapeop-player-overlay" style="position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;background:#000;">' +
                '<iframe src="' + iframeUrl + '" style="width:100%;height:100%;border:none;" allowfullscreen allow="autoplay; fullscreen"></iframe>' +
            '</div>'
        );

        $('body').append(overlay);

        Lampa.Controller.add('tapeop_iframe_ctrl', {
            toggle: function () {
                Lampa.Controller.clear();
            },
            back: function () {
                overlay.remove();
                Lampa.Controller.toggle(prevController || 'content');
            }
        });

        Lampa.Controller.toggle('tapeop_iframe_ctrl');
    }

    function fetchAndPlay(movie) {
        var network = new Lampa.Reguest();
        var query = '';

        if (movie.kinopoisk_id) {
            query = '&kp=' + encodeURIComponent(movie.kinopoisk_id);
        } else if (movie.imdb_id) {
            query = '&imdb=' + encodeURIComponent(movie.imdb_id);
        } else if (movie.id) {
            query = '&tmdb=' + encodeURIComponent(movie.id);
        }

        if (!query) {
            Lampa.Noty.show('Не найден ID фильма (KP / IMDb / TMDB)');
            return;
        }

        var apiUrl = 'https://api.alloha.tv/?token=' + ALLOHA_TOKEN + query;

        Lampa.Loading.start(function () {
            network.clear();
            Lampa.Loading.stop();
        });

        network.silent(apiUrl, function (json) {
            Lampa.Loading.stop();
            if (json && json.status === 'success' && json.data && json.data.iframe) {
                openIframeOverlay(json.data.iframe);
            } else {
                Lampa.Noty.show('Фильм не найден в базе балансера');
            }
        }, function () {
            Lampa.Loading.stop();
            Lampa.Noty.show('Ошибка запроса к API балансера');
        });
    }

    Lampa.Listener.follow('full', function (e) {
        if (e.type === 'complite') {
            var render = e.object.activity.render();
            if (render.find('.view--tapeop-direct').length) return;

            var btn = $(
                '<div class="full-start__button selector view--tapeop-direct">' +
                    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                        '<polygon points="5 3 19 12 5 21 5 3"></polygon>' +
                    '</svg>' +
                    '<span>TapeOp (Alloha)</span>' +
                '</div>'
            );

            btn.on('hover:enter', function () {
                fetchAndPlay(e.data.movie);
            });

            render.find('.full-start-new__buttons, .full-start__buttons').eq(0).append(btn);
        }
    });
})();
