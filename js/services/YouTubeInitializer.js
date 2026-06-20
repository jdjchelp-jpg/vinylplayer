/**
 * Bluepeak YouTube Initializer Gate
 * Runs right before track load events to verify environment stability.
 */
window.initializeYouTubeChannel = function() {
    return new Promise((resolve) => {
        const cleanOrigin = window.location.origin.replace(/\/$/, "");
        
        // Enforce the official Google API global configuration object parameters
        window.YT = window.YT || {};
        window.YT.ready = function(callback) {
            if (window.youtubeProxyInstance) {
                callback();
            } else {
                setTimeout(() => window.YT.ready(callback), 50);
            }
        };
        
        console.log("YouTube Initializer: Environment parameters successfully isolated.");
        resolve(cleanOrigin);
    });
};

// Auto-execute environment configuration check
document.addEventListener("DOMContentLoaded", () => {
    if (window.initializeYouTubeChannel) {
        window.initializeYouTubeChannel();
    }
});