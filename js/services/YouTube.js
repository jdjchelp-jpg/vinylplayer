// Vinyl Player - optional YouTube integration layer.
// This layer uses the official, cross-origin-safe YouTube IFrame Player API.
// It does not extract private stream URLs, bypass DRM, or scrape content:
// the player depends on YouTube's own player runtime. A YouTube URL is handled
// as a web-viewable video stream rather than as a local audio file.

const YT_IFRAME_URL = 'https://www.youtube.com/iframe_api';
const YT_URL_PATTERN = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
const YT_CAPTURE_PATTERN = /[?&]v=([a-zA-Z0-9_-]{11})/i;

function isYouTubeUrl(url) {
  const candidate = String(url || '').trim();
  return YT_URL_PATTERN.test(candidate);
}

function extractYouTubeId(url) {
  const candidate = String(url || '').trim();
  const match = candidate.match(YT_CAPTURE_PATTERN);
  if (match && match[1]) return match[1];
  return null;
}

function buildEmbedUrl(id, { autoplay = true, mute = false } = {}) {
  const qs = [
    `autoplay=${autoplay ? 1 : 0}`,
    'rel=0',
    'modestbranding=1',
    'controls=0',
    'enablejsapi=1'
  ];
  if (mute) qs.push('mute=1');
  return `https://www.youtube.com/embed/${id}?${qs.join('&')}`;
}

export class YouTubeService {
  constructor() {
    this.iframeApiScript = null;
    this.iframeApiReady = false;
    this.players = new Map();
    this.nextId = 0;
  }

  isYouTubeUrl(url) {
    return isYouTubeUrl(url);
  }



  async loadYouTubeUrl(url, player) {
    if (!this.isYouTubeUrl(url)) {
      throw new Error('That is not a recognised YouTube URL.');
    }

    const id = this.constructor.extractId(url);
    if (!id) {
      throw new Error('Could not extract a YouTube video id from that URL.');
    }

    const mount = player && player.elements && player.elements.container
      ? player.elements.container
      : document.body;

    return this._instantiatePlayer(id, mount);
  }

  _ensureIframeApi() {
    if (this.iframeApiReady) return Promise.resolve();
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        this.iframeApiReady = true;
        return resolve();
      }

      if (!this.iframeApiScript) {
        this.iframeApiScript = document.createElement('script');
        this.iframeApiScript.src = YT_IFRAME_URL;
        document.head.appendChild(this.iframeApiScript);
      }

      const originalHandler = window.onYouTubeIframeAPIReady || (() => {});
      let handlerCalled = false;

      window.onYouTubeIframeAPIReady = () => {
        handlerCalled = true;
        originalHandler();
        this.iframeApiReady = true;
        resolve();
      };

      window.addEventListener('load', () => {
        if (!handlerCalled && this.iframeApiScript && this.iframeApiScript.readyState === 'complete') {
          this.iframeApiReady = true;
          resolve();
        }
      }, { once: true });
    });
  }

  async _instantiatePlayer(id, mount) {
    await this._ensureIframeApi();

    const container = document.createElement('div');
    container.id = `yt-embed-${++this.nextId}`;
    container.className = 'yt-embed-container';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'YouTube video player');
    container.setAttribute('tabindex', '0');
    container.setAttribute('width', '100%');
    container.setAttribute('height', '100%');
    container.style.background = 'var(--glass-fill-20)';
    container.style.borderRadius = 'var(--radius-md)';
    container.style.overflow = 'hidden';
    container.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.28)';

    const mountTarget = mount && mount.appendChild
      ? mount
      : document.body;

    mountTarget.appendChild(container);

    const onReady = (event) => {
      if (!container.contains(document.activeElement)) {
        container.focus();
      }
      if (!this.players.has(container.id)) {
        this.players.set(container.id, event.target);
      }
    };

    const player = new YT.Player(container.id, {
      playerVars: {
        autoplay: 1,
        rel: 0,
        modestbranding: 1,
        controls: 0,
        enablejsapi: 1,
        playsinline: 1
      },
      events: {
        onReady: onReady
      }
    });

    container.addEventListener('click', () => {
      if (player.getPlayerState() === YT.PlayerState.PLAYING) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        player.destroy();
        reject(new Error('YouTube player failed to initialise within 8 seconds.'));
      }, 8000);

      const finish = (status) => {
        clearTimeout(timeout);
        if (status === 'ready') resolve(player);
        else if (status === 'error') {
          player.destroy();
          reject(new Error('YouTube player did not become ready.'));
        }
      };

      const poll = () => {
        const state = player.getPlayerState();
        if (state === YT.PlayerState.READY) {
          finish('ready');
          return;
        }
        if (state === YT.PlayerState.CUED || state === YT.PlayerState.PLAYING || state === YT.PlayerState.PAUSED) {
          finish('ready');
          return;
        }
        if (player.getPlayerState() === YT.PlayerState.ENDED) {
          finish('ready');
          return;
        }
        setTimeout(poll, 400);
      };

      poll();
    });
  }

  getPlayer(containerId) {
    return this.players.get(containerId) || null;
  }

  destroyPlayer(containerId) {
    const player = this.players.get(containerId);
    if (player) {
      player.destroy();
      this.players.delete(containerId);
      return true;
    }
    return false;
  }

  clearPlayers() {
    for (const [id, player] of this.players) {
      player.destroy();
    }
    this.players.clear();
  }
  static extractId(url) {
    return extractYouTubeId(url);
  }

  getVideoUrl(id, options) {
    return buildEmbedUrl(id, options);
  }
}