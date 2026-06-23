# BluePeak Vinyl Player 🎵

A web-based vinyl record player interface that streams music from YouTube, local files, and direct audio URLs. Designed with a focus on privacy, offline capability, and a retro listening experience.

![Vinyl Player](images/screenshot-extra-3.png)

## 🌐 Try It Online

The app is hosted at: **https://bluepeakvinylplayer.vercel.app/**

> ⚠️ **Note:** The hosted version may encounter browser security restrictions (CORS, iframe origin mismatches, GDPR consent blocks) that prevent YouTube video playback. For the best experience, **run this project locally**.

## 🚀 How to Run Locally

Running locally bypasses most browser security restrictions and gives you full control.

### Option 1: Quick start with npx (no install needed)

```bash
npx http-server . -p 8080 -c-1
```

Then open **http://localhost:8080** in your browser.

### Option 2: Install and run with npm

```bash
npm install
npm start
```

Then open **http://localhost:8080**.

### Option 3: Any static file server

```bash
# Python
python3 -m http.server 8080

# PHP
php -S localhost:8080
```

## 🔧 Architecture & How It Works

### Audio-First Strategy

This project uses an **Audio-First** strategy to avoid the common `postMessage` origin errors associated with the YouTube IFrame API.

**The Problem:** Browsers block communication between your domain and YouTube's embedded widgets due to strict security policies (Cross-Origin Isolation, Consent Mode, and browser extension interference). This causes the "postMessage" errors you may see in the console.

**The Solution:** Instead of embedding a YouTube iframe (which requires complex permission handshakes), the app now:

1. **Prioritizes Direct Audio Extraction** — Uses public APIs (like Cobalt) to fetch direct MP3 streams, avoiding the iframe entirely
2. **Bypasses Iframes** — No `postMessage` needed; just standard HTTP requests
3. **Fallback Chain** — If audio extraction fails, falls back to the YouTube iframe with consent handling
4. **Consent Modal** — First-time users see a consent modal; choices are remembered in localStorage

### Project Structure

```
├── index.html              # Main app entry point
├── css/
│   └── styles.css          # All styling (vinyl, animations, glass mode)
├── js/
│   ├── main.js             # App bootstrap
│   ├── services/
│   │   ├── VinylPlayer.js  # Core player logic, UI, queue management
│   │   ├── YouTubeService.js # YouTube iframe API + audio fallback
│   │   ├── PlaylistManager.js # Queue/playlist data management
│   │   ├── ExportEngine.js # 4K video export
│   │   ├── HolidayManager.js # Holiday-themed music detection
│   │   ├── i18n.js         # Internationalization (15 languages)
│   │   └── ...
│   ├── ffmpeg.js           # FFmpeg WASM for audio processing
│   └── jsmediatags.js      # Local file metadata reading
├── manifest.json           # PWA manifest
└── service-worker.js       # Offline support
```

### Key Features

- **🎵 Multiple Sources** — YouTube URLs, local files (MP3, FLAC, WAV, OGG, M4B), direct audio URLs
- **💿 Vinyl Record UI** — Animated vinyl with rotating cover art, draggable tone arm
- **📋 Queue Management** — Drag-and-drop reorder, remove tracks, persistent queue
- **🎚️ Audio Processing** — Built-in FFmpeg for metadata extraction, MP3 conversion, trimming
- **📺 4K Video Export** — Export animated vinyl visualizations with audio
- **🔒 Privacy Mode** — Audio-only playback via Cobalt API (no YouTube cookies/tracking)
- **🌍 i18n** — 15 languages supported
- **📱 PWA Ready** — Install as a standalone app on desktop/mobile
- **🔄 Playback Speed** — 0.25x to 5x speed control
- **📖 Chapter Support** — Audiobook chapter navigation for M4B files

## 🛠️ Development

### Prerequisites

- A modern browser (Chrome, Firefox, Edge, Safari)
- Node.js (optional, for npm-based serving)

### Local Development

```bash
# Clone the repo
git clone <your-repo-url>
cd vinyl-player

# Serve locally
npx http-server . -p 8080 -c-1
```

### Troubleshooting YouTube Playback

If YouTube tracks fail to play:

1. **Check the browser console** (F12 → Console) for error messages
2. **Try incognito/private mode** — Browser extensions (especially media downloaders) often break YouTube's iframe API
3. **Run locally** — `npx http-server . -p 8080` eliminates most CORS and origin issues
4. **Disable web security** (dev only) — Launch Chrome with:
   ```bash
   chrome.exe --disable-web-security --user-data-dir="C:/ChromeDevSession"
   ```
   ⚠️ Only do this in a dedicated test session. Do not browse normally with this flag.

## 📜 License

This project is licensed under the **GNU General Public License v3.0** (GPLv3). See the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Feel free to:

- Open an issue for bugs or feature requests
- Submit a pull request with improvements
- Add more audio extraction proxies to `YouTubeService.js`
- Improve the UI or add new visual effects

## 🔗 Links

- **Live App:** https://bluepeakvinylplayer.vercel.app/
- **Report Issue:** https://forms.gle/xySxypnKc1x5aVZH6
