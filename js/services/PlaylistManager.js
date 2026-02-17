export class PlaylistManager {
    constructor() {
        this.playlist = [];
        this.currentTrackIndex = 0;
        this.isChangingTrack = false;
        // Legacy support mapping
        this.queue = this.playlist;
    }

    // Legacy method support if needed, or migration
    get queue() {
        return this.playlist;
    }
    set queue(val) {
        this.playlist = val;
    }

    addTracks(tracks) {
        // Find if we already have these tracks to avoid duplicates? 
        // For now, let's just append.
        const wasEmpty = this.playlist.length === 0;
        this.playlist = [...this.playlist, ...tracks];
        if (wasEmpty) this.currentTrackIndex = 0;
    }

    // Support for single item add (migration helper)
    addToQueue(item) {
        this.playlist.push(item);
        if (this.currentTrackIndex === -1 || this.playlist.length === 1) {
            this.currentTrackIndex = 0;
        }
    }

    getCurrentTrack() {
        if (this.currentTrackIndex < 0 || this.currentTrackIndex >= this.playlist.length) return null;
        const track = this.playlist[this.currentTrackIndex];
        if (track && track.file && !track.source) {
            // Create URL only when requested
            track.source = URL.createObjectURL(track.file);
            track.id = track.source; // Ensure ID is set for local files
        }
        return track;
    }

    hasNextTrack() {
        return this.currentTrackIndex < this.playlist.length - 1;
    }

    nextTrack() {
        if (this.hasNextTrack()) {
            // Revoke URL of previous track if it was a local file to save memory
            // But be careful if we want to go back. 
            // Better: only revoke if we are sure we won't need it soon, or just keep it until clear().
            // Let's keep URLs for now to allow back/forth without flashing/re-loading.

            this.currentTrackIndex++;
            return this.getCurrentTrack();
        } else if (this.playlist.length > 0) {
            // Optional: Loop to beginning
            this.currentTrackIndex = 0;
            return this.getCurrentTrack();
        }
        return null;
    }

    // Added for backward compatibility with VinylPlayer.js
    next() {
        return this.nextTrack();
    }

    // Added for backward compatibility with VinylPlayer.js
    previous() {
        if (this.currentTrackIndex > 0) {
            // Revoke current
            const currentTrack = this.playlist[this.currentTrackIndex];
            if (currentTrack && currentTrack.source && currentTrack.file) {
                URL.revokeObjectURL(currentTrack.source);
                currentTrack.source = '';
            }

            this.currentTrackIndex--;
            return this.getCurrentTrack();
        }
        return null;
    }

    clear() {
        // Revoke all
        this.playlist.forEach(track => {
            if (track.source && track.file) {
                URL.revokeObjectURL(track.source);
            }
        });
        this.playlist = [];
        this.currentTrackIndex = 0;
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
