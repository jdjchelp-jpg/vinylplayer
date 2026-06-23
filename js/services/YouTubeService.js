export class YouTubeService {
    constructor() {
        this.player = null;
        this.playerReady = false;
    }

    /**
     * Official, safe initialization method expected by VinylPlayer.js
     * FIXED: Added 'origin' and 'host' to prevent postMessage cross-origin errors.
     */
    createPlayer(elementId, videoId, onReadyCallback, onStateChangeCallback) {
        if (typeof YT === 'undefined' || !YT.Player) {
            console.warn("YouTube IFrame API is not fully loaded yet.");
            return;
        }

        console.log(`Creating standard YouTube player for: ${videoId} under origin: ${window.location.origin}`);

        // Explicitly define host and origin to match your deployment domain
        const myOrigin = window.location.origin;

        this.player = new YT.Player(elementId, {
            videoId: videoId,
            height: '460',
            width: '460',
            // Use nocookie host to reduce tracking and avoid CSP/postMessage conflicts
            host: 'https://www.youtube-nocookie.com',
            playerVars: {
                'enablejsapi': 1,
                'controls': 0,
                'modestbranding': 1,
                'playsinline': 1,
                'autoplay': 1,
                'rel': 0,
                'iv_load_policy': 3,
                'origin': myOrigin // Pass the origin in playerVars to whitelist the domain
            },
            events: {
                'onReady': (event) => {
                    this.playerReady = true;
                    console.log("YouTube Player Ready");
                    if (onReadyCallback) onReadyCallback(event);
                },
                'onStateChange': (event) => {
                    if (onStateChangeCallback) onStateChangeCallback(event);
                },
                'onError': (event) => {
                    console.error("YouTube Player Error:", event.data);
                    // Specific check for "Invalid Video ID" or "Embedding Disallowed"
                    if (event.data === 5) {
                        console.warn("Video cannot be embedded. Try fallback audio.");
                    }
                }
            }
        });
    }

    // ── Playback Controls ──────────────────────────────

    play() {
        if (this.player && this.player.playVideo) this.player.playVideo();
    }

    pause() {
        if (this.player && this.player.pauseVideo) this.player.pauseVideo();
    }

    stop() {
        if (this.player && this.player.stopVideo) this.player.stopVideo();
    }

    setVolume(vol) {
        if (this.player && this.player.setVolume) this.player.setVolume(vol);
    }

    getVolume() {
        if (this.player && this.player.getVolume) return this.player.getVolume();
        return 100;
    }

    seekTo(seconds) {
        if (this.player && this.player.seekTo) this.player.seekTo(seconds, true);
    }

    getCurrentTime() {
        if (this.player && this.player.getCurrentTime) return this.player.getCurrentTime();
        return 0;
    }

    getDuration() {
        if (this.player && this.player.getDuration) return this.player.getDuration();
        return 0;
    }

    getVideoData() {
        if (this.player && this.player.getVideoData) return this.player.getVideoData();
        return null;
    }

    // ── Helpers ─────────────────────────────────────────

    /**
     * Get the YouTube video thumbnail URL.
     */
    getVideoCoverUrl(videoId) {
        return Promise.resolve(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
    }

    /**
     * Fetch basic video details via the oEmbed API (no API key needed).
     */
    async getVideoDetails(videoId) {
        try {
            const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
            const resp = await fetch(url);
            if (!resp.ok) return null;
            const data = await resp.json();
            return {
                title: data.title || 'Unknown Title',
                author: data.author_name || 'Unknown Artist'
            };
        } catch (err) {
            console.warn('getVideoDetails failed:', err);
            return null;
        }
    }

    /**
     * Privacy audio fallback — returns a direct audio URL using a
     * third-party service. This avoids loading the YouTube iframe.
     */
    async playAudioFallback(videoId) {
        // Use a public cobalt API to fetch a direct audio stream
        const cobaltUrl = 'https://api.cobalt.tools/api/json';
        const resp = await fetch(cobaltUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                url: `https://www.youtube.com/watch?v=${videoId}`,
                isAudioOnly: true,
                aFormat: 'mp3'
            })
        });
        if (!resp.ok) throw new Error('Cobalt API request failed');
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        const videoData = await this.getVideoDetails(videoId);
        return { audioUrl: data.url, videoData };
    }
}

// Bind instance to the window scope for global integration
window.youtubeServiceInstance = new YouTubeService();