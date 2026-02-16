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

        try {
            let totalFrameCount = 0;
            const frameRate = this.fps;

            for (let trackIndex = 0; trackIndex < queue.length; trackIndex++) {
                const track = queue[trackIndex];
                console.log(`Exporting track ${trackIndex + 1}/${queue.length}: ${track.title}`);

                // Update UI for export context
                this.player.elements.textTitle.textContent = track.title;
                this.player.elements.textAuthor.textContent = track.author || "Unknown";

                // Get track duration
                const duration = track.duration || 30; // 30s for test if unknown
                const trackFrames = Math.floor(duration * frameRate);

                for (let i = 0; i < trackFrames; i++) {
                    const currentTime = i / frameRate;
                    this.player.renderToCanvas(this.ctx, 3840, 2160, currentTime);

                    // Convert canvas to buffer and write to FFmpeg
                    const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/jpeg', 0.8));
                    const buffer = await blob.arrayBuffer();

                    const frameName = `frame_${String(totalFrameCount).padStart(6, '0')}.jpg`;
                    await ffmpeg.writeFile(frameName, new Uint8Array(buffer));

                    totalFrameCount++;

                    if (totalFrameCount % 100 === 0) {
                        console.log(`Rendered ${totalFrameCount} frames...`);
                    }
                }
            }

            // Mux frames into video
            console.log("Muxing video...");
            await ffmpeg.exec([
                '-framerate', String(frameRate),
                '-i', 'frame_%06d.jpg',
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-preset', 'ultrafast',
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

            // Cleanup frames
            for (let i = 0; i < totalFrameCount; i++) {
                const frameName = `frame_${String(i).padStart(6, '0')}.jpg`;
                await ffmpeg.deleteFile(frameName);
            }

        } catch (error) {
            console.error("Export failed:", error);
            this.player.showNotification("Export Failed: " + error.message, "error");
        } finally {
            this.isExporting = false;
        }
    }
}
