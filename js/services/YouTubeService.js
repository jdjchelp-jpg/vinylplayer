export class YouTubeService {
    constructor() {
        this.player = null;
        this.playerReady = false;
    }

    /**
     * FORCED AUDIO-ONLY MODE
     * Completely bypasses YouTube Iframe API (fixing postMessage errors)
     * and avoids FFmpeg initialization unless strictly needed for file conversion.
     */
    createPlayer(elementId, videoId, onReadyCallback, onStateChangeCallback, onErrorCallback) {
        console.log(`[FORCE-AUDIO] Bypassing Iframe. Fetching direct stream for ${videoId}...`);

        // Clear any existing player to prevent state leaks
        const container = document.getElementById(elementId);
        if (container) container.innerHTML = '';

        // 1. Immediately trigger the fallback logic
        this.playAudioFallback(videoId)
            .then(async (result) => {
                if (!result.success || !result.audioUrl) {
                    throw new Error("No audio URL received");
                }

                console.log(`[SUCCESS] Stream obtained from ${result.source}`);

                // 2. Create a standard HTML5 Audio element (No FFmpeg needed for playback!)
                const audioEl = new Audio(result.audioUrl);

                // Save metadata for later use (getVideoData, ready callback, etc.)
                const meta = result.metadata || result.videoData || null;
                audioEl._meta = meta;

                // 3. Simulate YT Player events for compatibility with VinylPlayer.js
                // We create a mock object that looks like a YT.Player but uses native Audio
                const mockPlayer = {
                    audioEl: audioEl,
                    playVideo: () => audioEl.play().catch(e => console.warn("Autoplay blocked:", e)),
                    pauseVideo: () => audioEl.pause(),
                    stopVideo: () => { audioEl.pause(); audioEl.currentTime = 0; },
                    seekTo: (time, allowSeekAhead) => { audioEl.currentTime = time; },
                    setVolume: (vol) => { audioEl.volume = Math.max(0, Math.min(1, vol / 100)); },
                    getVolume: () => audioEl.volume * 100,
                    getCurrentTime: () => audioEl.currentTime,
                    getDuration: () => audioEl.duration || 0,
                    getVideoData: () => meta,
                    setPlaybackRate: (rate) => { audioEl.playbackRate = rate; },
                    getPlaybackRate: () => audioEl.playbackRate,
                    destroy: () => {
                        audioEl.pause();
                        audioEl.src = '';
                    }
                };

                // 4. Handle Events — maps native HTML5 audio events to YT.Player-style callbacks
                audioEl.addEventListener('loadedmetadata', () => {
                    this.playerReady = true;
                    this.player = mockPlayer;
                    // Trigger the "Ready" event for VinylPlayer, passing metadata as videoData
                    if (onReadyCallback) onReadyCallback({ target: mockPlayer }, meta);
                });

                audioEl.addEventListener('play', () => {
                    if (onStateChangeCallback) onStateChangeCallback({ data: 1 }); // YT.PlayerState.PLAYING
                });

                audioEl.addEventListener('pause', () => {
                    if (onStateChangeCallback) onStateChangeCallback({ data: 2 }); // YT.PlayerState.PAUSED
                });

                audioEl.addEventListener('ended', () => {
                    if (onStateChangeCallback) onStateChangeCallback({ data: 0 }); // YT.PlayerState.ENDED
                });

                audioEl.addEventListener('error', (e) => {
                    console.error("Audio Playback Error:", e);
                    if (onErrorCallback) onErrorCallback({ data: -1 });
                });

                // Pre-load so it's ready when play() is called
                audioEl.load();
            })
            .catch(err => {
                console.error("[AUDIO FAIL] Extraction failed:", err.message);
                // Only log error, do not fall back to iframe
                if (onErrorCallback) onErrorCallback({ data: -1 });
            });

        // Return immediately — playback becomes ready asynchronously via loadedmetadata
        return;
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
     * Audio fallback using public proxy services.
     * Removes reliance on YouTube Iframe API to bypass CORS/Origin errors.
     * Tries each proxy in order; falls through if one fails.
     */
    async playAudioFallback(videoId) {
        // List of available public audio extraction endpoints
        // Note: Community-maintained services may change uptime frequently.
        const proxies = [
            {
                name: 'Cobalt',
                url: 'https://api.cobalt.tools/api/json',
                headers: { 'Content-Type': 'application/json' }
            }
        ];

        console.log(`[Audio Fallback] Attempting to fetch audio for ${videoId}...`);

        for (const proxy of proxies) {
            try {
                console.log(`[Audio Fallback] Trying ${proxy.name}...`);

                const resp = await fetch(proxy.url, {
                    method: 'POST',
                    headers: {
                        ...proxy.headers,
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        url: `https://www.youtube.com/watch?v=${videoId}`,
                        isAudioOnly: true,
                        aFormat: 'mp3'
                    })
                });

                if (!resp.ok) throw new Error(`Status ${resp.status}`);

                const data = await resp.json();

                if (!data.url) throw new Error('No URL returned');

                // Success! Get metadata too
                const meta = await this.getVideoDetails(videoId);

                console.log(`[Audio Fallback] Success via ${proxy.name}!`);
                return {
                    success: true,
                    audioUrl: data.url,
                    source: proxy.name,
                    metadata: meta,
                    videoData: meta // backward compatibility
                };

            } catch (err) {
                console.warn(`[Audio Fallback] ${proxy.name} failed:`, err.message);
                // Continue to next proxy
            }
        }

        throw new Error('All audio extraction proxies failed.');
    }
}

// Bind instance to the window scope for global integration
window.youtubeServiceInstance = new YouTubeService();