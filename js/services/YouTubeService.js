export class YouTubeService {
    constructor(dom) {
        this.player = null;
        this.isReady = false;
        this.playerReady = false;
        this.pendingVideoId = null;
        this.dom = dom;
        this.loadYouTubeAPI();
    }

    loadYouTubeAPI() {
        if (window.YT) {
            this.isReady = true;
            return;
        }

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

        if (url.startsWith('https://youtu.be/') || url.startsWith('http://youtu.be/')) {
            const parts = url.split('/');
            const lastPart = parts[parts.length - 1].split('?')[0].split('#')[0];
            if (lastPart.length === 11) return lastPart;
        }

        try {
            const urlObj = new URL(url);
            const vParam = urlObj.searchParams.get('v');
            if (vParam && vParam.length === 11) return vParam;
        } catch (e) {
            // Not a full URL, fallback
        }

        const shortsMatch = url.match(/(?:youtube\.com\/shorts\/|youtu\.be\/)([^#&?]{11})/);
        if (shortsMatch) return shortsMatch[1];

        const liveMatch = url.match(/(?:youtube\.com\/live\/)([^#&?]{11})/);
        if (liveMatch) return liveMatch[1];

        const embedMatch = url.match(/(?:youtube\.com\/embed\/)([^#&?]{11})/);
        if (embedMatch) return embedMatch[1];

        const vMatch = url.match(/(?:youtube\.com\/v\/)([^#&?]{11})/);
        if (vMatch) return vMatch[1];

        const genericMatch = url.match(/(?:youtube\.com\/.*[?&]v=|youtu\.be\/)([^#&?]{11})/);
        if (genericMatch) return genericMatch[1];

        return false;
    }

    async getVideoCoverUrl(videoId) {
        const checkImage = (url) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
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

        for (const quality of qualities) {
            const url = `https://img.youtube.com/vi/${videoId}/${quality}`;
            if (await checkImage(url)) {
                return url;
            }
        }

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

    createPlayer(elementId, videoId, onReady, onStateChange) {
        this.onReadyCallback = onReady;
        this.onStateChangeCallback = onStateChange;

        if (this.player && !this.playerReady) {
            console.log('Player still initializing, queuing video:', videoId);
            this.pendingVideoId = videoId;
            return;
        }

        if (this.player && this.playerReady) {
            const detailsPromise = this.getVideoDetails(videoId);
            try {
                this.player.loadVideoById({ videoId });
                detailsPromise.then(details => {
                    const data = this.player.getVideoData();
                    const videoData = {
                        title: details?.title || data?.title || 'Unknown Title',
                        author: details?.author || data?.author || 'Unknown Artist'
                    };
                    if (this.onReadyCallback) this.onReadyCallback({ target: this.player }, videoData);
                }).catch(() => {
                    const data = this.player.getVideoData();
                    if (this.onReadyCallback) this.onReadyCallback({ target: this.player }, {
                        title: data?.title || 'Unknown Title',
                        author: data?.author || 'Unknown Artist'
                    });
                });
            } catch (e) {
                console.warn("Failed to load video on existing player, recreating:", e);
                this.player = null;
                this.playerReady = false;
                this.createPlayer(elementId, videoId, onReady, onStateChange);
            }
            return;
        }

        const tryCreatePlayer = async () => {
            if (!this.isReady) {
                console.log('Waiting for YouTube API to be ready...');
                setTimeout(() => tryCreatePlayer(), 100);
                return;
            }

            try {
                const detailsPromise = this.getVideoDetails(videoId);
                console.log('Creating YouTube player for:', videoId);
                this.player = new YT.Player(elementId, {
                    videoId: videoId,
                    height: '360',
                    width: '360',
                    playerVars: {
                        enablejsapi: 1,
                        controls: 0,
                        modestbranding: 1,
                        playsinline: 1,
                        autoplay: 1,
                        origin: window.location.origin.replace(/\/$/, ''),
                        widget_referrer: window.location.href.replace(/\/$/, ''),
                        rel: 0
                    },
                    events: {
                        onReady: async (event) => {
                            console.log('YouTube onReady fired');
                            this.playerReady = true;
                            if (this.pendingVideoId) {
                                const pendingId = this.pendingVideoId;
                                this.pendingVideoId = null;
                                this.player.loadVideoById({ videoId: pendingId });
                                const pendingDetails = await this.getVideoDetails(pendingId).catch(() => null);
                                const pData = event.target.getVideoData();
                                const pVideoData = {
                                    title: pendingDetails?.title || pData?.title || 'Unknown Title',
                                    author: pendingDetails?.author || pData?.author || 'Unknown Artist'
                                };
                                if (this.onReadyCallback) this.onReadyCallback(event, pVideoData);
                                return;
                            }
                            const details = await detailsPromise.catch(() => null);
                            const data = event.target.getVideoData();
                            const videoData = {
                                title: details?.title || data?.title || 'Unknown Title',
                                author: details?.author || data?.author || 'Unknown Artist'
                            };
                            if (this.onReadyCallback) this.onReadyCallback(event, videoData);
                        },
                        onStateChange: (event) => {
                            if (this.onStateChangeCallback) this.onStateChangeCallback(event);
                        },
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
            2: 'The request contains an invalid parameter value.',
            5: 'The requested content cannot be played.',
            100: 'The video requested was not found.',
            101: 'The owner of the requested video does not allow it to be played in embedded players.',
            150: 'This error is the same as 101.'
        };
        const errorCode = event.data;
        this.dom.showNotification(`YouTube Error ${errorCode}: ${errorCodes[errorCode] || 'An unknown error occurred.'}`);
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

    /**
     * Fetch audio stream URL from an Invidious instance.
     * Returns the best available audio-only stream URL for the given videoId.
     */
    async getInvidiousAudioUrl(videoId) {
        const instances = [
            'https://vid.puffyan.us',
            'https://invidious.snopyta.org',
            'https://invidious.namazso.eu',
            'https://yt.artemislena.eu',
            'https://inv.bp.projectsegfau.lt',
            'https://invidious.privacyredirect.com',
            'https://inv.nadeko.net'
        ];

        for (const instance of instances) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const response = await fetch(`${instance}/api/v1/videos/${videoId}`, {
                    signal: controller.signal
                });
                clearTimeout(timeout);

                if (!response.ok) continue;
                const data = await response.json();

                // Find adaptive audio-only formats
                const audioFormats = (data.adaptiveFormats || []).filter(
                    f => f.type && f.type.startsWith('audio/') && f.url
                );

                if (audioFormats.length > 0) {
                    // Prefer opus or aac, then fallback to any audio
                    const preferred = audioFormats.find(f => f.type.includes('opus'))
                        || audioFormats.find(f => f.type.includes('mp4a'))
                        || audioFormats[0];
                    console.log(`[Privacy Audio] Stream found via ${instance}`);
                    return preferred.url;
                }
            } catch (err) {
                console.warn(`[Privacy Audio] Instance ${instance} failed:`, err.message);
                continue;
            }
        }

        throw new Error('All Invidious instances failed. Please try the video stream option.');
    }

    /**
     * Play a raw audio URL through the local HTML5 audio element.
     * Used by the privacy audio fallback to bypass YouTube iframe entirely.
     */
    async playAudioFallback(videoId, onReady, onStateChange) {
        console.log('[Privacy Audio] Fetching audio stream for:', videoId);

        try {
            const audioUrl = await this.getInvidiousAudioUrl(videoId);

            // Get video metadata via oembed
            const details = await this.getVideoDetails(videoId).catch(() => null);
            const videoData = {
                title: details?.title || 'YouTube Video',
                author: details?.author || 'Unknown Artist'
            };

            // Return the audio URL and metadata so VinylPlayer can handle playback
            return { audioUrl, videoData };
        } catch (error) {
            console.error('[Privacy Audio] Fallback failed:', error);
            throw error;
        }
    }
}