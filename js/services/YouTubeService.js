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
        // getPlayerResponse is not always available/stable in public IFrame API
        const playerInfo = (typeof this.player.getPlayerResponse === 'function') ? this.player.getPlayerResponse() : null;

        const title = (playerData?.title && playerData.title !== 'Loading...') ? playerData.title : null;
        const author = playerInfo?.videoDetails?.author ||
            playerInfo?.videoDetails?.channelName ||
            playerData?.author ||
            'Unknown Artist';

        return {
            title: title || 'YouTube Video',
            author: author,
            video_id: playerData?.video_id
        };
    }

    async isVideoEmbeddable(videoId) {
        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            if (response.ok) {
                return true;
            }
            // 401/403 = not embeddable, but other errors = assume embeddable
            if (response.status === 401 || response.status === 403) {
                return false;
            }
            return true; // Default to true for unknown status codes
        } catch (error) {
            // Network error, CORS, or ad blocker — assume embeddable and let YouTube handle it
            console.warn('Video embedding check failed (assuming embeddable):', error);
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

            try {
                // If player already exists and is ready, just load the new video
                if (this.player && this.playerReady && typeof this.player.loadVideoById === 'function') {
                    console.log('Reusing existing YouTube player for video:', videoId);
                    this.player.loadVideoById({
                        videoId: videoId,
                        startSeconds: 0
                    });

                    // Manually trigger onReady-like behavior for metadata
                    const details = await this.getVideoDetails(videoId).catch(() => null);
                    const quickData = this.getVideoData() || {};
                    const videoData = {
                        title: details?.title || quickData.title || 'YouTube Video',
                        author: details?.author || quickData.author || 'Unknown Artist'
                    };

                    // We call onReady callback with current event (null if needed or fake)
                    onReady(null, videoData);
                    return;
                }

                // If player exists but is NOT ready or we want to start fresh
                if (this.player && typeof this.player.destroy === 'function') {
                    try {
                        this.player.destroy();
                    } catch (e) {
                        console.warn('Error destroying previous player:', e);
                    }
                    this.player = null;
                    this.playerReady = false;
                }

                // Ensure the target element exists
                let targetEl = document.getElementById(elementId);
                if (!targetEl) {
                    console.log('Recreating player element:', elementId);
                    targetEl = document.createElement('div');
                    targetEl.id = elementId;
                    const container = document.querySelector('.container') || document.body;
                    container.appendChild(targetEl);
                }

                console.log('Initializing new YouTube player for video:', videoId);

                // Start metadata fetch in parallel
                const detailsPromise = this.getVideoDetails(videoId).catch(() => null);

                this.player = new YT.Player(elementId, {
                    videoId: videoId,
                    height: '1',
                    width: '1',
                    playerVars: {
                        enablejsapi: 1,
                        autoplay: 1,
                        origin: window.location.origin,
                        controls: 0,
                        modestbranding: 1,
                        playsinline: 1
                    },
                    events: {
                        onReady: (event) => {
                            console.log('YouTube Player Ready event fired');
                            this.playerReady = true;

                            const quickData = this.getVideoData();
                            onReady(event, quickData);

                            detailsPromise.then(details => {
                                if (details && this.playerReady) {
                                    const improvedData = {
                                        title: details.title || quickData.title,
                                        author: details.author || quickData.author
                                    };
                                    onReady(event, improvedData);
                                }
                            });
                        },
                        onStateChange: (event) => {
                            // Update metadata if it was unknown
                            if (event.data === YT.PlayerState.PLAYING) {
                                const data = this.getVideoData();
                                if (data && data.title === 'YouTube Video') {
                                    onReady(event, data);
                                }
                            }
                            onStateChange(event);
                        },
                        onError: (event) => {
                            console.error('YouTube Player Error:', event.data);
                            this.onPlayerError(event);
                        }
                    }
                });
            } catch (error) {
                console.error('Error in YouTube creation flow:', error);
                this.dom.showNotification('Error initializing YouTube player', 'error');
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
