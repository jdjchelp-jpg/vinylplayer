// Lightweight YouTube watch integration for the web player.
// Uses YouTube's official embedded player surface; it does not extract or
// download media URLs and therefore stays within the platform's embed model.
export class YouTubeService {
    static extractId(value) {
        try {
            const url = new URL(String(value).trim());
            if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0] || null;
            if (url.hostname.endsWith('youtube.com')) {
                if (url.pathname === '/watch') return url.searchParams.get('v');
                const parts = url.pathname.split('/').filter(Boolean);
                if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || null;
            }
        } catch { /* invalid URL */ }
        return null;
    }

    static isYouTubeUrl(value) {
        return Boolean(this.extractId(value) || this.extractPlaylistId(value));
    }

    static extractPlaylistId(value) {
        try {
            return new URL(String(value).trim()).searchParams.get('list');
        } catch { return null; }
    }

    static createPlayer(mount, videoId, onStateChange, onInfo, playlistId = null) {
        mount.replaceChildren();
        const iframe = document.createElement('iframe');
        iframe.className = 'youtube-player-frame';
        const target = playlistId && !videoId ? 'videoseries' : encodeURIComponent(videoId);
        const playlist = playlistId ? `&list=${encodeURIComponent(playlistId)}` : '';
        iframe.src = `https://www.youtube-nocookie.com/embed/${target}?enablejsapi=1&autoplay=1&playsinline=1&rel=0&modestbranding=1${playlist}`;
        iframe.title = 'YouTube video player';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.allowFullscreen = true;
        mount.appendChild(iframe);

        const handler = (event) => {
            if (event.source !== iframe.contentWindow || typeof event.data !== 'string') return;
            try {
                const message = JSON.parse(event.data);
                if (message.event === 'onStateChange') onStateChange?.(message.info);
                if (message.event === 'infoDelivery') onInfo?.(message.info || {});
            } catch { /* ignore non-player postMessages */ }
        };
        window.addEventListener('message', handler);
        const send = (message) => iframe.contentWindow?.postMessage(JSON.stringify(message), '*');
        iframe.addEventListener('load', () => {
            send({ event: 'listening', id: 'vinyl-player' });
            send({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: 'vinyl-player' });
            send({ event: 'command', func: 'addEventListener', args: ['infoDelivery'], id: 'vinyl-player' });
        });
        return {
            iframe,
            command(func, args = []) {
                send({ event: 'command', func, args, id: 'vinyl-player' });
            },
            destroy() {
                window.removeEventListener('message', handler);
                mount.replaceChildren();
            }
        };
    }
}
