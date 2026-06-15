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

        // Handle youtu.be short URLs
        if (url.startsWith('https://youtu.be/') || url.startsWith('http://youtu.be/')) {
            const parts = url.split('/');
            const lastPart = parts[parts.length - 1].split('?')[0].split('#')[0];
            if (lastPart.length === 11) return lastPart;
        }

        // Extract video ID from any URL containing v= parameter
        try {
            const urlObj = new URL(url);
            const vParam = urlObj.searchParams.get('v');
            if (vParam && vParam.length === 11) return vParam;
        } catch (e) {
            // Not a full URL, fallback to regex
        }

        // Check for /shorts/ pattern
        const shortsMatch = url.match(/(?:youtube\.com\/shorts\/|youtu\.be\/)([^#&?]{11})/);
        if (shortsMatch) return shortsMatch[1];

        // Check for /live/ pattern (livestreams)
        const liveMatch = url.match(/(?:youtube\.com\/live\/)([^#&?]{11})/);
        if (liveMatch) return liveMatch[1];

        // Check for /embed/ pattern
        const embedMatch = url.match(/(?:youtube\.com\/embed\/)([^#&?]{11})/);
        if (embedMatch) return embedMatch[1];

        // Check for /v/ pattern
        const vMatch = url.match(/(?:youtube\.com\/v\/)([^#&?]{11})/);
        if (vMatch) return vMatch[1];

        // Generic regex for any YouTube URL containing an 11-character ID
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

    // ponytail: isVideoEmbeddable is removed because it is dead code not called anywhere in the app.

    createPlayer(elementId, videoId, onReady, onStateChange) {
        this.onReadyCallback = onReady;
        this.onStateChangeCallback = onStateChange;

        // ponytail: Reuse existing player instance instead of destroying it. Recreating iframe blocks autoplay and triggers browser autoplay restrictions.
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

            // ponytail: Maintain player as 360x360. 1x1 dimensions get flagged by browsers as invisible/hidden backgrounds and get paused.
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
                        origin: window.location.origin
                    },
                    events: {
                        onReady: async (event) => {
                            console.log('YouTube onReady fired');
                            this.playerReady = true;
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
}
