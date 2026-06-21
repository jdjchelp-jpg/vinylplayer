class YouTubeService {
    constructor() {
        this.player = null;
        this.playerReady = false;
    }

    /**
     * Official, safe initialization method expected by VinylPlayer.js
     */
    createPlayer(elementId, videoId, onReadyCallback, onStateChangeCallback) {
        if (typeof YT === 'undefined' || !YT.Player) {
            console.warn("YouTube IFrame API is not fully loaded yet.");
            return;
        }

        // Clean trailing slashes natively—secures the postMessage channel safely!
        const cleanParentOrigin = window.location.origin.replace(/\/$/, "");

        console.log(`Creating standard YouTube player for: ${videoId} under origin: ${cleanParentOrigin}`);

        this.player = new YT.Player(elementId, {
            videoId: videoId,
            height: '460', // Matches your upscaled vinyl player size!
            width: '460',
            playerVars: {
                'enablejsapi': 1,
                'controls': 0,
                'modestbranding': 1,
                'playsinline': 1,
                'autoplay': 1,
                /* Official parameters bind the messaging channel directly to your Vercel URL */
                'origin': cleanParentOrigin,
                'widget_referrer': cleanParentOrigin
            },
            events: {
                'onReady': (event) => {
                    this.playerReady = true;
                    if (onReadyCallback) onReadyCallback(event);
                },
                'onStateChange': (event) => {
                    if (onStateChangeCallback) onStateChangeCallback(event);
                },
                'onError': (event) => {
                    console.error("YouTube Player Error:", event.data);
                }
            }
        });
    }
}

// Bind instance to the window scope for global integration
window.youtubeServiceInstance = new YouTubeService();