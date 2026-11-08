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
        const { width, height, label, fps = 30 } = opts;
        if (this.isExporting) return;
        this.isExporting = true;
        this.cancelRequested = false;
        this.fps = fps;

        // Prefer the bounded real-time recorder. It avoids materializing every
        // JPEG frame in the FFmpeg WASM filesystem and is substantially lighter
        // for long exports. The legacy FFmpeg path remains as a fallback.
        if (typeof MediaRecorder !== 'undefined' && HTMLCanvasElement.prototype.captureStream) {
            await this.startStreamingExport({ width, height, label, fps });
            return;
        }

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
                await ffmpeg.load(this.player._ffmpegCoreURLs());
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

                // Render + encode + write frames through a bounded pipeline:
                // canvas.toBlob() snapshots the bitmap at call time, so the next
                // frame can be rendered while previous frames are still being
                // JPEG-encoded and copied into the FFmpeg filesystem.
                const PIPELINE_WINDOW = 6;
                let writtenInTrack = 0;
                let nextFrameToRender = 0;
                let firstError = null;
                const activeTasks = new Set();

                const encodeAndWrite = async (frameName) => {
                    const blob = await new Promise(resolve =>
                        this.canvas.toBlob(resolve, 'image/jpeg', 0.7)
                    );
                    if (!blob) throw new Error(`Failed to encode frame ${frameName}`);
                    const buffer = await blob.arrayBuffer();
                    await ffmpeg.writeFile(frameName, new Uint8Array(buffer));
                };

                while (nextFrameToRender < frameCount && !this.cancelRequested) {
                    const time = nextFrameToRender / this.fps;
                    this.player.renderToCanvas(this.ctx, this.canvas.width, this.canvas.height, time);
                    const frameName = `frame_${String(renderedFrames).padStart(6, '0')}.jpg`;
                    renderedFrames++;
                    nextFrameToRender++;

                    const task = encodeAndWrite(frameName)
                        .then(() => { writtenInTrack++; })
                        .catch(e => { if (!firstError) firstError = e; })
                        .finally(() => activeTasks.delete(task));
                    activeTasks.add(task);

                    // Keep at most PIPELINE_WINDOW frames in flight (bounds memory)
                    if (activeTasks.size >= PIPELINE_WINDOW) {
                        await Promise.race(activeTasks);
                        if (firstError) break;
                        this._setProgress(Math.round((renderedFrames / totalFrames) * 85));
                        this._setStatus(`Rendering frames... ${renderedFrames}/${totalFrames}`);
                    }
                }

                // Drain remaining in-flight frames
                await Promise.all(activeTasks);
                if (firstError) throw firstError;

                if (!this.cancelRequested && writtenInTrack > 0) {
                    this._setProgress(Math.round((renderedFrames / totalFrames) * 85));
                    this._setStatus(`Rendering frames... ${renderedFrames}/${totalFrames}`);
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

    async startStreamingExport({ width, height, label, fps }) {
        this.isExporting = true;
        this.cancelRequested = false;
        this.fps = fps;
        const modal = document.getElementById('exportModal');
        if (modal) modal.style.display = 'none';
        const overlay = document.getElementById('exportProgressOverlay');
        if (overlay) overlay.style.display = 'flex';
        this._setProgress(0);
        this._setRes(`${label} • ${fps}fps • streaming`);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        const vinylImage = new Image();
        vinylImage.src = new URL('images/vinyl.png', document.baseURI).href;
        await new Promise(resolve => { vinylImage.onload = resolve; vinylImage.onerror = resolve; });
        this.player.exportVinylImage = vinylImage;
        const canvasStream = canvas.captureStream(fps);
        const queue = this.player.playlistManager.queue;
        if (!queue.length) {
            this.player.showNotification('Playlist is empty!', 'error');
            this._finishExport();
            return;
        }

        const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
        const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
        if (!mimeType) {
            this.player.showNotification('Streaming video export is not supported in this browser.', 'error');
            this._finishExport();
            return;
        }

        let audioStream = null;
        let recorder;
        const chunks = [];
        const cancelBtn = document.getElementById('exportCancelBtn');
        const cancel = () => { this.cancelRequested = true; };
        cancelBtn?.addEventListener('click', cancel, { once: true });
        const totalDuration = queue.reduce((sum, track) => sum + (Number(track.duration) || 0), 0) || 1;
        let elapsed = 0;
        let renderFrame;

        try {
            this.player.pause();
            for (const track of queue) {
                await this.player.prepareTrackForExport(track);
                const media = track.isVideo ? this.player.localVideo : this.player.localAudio;
                if (!audioStream) {
                    const captured = media.captureStream?.();
                    if (!captured) throw new Error('This browser cannot capture audio for export.');
                    audioStream = new MediaStream(captured.getAudioTracks());
                    audioStream.getTracks().forEach(track => canvasStream.addTrack(track));
                    recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 });
                    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
                    recorder.start(1000);
                }

                this.player.exportMode = true;
                this._setTrack(track.title || 'Untitled');
                this._setStatus('Streaming video…');
                const start = performance.now();
                await media.play();
                await new Promise((resolve, reject) => {
                    const tick = () => {
                        if (this.cancelRequested) { resolve(); return; }
                        const current = Number.isFinite(media.currentTime) ? media.currentTime : ((performance.now() - start) / 1000);
                        this.player.renderToCanvas(this.ctx, width, height, current);
                        const done = media.ended || current >= (media.duration - 0.05);
                        this._setProgress(Math.min(94, Math.round(((elapsed + current) / totalDuration) * 94)));
                        if (done) { resolve(); return; }
                        renderFrame = requestAnimationFrame(tick);
                    };
                    media.addEventListener('error', () => reject(new Error('Unable to read media during export.')), { once: true });
                    tick();
                });
                cancelAnimationFrame(renderFrame);
                media.pause();
                elapsed += Number(track.duration) || media.duration || 0;
                this.player.cleanupTrack(track);
                if (this.cancelRequested) break;
            }

            this.player.exportMode = false;
            this.player.exportVinylImage = null;
            recorder?.stop();
            await new Promise(resolve => recorder ? recorder.addEventListener('stop', resolve, { once: true }) : resolve());
            if (this.cancelRequested) throw new Error('Export cancelled.');
            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vinyl_export_${height}p.webm`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            this._setProgress(100);
            this._setStatus('Done!');
            this.player.showNotification('Streaming export complete!', 'success');
        } catch (error) {
            this.player.exportMode = false;
            this.player.exportVinylImage = null;
            recorder?.stop();
            console.error('Streaming export failed:', error);
            this.player.showNotification(error.message === 'Export cancelled.' ? error.message : `Export failed: ${error.message}`, 'error');
        } finally {
            canvasStream.getTracks().forEach(track => track.stop());
            audioStream?.getTracks().forEach(track => track.stop());
            this._finishExport();
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
