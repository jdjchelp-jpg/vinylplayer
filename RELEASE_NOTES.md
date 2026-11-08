# BluePeak Vinyl Player v1.1.0

## Added

- Tauri desktop packaging for Windows, macOS, and Linux.
- Draft release workflow triggered by `v*` tags.
- MP3 conversion with source metadata and M4B chapter timestamps.
- Active chapter highlighting based on the real playback position.
- YouTube playlist import and improved playlist queue handling.
- Settings-based supported-format guide with expanded language choices.
- Memory cleanup for FFmpeg workers and temporary conversion files.

## Improved

- Glass settings and supported-format panels.
- M4A support is listed for both audio and audiobook use cases.
- Large media and FFmpeg runtime files are no longer retained by the service worker cache.

## Removed

- The old standalone Supported Formats menu entry.
- Legacy duplicate lyrics/up-next controls.
- Startup caching of the large FFmpeg WASM runtime.
