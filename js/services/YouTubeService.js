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

        // Define callback for YouTube API
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
        // Check YouTube Shorts
        const shortsRegExp = /^.*youtube\.com\/shorts\/([^#&?]*).*/;
        const shortsMatch = url.match(shortsRegExp);
        if (shortsMatch && shortsMatch[1].length === 11) {
            return shortsMatch[1];
        }

        // Check normal YouTube URL
        const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[7].length === 11) ? match[7] : false;
    }

    async getVideoCoverUrl(videoId) {
        // Function to check image dimensions
        const checkImage = (url) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    // YouTube returns a 120x90 placeholder for unavailable sizes
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

        // Check each quality and return the first available
        for (const quality of qualities) {
            const url = `https://img.youtube.com/vi/${videoId}/${quality}`;
            if (await checkImage(url)) {
                return url;
            }
        }

        // Fallback
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }

    async getVideoDetails(videoId) {
        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            const data = await response.json();
            return {
                title: data.title,
                author: data.author_name
            };
        } catch (error) {
            console.error('Error fetching video details:', error);
            return null;
        }
    }

    getVideoData() {
        if (!this.player) return null;

        // Get data from player
        const playerData = this.player.getVideoData();
        // Get extra data from playerResponse
        const playerInfo = this.player.getPlayerResponse();

        return {
            title: playerData.title,
            // Try multiple sources for author/channel
            author: playerInfo?.videoDetails?.author ||
                playerInfo?.videoDetails?.channelName ||
                playerData.author ||
                'Unknown Artist',
            video_id: playerData.video_id
        };
    }

    async isVideoEmbeddable(videoId) {
        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            if (response.ok) {
                return true;
            }
            return false;
        } catch (error) {
            console.error('Video embedding check failed:', error);
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

            // Check if video is embeddable
            const embeddable = await this.isVideoEmbeddable(videoId);
            if (!embeddable) {
                this.dom.showNotification('This video cannot be embedded or requires login.');
                return;
            }

            try {
                const details = await this.getVideoDetails(videoId);
                const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

                // Destroy existing player if any to prevent duplicates or binding issues
                if (this.player && typeof this.player.destroy === 'function') {
                    this.player.destroy();
                }

                this.player = new YT.Player(elementId, {
                    videoId: videoId,
                    height: '0',
                    width: '0',
                    playerVars: {
                        enablejsapi: 1,
                        origin: window.location.origin,
                        controls: 0,
                        modestbranding: 1,
                        playsinline: 1
                    },
                    events: {
                        onReady: (event) => {
                            this.playerReady = true;
                            const data = event.target.getVideoData();
                            const videoData = {
                                title: details?.title || data.title || 'Unknown Title',
                                author: details?.author || 'Unknown Artist'
                            };
                            onReady(event, videoData);
                        },
                        onStateChange: onStateChange,
                        onError: (event) => {
                            console.error('YouTube Player Error:', event.data);
                            this.onPlayerError(event);
                            if (event.data === 150 && isSafari) {
                                console.warn('Retrying in Safari with minimal config...');
                            }
                        }
                    }
                });
            } catch (error) {
                console.error('Error creating YouTube player:', error);
                this.dom.showNotification('Error creating YouTube player', 'error');
                setTimeout(() => tryCreatePlayer(), 100);
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
        if (this.player && this.playerReady) {
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
