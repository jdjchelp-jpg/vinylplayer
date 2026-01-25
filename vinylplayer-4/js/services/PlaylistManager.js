class PlaylistManager {
    constructor() {
        this.queue = [];
        this.currentIndex = -1;
    }

    addToQueue(item) {
        // item: { id: string, title: string, thumbnail: string, isVideo: boolean }
        this.queue.push(item);
        if (this.currentIndex === -1) {
            this.currentIndex = 0;
        }
    }

    getCurrentTrack() {
        if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
            return this.queue[this.currentIndex];
        }
        return null;
    }

    next() {
        if (this.currentIndex < this.queue.length - 1) {
            this.currentIndex++;
            return this.getCurrentTrack();
        }
        return null;
    }

    previous() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            return this.getCurrentTrack();
        }
        return null;
    }

    // Simple parser for YouTube URLs
    parseUrl(url) {
        let videoId = null;
        let listId = null;

        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
                if (urlObj.searchParams.has('v')) {
                    videoId = urlObj.searchParams.get('v');
                } else if (urlObj.pathname.length > 1) {
                    videoId = urlObj.pathname.substring(1);
                }

                if (urlObj.searchParams.has('list')) {
                    listId = urlObj.searchParams.get('list');
                }
            }
        } catch (e) {
            console.error("Invalid URL", e);
        }

        return { videoId, listId };
    }
}
