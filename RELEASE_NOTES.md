# BluePeak Vinyl Player v1.3.0

## Added

- Google Colab native FFmpeg exporter for long-form video creation.
- Background image upload workflow with grooved vinyl overlay.
- Chapter/timestamp panel, theme selection, snow/fireworks options, resolution, FPS, looping, and Google Drive output controls.

## Attribution

- BluePeak Vinyl Player contributors and Codex-assisted implementation.
- Colab workflow uses native FFmpeg for long-running exports instead of browser FFmpeg WASM.

# BluePeak Vinyl Player v1.2.0

## Added

- Low-memory streaming video export using `MediaRecorder`.
- Vinyl-and-chapters export layout with active chapter highlighting.
- Export uses the default `images/vinyl.png` artwork instead of track cover art.
- Export output is streamed as WebM instead of buffering every frame in FFmpeg WASM.

## Improved

- Video export no longer stores a full frame sequence in the FFmpeg virtual filesystem.
- Export cleanup stops canvas/audio capture tracks after completion or cancellation.

## Attribution

- BluePeak Vinyl Player contributors, including Codex-assisted implementation.
- Liquid glass styling inspired by the project’s YTXTube reference integration.

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
