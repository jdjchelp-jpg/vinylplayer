export class ExportEngine {
    constructor(player) {
        this.player = player;
        this.isExporting = false;
        this.cancelRequested = false;
        this.fps = 30;
        this.canvas = null;
        this.ctx = null;
    }

    /**
     * Show the export resolution selection modal.
     */
    showExportModal() {
        const modal = document.getElementById('exportModal');
        if (modal) modal.style.display = 'flex';
    }

    /**
     * Start export with chosen resolution. Called from the resolution grid buttons.
     * @param {{ width: number, height: number, label: string }} opts
     */
    async startExport(opts) {
        const { width, height, label } = opts;
        if (this.isExporting) return;
        this.isExporting = true;
        this.cancelRequested = false;
        this.fps = 30;

        // Set up off-screen canvas at chosen resolution
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');

        // Close the resolution modal
        const modal = document.getElementById('exportModal');
        if (modal) modal.style.display = 'none';

        // Show progress overlay
        const overlay = document.getElementById('exportProgressOverlay');
        if (overlay) overlay.style.display = 'flex';
        this._setProgress(0);
        this._setStatus('Loading FFmpeg...');
        this._setRes(`${label} • ${this.fps}fps`);
        this._setTrack('');

        // Wire cancel button
        const cancelBtn = document.getElementById('exportCancelBtn');
        const onCancel = () => { this.cancelRequested = true; };
        if (cancelBtn) cancelBtn.addEventListener('click', onCancel, { once: true });

        const ffmpeg = this.player.ffmpeg;
        try {
            if (!ffmpeg.loaded) {
                await ffmpeg.load({
                    coreURL: "wasm/ffmpeg-core.js",
                    wasmURL: "wasm/ffmpeg-core.wasm",
                });
            }
        } catch (e) {
            console.error("FFmpeg load failed:", e);
            this.player.showNotification("Failed to load FFmpeg: " + e.message, "error");
            this._finishExport();
            return;
        }

        const queue = this.player.playlistManager.queue;
        if (queue.length === 0) {
            this.player.showNotification("Playlist is empty!", "error");
            this._finishExport();
            return;
        }

        // Pause playback
        this.player.pause();

        // Calculate total duration for progress
        let totalDuration = 0;
        const trackDurations = [];
        for (let i = 0; i < queue.length; i++) {
            const track = queue[i];
            await this.player.prepareTrackForExport(track);
            if (typeof track.duration !== 'number' || isNaN(track.duration) || track.duration <= 0) {
                this.player.showNotification(`Invalid duration for: ${track.title}`, "error");
                this._finishExport();
                return;
            }
            trackDurations.push(track.duration);
            totalDuration += track.duration;
        }

        const totalFrames = Math.max(1, Math.round(totalDuration * this.fps));
        let renderedFrames = 0;
        let completedDuration = 0;

        try {
            const audioFiles = [];

            for (let i = 0; i < queue.length; i++) {
                if (this.cancelRequested) {
                    this.player.showNotification("Export cancelled.", "error");
                    this._finishExport();
                    return;
                }

                const track = queue[i];
                const duration = trackDurations[i];
                const frameCount = Math.max(1, Math.round(duration * this.fps));

                this._setTrack(`Track ${i + 1}/${queue.length}: ${track.title || 'Unknown'}`);

                // Capture audio → WAV
                this._setStatus(`Capturing audio for track ${i + 1}...`);
                const audioData = await this.player.captureTrackAudio(track);
                const audioFileName = `audio_${i}.wav`;
                await ffmpeg.writeFile(audioFileName, audioData);
                audioFiles.push(audioFileName);

                // Render frames
                for (let frame = 0; frame < frameCount; frame++) {
                    if (this.cancelRequested) break;

                    const time = frame / this.fps;
                    this.player.renderToCanvas(this.ctx, this.canvas.width, this.canvas.height, time);

                    const blob = await new Promise(resolve =>
                        this.canvas.toBlob(resolve, 'image/jpeg', 0.7)
                    );
                    const buffer = await blob.arrayBuffer();
                    const frameName = `frame_${String(renderedFrames).padStart(6, '0')}.jpg`;
                    await ffmpeg.writeFile(frameName, new Uint8Array(buffer));
                    renderedFrames++;

                    // Update progress every 15 frames to avoid UI thrash
                    if (renderedFrames % 15 === 0 || frame === frameCount - 1) {
                        const pct = Math.round((renderedFrames / totalFrames) * 85);
                        this._setProgress(pct);
                        this._setStatus(`Rendering frames... ${renderedFrames}/${totalFrames}`);
                    }
                }

                // Cleanup track resources to free memory
                this.player.cleanupTrack(track);

                completedDuration += duration;
            }

            if (this.cancelRequested) {
                this.player.showNotification("Export cancelled.", "error");
                // Cleanup frames
                for (let i = 0; i < renderedFrames; i++) {
                    await ffmpeg.deleteFile(`frame_${String(i).padStart(6, '0')}.jpg`).catch(() => {});
                }
                for (const f of audioFiles) await ffmpeg.deleteFile(f).catch(() => {});
                this._finishExport();
                return;
            }

            // Cleanup the last track's resources if still set
            if (this.player.currentExportTrack) {
                this.player.cleanupTrack(this.player.currentExportTrack);
                this.player.currentExportTrack = null;
            }

            // Create audio list file
            let audioListContent = "";
            for (const file of audioFiles) {
                audioListContent += `file '${file}'\n`;
            }
            await ffmpeg.writeFile("audio_list.txt", new TextEncoder().encode(audioListContent));

            // Mux video + audio
            this._setProgress(88);
            this._setStatus("Encoding video...");
            await ffmpeg.exec([
                '-f', 'concat', '-safe', '0', '-i', 'audio_list.txt',
                '-framerate', String(this.fps),
                '-i', 'frame_%06d.jpg',
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'ultrafast',
                '-crf', '28',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-map', '0:a',
                '-map', '1:v',
                '-shortest',
                'output.mp4'
            ]);

            if (this.cancelRequested) {
                this.player.showNotification("Export cancelled.", "error");
                this._finishExport();
                return;
            }

            // Download
            this._setProgress(95);
            this._setStatus("Preparing download...");
            const data = await ffmpeg.readFile('output.mp4');
            const outBlob = new Blob([data.buffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(outBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vinyl_export_${Math.round(this.canvas.height)}p.mp4`;
            a.click();
            URL.revokeObjectURL(url);

            this._setProgress(100);
            this._setStatus("Done!");
            this.player.showNotification("Export complete! Downloading...", "success");

            // Cleanup all frames and audio files
            for (let i = 0; i < renderedFrames; i++) {
                await ffmpeg.deleteFile(`frame_${String(i).padStart(6, '0')}.jpg`).catch(() => {});
            }
            for (const f of audioFiles) await ffmpeg.deleteFile(f).catch(() => {});
            await ffmpeg.deleteFile('audio_list.txt').catch(() => {});
            await ffmpeg.deleteFile('output.mp4').catch(() => {});

        } catch (error) {
            console.error("Export failed:", error);
            this.player.showNotification("Export Failed: " + error.message, "error");
        } finally {
            // Delay hiding overlay so user sees "Done!"
            setTimeout(() => this._finishExport(), 1500);
        }
    }

    _finishExport() {
        this.isExporting = false;
        this.cancelRequested = false;
        const overlay = document.getElementById('exportProgressOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    _setProgress(pct) {
        const bar = document.getElementById('exportProgressBar');
        if (bar) bar.style.width = `${pct}%`;
    }

    _setStatus(msg) {
        const el = document.getElementById('exportProgressStatus');
        if (el) el.textContent = msg;
    }

    _setRes(msg) {
        const el = document.getElementById('exportProgressRes');
        if (el) el.textContent = msg;
    }

    _setTrack(msg) {
        const el = document.getElementById('exportProgressTrack');
        if (el) el.textContent = msg;
    }
}
