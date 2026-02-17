export class YouTubeService {
    constructor(dom) {
        this.player = null;
        this.isReady = false;
        this.playerReady = false;
        this.dom = dom;
        this.loadYouTubeAPI();
    }

    loadYouTubeAPI() {
        if (window.YT) {
            this.isReady = true;
            return;
        }

        // Определяем callback для YouTube API
        window.onYouTubeIframeAPIReady = () => {
            console.log('YouTube API Ready');
            this.isReady = true;
        };

        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    getVideoId(url) {
        if (!url) return false;
        // Проверяем YouTube Shorts
        const shortsRegExp = /^.*youtube\.com\/shorts\/([^#&?]*).*/;
        const shortsMatch = url.match(shortsRegExp);
        if (shortsMatch && shortsMatch[1].length === 11) {
            return shortsMatch[1];
        }

        // Проверяем обычные YouTube URL
        const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[7].length === 11) ? match[7] : false;
    }

    async getVideoCoverUrl(videoId) {
        // Функция для проверки размеров изображения
        const checkImage = (url) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    // Проверяем, что изображение не является заглушкой
                    // YouTube возвращает заглушку 120x90 для недоступных размеров
                    if (img.width === 120 && img.height === 90) {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                };
                img.onerror = () => resolve(false);
                img.src = url;
            });
        };

        const qualities = [
            'maxresdefault.jpg',
            'sddefault.jpg',
            'hqdefault.jpg',
            'mqdefault.jpg',
            'default.jpg'
        ];

        // Проверяем каждое качество и возвращаем первое доступное
        for (const quality of qualities) {
            const url = `https://img.youtube.com/vi/${videoId}/${quality}`;
            if (await checkImage(url)) {
                return url;
            }
        }

        // Если ни одно изображение не подходит, используем hqdefault
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }

    async getVideoDetails(videoId) {
        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            if (!response.ok) return null;
            const data = await response.json();
            return {
                title: data.title,
                author: data.author_name
            };
        } catch (error) {
            console.warn('Error fetching video details:', error);
            return null;
        }
    }

    getVideoData() {
        if (!this.player || !this.playerReady) return null;
        try {
            const playerData = this.player.getVideoData();
            const playerInfo = (typeof this.player.getPlayerResponse === 'function') ? this.player.getPlayerResponse() : null;

            return {
                title: playerData?.title || 'YouTube Video',
                author: playerInfo?.videoDetails?.author ||
                    playerInfo?.videoDetails?.channelName ||
                    playerData?.author ||
                    'Unknown Artist'
            };
        } catch (e) {
            return null;
        }
    }

    async isVideoEmbeddable(videoId) {
        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            // Даже если oembed не доступен, мы пробуем загрузить видео (оно может быть встраиваемым)
            return true;
        } catch (error) {
            return true;
        }
    }

    createPlayer(elementId, videoId, onReady, onStateChange) {
        const tryCreatePlayer = async () => {
            if (!this.isReady) {
                console.log('Waiting for YouTube API to be ready...');
                setTimeout(() => tryCreatePlayer(), 100);
                return;
            }

            // Очистка предыдущего плеера для предотвращения конфликтов origin
            if (this.player && typeof this.player.destroy === 'function') {
                try {
                    console.log('Destroying existing YouTube player...');
                    this.player.destroy();
                } catch (e) {
                    console.warn('Error destroying player:', e);
                }
                this.player = null;
                this.playerReady = false;
            }

            // Убеждаемся, что целевой элемент существует
            let targetEl = document.getElementById(elementId);
            if (!targetEl) {
                console.log('Recreating player element:', elementId);
                targetEl = document.createElement('div');
                targetEl.id = elementId;
                const container = document.querySelector('.container') || document.body;
                container.appendChild(targetEl);
            }

            try {
                const detailsPromise = this.getVideoDetails(videoId);

                console.log('Creating YouTube player for:', videoId);
                this.player = new YT.Player(elementId, {
                    videoId: videoId,
                    height: '1', // Размер '1' критичен для предотвращения ошибок postMessage на Vercel
                    width: '1',
                    playerVars: {
                        enablejsapi: 1,
                        // origin: window.location.origin, // Пропуск origin может решить mismatch на Vercel
                        controls: 0,
                        modestbranding: 1,
                        playsinline: 1,
                        autoplay: 1
                    },
                    events: {
                        onReady: async (event) => {
                            console.log('YouTube onReady fired');
                            this.playerReady = true;
                            const details = await detailsPromise;
                            const data = event.target.getVideoData();
                            const videoData = {
                                title: details?.title || data?.title || 'Unknown Title',
                                author: details?.author || data?.author || 'Unknown Artist'
                            };
                            onReady(event, videoData);
                        },
                        onStateChange: onStateChange,
                        onError: (event) => {
                            console.error('YouTube Player Error:', event.data);
                            this.onPlayerError(event);
                        }
                    }
                });
            } catch (error) {
                console.error('Error creating YouTube player:', error);
                this.dom.showNotification('Error creating YouTube player', 'error');
            }
        };

        tryCreatePlayer();
    }

    onPlayerError(event) {
        const errorCodes = {
            100: 'The video requested was not found.',
            101: 'The owner of the requested video does not allow it to be played in embedded players.',
            150: 'This error is the same as 101.'
        };
        const errorCode = event.data;
        this.dom.showNotification(`Error ${errorCode}: ${errorCodes[errorCode] || 'An unknown error occurred.'}`);
    }

    play() {
        if (this.player && this.playerReady) {
            this.player.playVideo();
        }
    }

    pause() {
        if (this.player && this.playerReady) {
            this.player.pauseVideo();
        }
    }

    seekTo(seconds) {
        if (this.player && this.playerReady) {
            this.player.seekTo(seconds, true);
        }
    }

    getDuration() {
        return (this.player && this.playerReady) ? this.player.getDuration() - 0.4 : 0;
    }

    getCurrentTime() {
        return (this.player && this.playerReady) ? this.player.getCurrentTime() : 0;
    }

    destroy() {
        if (this.player && typeof this.player.destroy === 'function') {
            this.player.destroy();
        }
        this.player = null;
        this.playerReady = false;
    }

    setVolume(volume) {
        if (this.player && this.playerReady) {
            this.player.setVolume(volume);
        }
    }
} 
