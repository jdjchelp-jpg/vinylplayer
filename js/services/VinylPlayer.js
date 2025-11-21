import { PlaylistManager } from './PlaylistManager.js';

export class VinylPlayer {
    constructor() {
        this.playlistManager = new PlaylistManager();
        this.player = null;
        this.isPlaying = false;
        this.isDragging = false;
        this.volume = 100;

        this.elements = {
            vinylRecord: document.querySelector('.vinyl-record'),
            vinylCover: document.querySelector('.vinyl-cover'),
            toneArm: document.querySelector('.tonearm'),
            playBtn: document.getElementById('playBtn'),
            volumeSlider: document.getElementById('volumeSlider'),
            progressBar: document.getElementById('progressBar'),
            currentTime: document.getElementById('currentTime'),
            duration: document.getElementById('duration'),
            textTitle: document.querySelector('.text-title'),
            textAuthor: document.querySelector('.text-author'),
            urlModal: document.getElementById('urlModal'),
            urlInput: document.getElementById('urlInput'),
            loadUrlBtn: document.getElementById('loadUrlBtn'),
            urlLoadBtn: document.getElementById('urlLoadBtn'),
            urlCancelBtn: document.getElementById('urlCancelBtn'),
            notification: document.getElementById('notification'),
            notificationMessage: document.querySelector('.notification-message'),
            notificationClose: document.querySelector('.notification-close'),
            menuToggle: document.querySelector('.menu-toggle'),
            menuItems: document.querySelector('.menu-items'),
            settingsModal: document.getElementById('settingsModal'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsCloseBtn: document.getElementById('settingsCloseBtn'),
            showVideoToggle: document.getElementById('showVideoToggle'),
            container: document.querySelector('.container')
        };

        this.init();
    }

    init() {
        this.loadYouTubeAPI();
        this.setupEventListeners();
        this.setupToneArmDrag();
    }

    loadYouTubeAPI() {
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = () => {
            this.player = new YT.Player('vinylTrack', {
                height: '0',
                width: '0',
                playerVars: {
                    'playsinline': 1,
                    'controls': 0,
                    'disablekb': 1
                },
                events: {
                    'onReady': this.onPlayerReady.bind(this),
                    'onStateChange': this.onPlayerStateChange.bind(this),
                    'onError': this.onPlayerError.bind(this)
                }
            });
        };
    }

    onPlayerReady(event) {
        console.log("Player Ready");
        this.setVolume(this.volume);
    }

    onPlayerStateChange(event) {
        if (event.data == YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.startRotation();
            this.moveToneArmToRecord();
            this.startProgressLoop();
            this.updatePlayButtonIcon(true);
        } else if (event.data == YT.PlayerState.PAUSED) {
            this.isPlaying = false;
            this.stopRotation();
            this.updatePlayButtonIcon(false);
        } else if (event.data == YT.PlayerState.ENDED) {
            this.isPlaying = false;
            this.stopRotation();
            this.updatePlayButtonIcon(false);
            this.playNext();
        }
    }

    onPlayerError(event) {
        this.showNotification("Error playing video. It might be restricted.", "error");
        this.playNext();
    }

    setupEventListeners() {
        // Menu Toggle
        if (this.elements.menuToggle && this.elements.menuItems) {
            this.elements.menuToggle.addEventListener('click', () => {
                this.elements.menuItems.classList.toggle('active');
            });
        }

        // Description Toggle (Question Mark)
        const descToggle = document.querySelector('.desc-toggle');
        const descItems = document.querySelector('.desc-items');
        if (descToggle && descItems) {
            descToggle.addEventListener('click', () => {
                descItems.classList.toggle('active');
            });
        }

        // Feedback Button
        const feedbackBtn = document.getElementById('feedbackBtn');
        if (feedbackBtn) {
            feedbackBtn.addEventListener('click', () => {
                window.open("https://forms.gle/xySxypnKc1x5aVZH6", "_blank");
            });
        }

        // Download Button
        const downloadBtn = document.getElementById('downloadBtn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                this.downloadPlaylist();
            });
        }

        // Settings
        if (this.elements.settingsBtn) {
            this.elements.settingsBtn.addEventListener('click', () => {
                this.elements.settingsModal.style.display = 'flex';
                this.elements.menuItems.classList.remove('active'); // Close menu
            });
        }

        if (this.elements.settingsCloseBtn) {
            this.elements.settingsCloseBtn.addEventListener('click', () => {
                this.elements.settingsModal.style.display = 'none';
            });
        }

        if (this.elements.showVideoToggle) {
            this.elements.showVideoToggle.addEventListener('change', (e) => {
                this.toggleVideoMode(e.target.checked);
            });
        }

        // Volume
        if (this.elements.volumeSlider) {
            this.elements.volumeSlider.addEventListener('input', (e) => {
                this.setVolume(e.target.value);
            });
        }

        // URL Loading
        if (this.elements.loadUrlBtn) {
            this.elements.loadUrlBtn.addEventListener('click', () => {
                this.elements.urlModal.style.display = 'flex';
            });
        }

        if (this.elements.urlLoadBtn) {
            this.elements.urlLoadBtn.addEventListener('click', () => {
                const url = this.elements.urlInput.value;
                this.loadFromUrl(url);
                this.elements.urlModal.style.display = 'none';
                this.elements.urlInput.value = '';
            });
        }

        if (this.elements.urlCancelBtn) {
            this.elements.urlCancelBtn.addEventListener('click', () => {
                this.elements.urlModal.style.display = 'none';
            });
        }

        // Playback Controls
        if (this.elements.playBtn) {
            this.elements.playBtn.addEventListener('click', () => this.togglePlay());
        }

        if (document.getElementById('nextBtn')) {
            document.getElementById('nextBtn').addEventListener('click', () => this.playNext());
        }

        if (document.getElementById('prevBtn')) {
            document.getElementById('prevBtn').addEventListener('click', () => this.playPrevious());
        }

        if (this.elements.progressBar) {
            this.elements.progressBar.addEventListener('input', (e) => {
                const val = e.target.value;
                if (this.player && this.player.getDuration) {
                    const duration = this.player.getDuration();
                    this.player.seekTo(duration * (val / 100), true);
                }
            });
        }

        // Notification
        if (this.elements.notificationClose) {
            this.elements.notificationClose.addEventListener('click', () => {
                this.elements.notification.classList.remove('show');
            });
        }

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault(); // Prevent scrolling
                this.togglePlay();
            } else if (e.code === 'ArrowUp') {
                this.setVolume(Math.min(this.volume + 5, 100));
                if (this.elements.volumeSlider) this.elements.volumeSlider.value = this.volume;
            } else if (e.code === 'ArrowDown') {
                this.setVolume(Math.max(this.volume - 5, 0));
                if (this.elements.volumeSlider) this.elements.volumeSlider.value = this.volume;
            } else if (e.code === 'ArrowRight') {
                if (this.player && this.player.getCurrentTime) {
                    this.player.seekTo(this.player.getCurrentTime() + 5, true);
                }
            } else if (e.code === 'ArrowLeft') {
                if (this.player && this.player.getCurrentTime) {
                    this.player.seekTo(this.player.getCurrentTime() - 5, true);
                }
            }
        });
    }

    setupToneArmDrag() {
        const arm = this.elements.toneArm;

        let isDragging = false;
        let startX, startY;

        const onMouseDown = (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            arm.style.transition = 'none'; // Disable transition during drag
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();

            const rect = arm.getBoundingClientRect();
            // Pivot is roughly at top center of the arm image
            const pivotX = rect.left + rect.width / 2;
            const pivotY = rect.top + (rect.height * 0.1);

            const dx = e.clientX - pivotX;
            const dy = e.clientY - pivotY;

            // Calculate angle
            let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);

            // Adjust: 90deg (down) should be 0 rotation
            let rotation = angleDeg - 90;

            // Clamp rotation
            rotation = Math.max(-10, Math.min(rotation, 45));

            arm.style.transform = `rotate(${rotation}deg)`;
        };

        const onMouseUp = (e) => {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            arm.style.transition = ''; // Re-enable transition

            // Check if dropped on record
            const recordRect = this.elements.vinylRecord.getBoundingClientRect();
            const centerX = recordRect.left + recordRect.width / 2;
            const centerY = recordRect.top + recordRect.height / 2;
            const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
            const radius = recordRect.width / 2;

            if (dist < radius) {
                if (!this.isPlaying) this.play();
                else this.moveToneArmToRecord(); // Snap to playing position
            } else {
                if (this.isPlaying) this.pause();
                else this.moveToneArmOffRecord(); // Snap to resting position
            }
        };

        arm.addEventListener('mousedown', onMouseDown);
    }

    loadFromUrl(url) {
        const { videoId, listId } = this.playlistManager.parseUrl(url);

        if (listId) {
            if (this.player) {
                this.player.loadPlaylist({ list: listId });
                this.showNotification("Playlist loaded!", "success");
            }
        } else if (videoId) {
            this.playlistManager.addToQueue({ id: videoId, title: 'Unknown Track', isVideo: true });

            if (this.playlistManager.queue.length === 1 || !this.isPlaying) {
                this.playTrack(videoId);
            } else {
                this.showNotification("Track added to queue!", "success");
            }
        } else {
            this.showNotification("Invalid YouTube URL", "error");
        }
    }

    playTrack(videoId) {
        if (this.player) {
            this.player.loadVideoById(videoId);
            this.updateTrackInfo(videoId);
            this.showNotification("Playing track...", "success");
        }
    }

    play() {
        if (this.player) this.player.playVideo();
    }

    pause() {
        if (this.player) this.player.pauseVideo();
    }

    togglePlay() {
        if (this.isPlaying) this.pause();
        else this.play();
    }

    playNext() {
        const nextTrack = this.playlistManager.next();
        if (nextTrack) {
            this.playTrack(nextTrack.id);
        } else {
            if (this.player) this.player.nextVideo();
        }
    }

    playPrevious() {
        const prevTrack = this.playlistManager.previous();
        if (prevTrack) {
            this.playTrack(prevTrack.id);
        } else {
            if (this.player) this.player.previousVideo();
        }
    }

    setVolume(vol) {
        this.volume = vol;
        if (this.player) this.player.setVolume(vol);
    }

    startRotation() {
        this.elements.vinylCover.style.animationPlayState = 'running';
    }

    stopRotation() {
        this.elements.vinylCover.style.animationPlayState = 'paused';
    }

    moveToneArmToRecord() {
        this.elements.toneArm.style.transform = 'rotate(25deg)';
    }

    moveToneArmOffRecord() {
        this.elements.toneArm.style.transform = 'rotate(0deg)';
        if (this.isPlaying) {
            this.updatePlayButtonIcon(true);
        } else {
            this.updatePlayButtonIcon(false);
        }
    }

    updateTrackInfo(videoId) {
        if (this.player && this.player.getVideoData) {
            const data = this.player.getVideoData();
            // Update hidden text elements just in case, but they are hidden via CSS
            if (this.elements.textTitle) this.elements.textTitle.textContent = data.title;
            if (this.elements.textAuthor) this.elements.textAuthor.textContent = data.author;

            // Update Description Item
            const descItem = document.querySelector('.desc-item');
            if (descItem) {
                descItem.textContent = `${data.author} - ${data.title}`;
            }

            const thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            // Apply to vinyl cover which now fills the record
            this.elements.vinylCover.style.backgroundImage = `url('${thumb}')`;
        }
    }

    updatePlayButtonIcon(isPlaying) {
        if (!this.elements.playBtn) return;
        if (isPlaying) {
            this.elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
        } else {
            this.elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        }
    }

    startProgressLoop() {
        if (this.progressInterval) clearInterval(this.progressInterval);
        this.progressInterval = setInterval(() => {
            if (!this.player || !this.isPlaying) return;

            if (this.player.getCurrentTime && this.player.getDuration) {
                const current = this.player.getCurrentTime();
                const total = this.player.getDuration();

                if (this.elements.progressBar) {
                    this.elements.progressBar.value = (current / total) * 100;
                }

                if (this.elements.currentTime) {
                    this.elements.currentTime.textContent = this.formatTime(current);
                }
                if (this.elements.duration) {
                    this.elements.duration.textContent = this.formatTime(total);
                }
            }

            const data = this.player.getVideoData();
            if (data && data.title !== this.elements.textTitle.textContent) {
                this.updateTrackInfo(data.video_id);
            }

        }, 1000);
    }

    formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' + sec : sec}`;
    }

    downloadPlaylist() {
        let content = "Vinyl Player Playlist\n\n";

        // Check custom queue first
        if (this.playlistManager.queue.length > 0) {
            this.playlistManager.queue.forEach((track, index) => {
                content += `${index + 1}. ${track.title || 'Unknown'} - https://www.youtube.com/watch?v=${track.id}\n`;
            });
        }
        // Check player playlist
        else if (this.player && this.player.getPlaylist) {
            const playlist = this.player.getPlaylist();
            if (playlist && playlist.length > 0) {
                playlist.forEach((id, index) => {
                    content += `${index + 1}. https://www.youtube.com/watch?v=${id}\n`;
                });
            } else {
                content += "No tracks in queue.";
            }
        } else {
            content += "No tracks in queue.";
        }

        const blob = new Blob([content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'playlist.txt';
        a.click();
        window.URL.revokeObjectURL(url);
    }

    toggleVideoMode(enable) {
        if (enable) {
            this.elements.container.classList.add('video-mode');
            if (this.player) {
                this.player.setSize(500, 500);
            }
        } else {
            this.elements.container.classList.remove('video-mode');
            if (this.player) {
                this.player.setSize(0, 0);
            }
        }
    }

    showNotification(msg, type) {
        this.elements.notificationMessage.textContent = msg;
        this.elements.notification.className = `notification show ${type}`;
        setTimeout(() => {
            this.elements.notification.classList.remove('show');
        }, 3000);
    }
}
