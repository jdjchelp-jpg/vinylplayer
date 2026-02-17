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

    async isVideoEmbeddable(videoId) {
        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            if (response.ok) {
                return true;
            }
            return false;
        } catch (error) {
            console.warn('Embeddability check failed:', error);
            return false;
        }
    }

    createPlayer(elementId, videoId, onReady, onStateChange) {
        const tryCreatePlayer = async () => {
            if (!this.isReady) {
                console.log('Waiting for YouTube API to be ready...');
                setTimeout(() => tryCreatePlayer(), 100);
                return;
            }

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
                    height: '1',
                    width: '1',
                    playerVars: {
                        enablejsapi: 1,
                        controls: 0,
                        modestbranding: 1,
                        playsinline: 1,
                        autoplay: 1
                    },
                    events: {
                        onReady: async (event) => {
                            console.log('YouTube onReady fired');
                            this.playerReady = true;
                            let details = null;
                            try {
                                details = await detailsPromise;
                            } catch (e) {
                                console.warn('Failed to fetch video details:', e);
                            }
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
