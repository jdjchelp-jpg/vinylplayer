export class ExportEngine {
    constructor(player) {
        this.player = player;
        this.isExporting = false;
        this.fps = 60;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 3840;
        this.canvas.height = 2160;
        this.ctx = this.canvas.getContext('2d');
    }

    async exportPlaylist() {
        if (this.isExporting) return;
        this.isExporting = true;

        this.player.showNotification("Starting 4K Video Export...", "success");

        const ffmpeg = this.player.ffmpeg;
        if (!ffmpeg.loaded) {
            await ffmpeg.load({
                coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
            });
        }

        const queue = this.player.playlistManager.queue;
        if (queue.length === 0) {
            this.player.showNotification("Playlist is empty!", "error");
            this.isExporting = false;
            return;
        }

        // Save original player state (optional)
        const originalState = {
            isPlaying: this.player.isPlaying,
            isLocalFile: this.player.isLocalFile,
            isVideo: this.player.isVideo,
            currentTrackIndex: this.player.playlistManager.currentTrackIndex,
        };

        // Pause playback
        this.player.pause();

        try {
            let totalFrameCount = 0;
            const audioFiles = [];

            for (let i = 0; i < queue.length; i++) {
                const track = queue[i];
                console.log(`Preparing track ${i + 1}/${queue.length}: ${track.title}`);

                // Prepare track: load metadata, set player state, get duration, album cover
                await this.player.prepareTrackForExport(track);

                // Validate duration
                if (typeof track.duration !== 'number' || isNaN(track.duration) || track.duration <= 0) {
                    throw new Error(`Invalid duration for track: ${track.title}`);
                }

                // Capture audio and write to FFmpeg
                const audioData = await this.player.captureTrackAudio(track);
                const audioFileName = `audio_${i}.wav`;
                await ffmpeg.writeFile(audioFileName, audioData);
                audioFiles.push(audioFileName);

                // Render frames for this track
                const duration = track.duration;
                const frameCount = Math.max(1, Math.round(duration * this.fps));
                console.log(`Rendering ${frameCount} frames for track ${i+1} (duration: ${duration}s)`);

                for (let frame = 0; frame < frameCount; frame++) {
                    const time = frame / this.fps;
                    this.player.renderToCanvas(this.ctx, 3840, 2160, time);

                    const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/jpeg', 0.8));
                    const buffer = await blob.arrayBuffer();
                    const frameName = `frame_${String(totalFrameCount).padStart(6, '0')}.jpg`;
                    await ffmpeg.writeFile(frameName, new Uint8Array(buffer));
                    totalFrameCount++;

                    if (totalFrameCount % 100 === 0) {
                        console.log(`Rendered ${totalFrameCount} frames...`);
                    }
                }

                // Cleanup track resources to free memory
                this.player.cleanupTrack(track);
            }

            // Cleanup the last track's resources if still set
            if (this.player.currentExportTrack) {
                this.player.cleanupTrack(this.player.currentExportTrack);
                this.player.currentExportTrack = null;
            }

            // Create audio list file for concatenation
            let audioListContent = "";
            for (const file of audioFiles) {
                audioListContent += `file '${file}'\n`;
            }
            await ffmpeg.writeFile("audio_list.txt", new TextEncoder().encode(audioListContent));

            // Run FFmpeg to concatenate audio and mux with video
            console.log("Muxing video with audio...");
            await ffmpeg.exec([
                '-f', 'concat', '-safe', '0', '-i', 'audio_list.txt',
                '-framerate', String(this.fps),
                '-i', 'frame_%06d.jpg',
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'ultrafast',
                '-c:a', 'aac',
                '-map', '0:a',
                '-map', '1:v',
                '-shortest',
                'output.mp4'
            ]);

            // Read finished file
            const data = await ffmpeg.readFile('output.mp4');
            const blob = new Blob([data.buffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'vinyl_export_4k.mp4';
            a.click();

            this.player.showNotification("Export Complete!", "success");

            // Cleanup frames and audio files
            for (let i = 0; i < totalFrameCount; i++) {
                const frameName = `frame_${String(i).padStart(6, '0')}.jpg`;
                await ffmpeg.deleteFile(frameName).catch(e => {});
            }
            for (const file of audioFiles) {
                await ffmpeg.deleteFile(file).catch(e => {});
            }
            await ffmpeg.deleteFile('audio_list.txt').catch(e => {});

        } catch (error) {
            console.error("Export failed:", error);
            this.player.showNotification("Export Failed: " + error.message, "error");
        } finally {
            this.isExporting = false;
            // Optionally restore original state (not implemented)
        }
    }
}
