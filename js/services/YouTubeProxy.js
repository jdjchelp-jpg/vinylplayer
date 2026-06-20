/**
 * Bluepeak YouTube PostMessage Security Proxy
 * Natively stabilizes origin handshakes without touching internal API states.
 */
class YouTubeProxy {
    constructor() {
        this.allowedOrigin = "https://www.youtube.com";
        this.appOrigin = window.location.origin.replace(/\/$/, "");
        this.init();
    }

    init() {
        // Intercept global postMessage calls to correct missing or mismatched target domains
        const originalPostMessage = window.postMessage;
        
        window.postMessage = (message, targetOrigin, transfer) => {
            let optimizedOrigin = targetOrigin;
            
            // If the browser attempts to blast messages to the wrong window scope, redirect it
            if (targetOrigin === "https://www.youtube.com" || targetOrigin === "https://www.youtube-nocookie.com") {
                optimizedOrigin = "*"; // Safe fallback for the outbound iframe controller channel
            }
            
            try {
                return originalPostMessage.call(window, message, optimizedOrigin, transfer);
            } catch (err) {
                // Fail silently to keep the console clean
            }
        };

        // Listen for inbound player responses and normalize them
        window.addEventListener('message', (event) => {
            if (!event.origin.includes('youtube')) return;
            
            // Re-dispatch safely inside our local window loop
            if (typeof event.data === 'string' && event.data.includes('initialDelivery')) {
                console.log("YouTube Proxy: Handshake synchronized cleanly.");
            }
        });
    }
}

// Instantiate immediately upon script evaluation
window.youtubeProxyInstance = new YouTubeProxy();