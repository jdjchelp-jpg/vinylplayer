
import { PlaylistManager } from './PlaylistManager.js';
import { translations } from './i18n.js';
import { HolidayManager } from './HolidayManager.js';

export class VinylPlayer {
    constructor() {
        this.playlistManager = new PlaylistManager();
        this.player = null;
        this.isPlaying = false;
        this.isDragging = false;
        this.volume = 100;
        this.currentLang = 'en';
        this.localAudio = new Audio();
        this.localVideo = document.getElementById('localVideo');
        this.isLocalFile = false;
        this.holidayManager = new HolidayManager();
        this.chapters = []; // Store chapters

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
            container: document.querySelector('.container'),
            fileInput: document.getElementById('fileInput'),
            lyricsToggle: document.querySelector('.lyrics-toggle'),
            lyricsModal: document.getElementById('lyricsModal'),
            lyricsContent: document.getElementById('lyricsContent'),
            lyricsCloseBtn: document.getElementById('lyricsCloseBtn'),
            languageSelect: document.getElementById('languageSelect'),
            showLyricsToggle: document.getElementById('showLyricsToggle'),
            showChaptersToggle: document.getElementById('showChaptersToggle'),
            showHolidayToggle: document.getElementById('showHolidayToggle'),
            chapterMenu: document.getElementById('chapterMenu'),
            chapterList: document.getElementById('chapterList'),
            chapterCloseBtn: document.getElementById('chapterCloseBtn'),
            descToggle: document.querySelector('.desc-toggle')
        };

        this.init();
    }

    init() {
        this.loadYouTubeAPI();
        this.setupEventListeners();
        this.setupToneArmDrag();
        this.setupLocalMediaListeners();
        this.updateLanguage(this.currentLang);
        this.checkHoliday();
        this.updateSettings();
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
        if (this.isLocalFile) return; // Ignore YouTube events if playing local file

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
        if (this.isLocalFile) return;
        this.showNotification(translations[this.currentLang].errorPlaying, "error");
        this.playNext();
    }

    setupLocalMediaListeners() {
        // Audio events
        this.localAudio.addEventListener('play', () => this.onLocalPlay());
        this.localAudio.addEventListener('pause', () => this.onLocalPause());
        this.localAudio.addEventListener('ended', () => this.onLocalEnded());
        this.localAudio.addEventListener('timeupdate', () => this.onLocalTimeUpdate());
        this.localAudio.addEventListener('loadedmetadata', () => this.onLocalLoadedMetadata());

        // Video events
        this.localVideo.addEventListener('play', () => this.onLocalPlay());
        this.localVideo.addEventListener('pause', () => this.onLocalPause());
        this.localVideo.addEventListener('ended', () => this.onLocalEnded());
        this.localVideo.addEventListener('timeupdate', () => this.onLocalTimeUpdate());
        this.localVideo.addEventListener('loadedmetadata', () => this.onLocalLoadedMetadata());
    }

    onLocalPlay() {
        this.isPlaying = true;
        this.startRotation();
        this.moveToneArmToRecord();
        this.updatePlayButtonIcon(true);
    }

    onLocalPause() {
        this.isPlaying = false;
        this.stopRotation();
        this.updatePlayButtonIcon(false);
    }

    onLocalEnded() {
        this.isPlaying = false;
        this.stopRotation();
        this.updatePlayButtonIcon(false);
        this.playNext();
    }

    onLocalTimeUpdate() {
        const media = this.isVideo ? this.localVideo : this.localAudio;
        const current = media.currentTime;
        const total = media.duration;

        if (this.elements.progressBar) {
            this.elements.progressBar.value = (current / total) * 100;
        }
        if (this.elements.currentTime) {
            this.elements.currentTime.textContent = this.formatTime(current);
        }
    }

    onLocalLoadedMetadata() {
        const media = this.isVideo ? this.localVideo : this.localAudio;
        if (this.elements.duration) {
            this.elements.duration.textContent = this.formatTime(media.duration);
        }
    }

    setupEventListeners() {
        // Menu Toggle
        if (this.elements.menuToggle && this.elements.menuItems) {
            this.elements.menuToggle.addEventListener('click', () => {
                this.elements.menuItems.classList.toggle('active');
            });
        }

        // Description Toggle (Question Mark) / Chapter Toggle
        if (this.elements.descToggle) {
            this.elements.descToggle.addEventListener('click', () => {
                if (this.elements.showChaptersToggle && this.elements.showChaptersToggle.checked) {
                    this.toggleChapterMenu();
                } else {
                    const descItems = document.querySelector('.desc-items');
                    if (descItems) descItems.classList.toggle('active');
                }
            });
        }

        // Chapter Menu Close
        if (this.elements.chapterCloseBtn) {
            this.elements.chapterCloseBtn.addEventListener('click', () => {
                this.elements.chapterMenu.style.display = 'none';
            });
        }

        // Lyrics Toggle
        if (this.elements.lyricsToggle) {
            this.elements.lyricsToggle.addEventListener('click', () => {
                this.elements.lyricsModal.style.display = 'flex';
            });
        }

        if (this.elements.lyricsCloseBtn) {
            this.elements.lyricsCloseBtn.addEventListener('click', () => {
                this.elements.lyricsModal.style.display = 'none';
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

        // Language Select
        if (this.elements.languageSelect) {
            this.elements.languageSelect.addEventListener('change', (e) => {
                this.updateLanguage(e.target.value);
            });
        }

        // Settings Toggles
        if (this.elements.showLyricsToggle) {
            this.elements.showLyricsToggle.addEventListener('change', () => this.updateSettings());
        }
        if (this.elements.showChaptersToggle) {
            this.elements.showChaptersToggle.addEventListener('change', () => {
                this.updateSettings();
                this.updateTrackInfo(this.isLocalFile ? this.playlistManager.queue.find(t => t.id === this.localAudio.src || t.id === this.localVideo.src) : (this.player ? this.player.getVideoData().video_id : null));
            });
        }
        if (this.elements.showHolidayToggle) {
            this.elements.showHolidayToggle.addEventListener('change', () => {
                this.checkHoliday();
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

        // File Input
        if (this.elements.fileInput) {
            this.elements.fileInput.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files);
                this.elements.menuItems.classList.remove('active');
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
                if (this.isLocalFile) {
                    const media = this.isVideo ? this.localVideo : this.localAudio;
                    if (media.duration) {
                        media.currentTime = media.duration * (val / 100);
                    }
                } else if (this.player && this.player.getDuration) {
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
                if (this.isLocalFile) {
                    const media = this.isVideo ? this.localVideo : this.localAudio;
                    media.currentTime += 5;
                } else if (this.player && this.player.getCurrentTime) {
                    this.player.seekTo(this.player.getCurrentTime() + 5, true);
                }
            } else if (e.code === 'ArrowLeft') {
                if (this.isLocalFile) {
                    const media = this.isVideo ? this.localVideo : this.localAudio;
                    media.currentTime -= 5;
                } else if (this.player && this.player.getCurrentTime) {
                    this.player.seekTo(this.player.getCurrentTime() - 5, true);
                }
            }
        });
    }

    handleFileUpload(files) {
        if (!files || files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const url = URL.createObjectURL(file);
            const isVideo = file.type.startsWith('video/');

            this.playlistManager.addToQueue({
                id: url,
                title: file.name,
                isVideo: isVideo,
                isLocal: true,
                file: file
            });
        }

        if (this.playlistManager.queue.length === files.length || !this.isPlaying) {
            this.playTrack(this.playlistManager.queue[this.playlistManager.queue.length - files.length].id);
        } else {
            this.showNotification(translations[this.currentLang].trackAdded, "success");
        }
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
                this.isLocalFile = false;
                this.player.loadPlaylist({ list: listId });
                this.showNotification(translations[this.currentLang].playlistLoaded, "success");
            }
        } else if (videoId) {
            this.playlistManager.addToQueue({ id: videoId, title: 'Unknown Track', isVideo: true, isLocal: false });

            if (this.playlistManager.queue.length === 1 || !this.isPlaying) {
                this.playTrack(videoId);
            } else {
                this.showNotification(translations[this.currentLang].trackAdded, "success");
            }
        } else {
            this.showNotification(translations[this.currentLang].invalidUrl, "error");
        }
    }

    playTrack(id) {
        const track = this.playlistManager.queue.find(t => t.id === id);

        if (track && track.isLocal) {
            this.isLocalFile = true;
            this.isVideo = track.isVideo;

            // Stop YouTube player
            if (this.player && this.player.stopVideo) this.player.stopVideo();

            if (this.isVideo) {
                this.localVideo.src = id;
                this.localVideo.style.display = this.elements.showVideoToggle.checked ? 'block' : 'none';
                this.localVideo.play();
            } else {
                this.localAudio.src = id;
                this.localAudio.play();
            }

            this.updateTrackInfo(track);
            this.showNotification(translations[this.currentLang].playingTrack, "success");

        } else {
            this.isLocalFile = false;
            this.isVideo = true; // YouTube is always video
            this.localAudio.pause();
            this.localVideo.pause();
            this.localVideo.style.display = 'none';

            if (this.player) {
                this.player.loadVideoById(id);
                this.updateTrackInfo(id); // Pass ID for YouTube
                this.showNotification(translations[this.currentLang].playingTrack, "success");
            }
        }
    }

    play() {
        if (this.isLocalFile) {
            const media = this.isVideo ? this.localVideo : this.localAudio;
            media.play();
        } else if (this.player) {
            this.player.playVideo();
        }
    }

    pause() {
        if (this.isLocalFile) {
            const media = this.isVideo ? this.localVideo : this.localAudio;
            media.pause();
        } else if (this.player) {
            this.player.pauseVideo();
        }
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
            if (!this.isLocalFile && this.player) this.player.nextVideo();
        }
    }

    playPrevious() {
        const prevTrack = this.playlistManager.previous();
        if (prevTrack) {
            this.playTrack(prevTrack.id);
        } else {
            if (!this.isLocalFile && this.player) this.player.previousVideo();
        }
    }

    setVolume(vol) {
        this.volume = vol;
        if (this.player) this.player.setVolume(vol);
        this.localAudio.volume = vol / 100;
        this.localVideo.volume = vol / 100;
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

    updateTrackInfo(trackOrId) {
        // Clear lyrics
        this.elements.lyricsContent.textContent = translations[this.currentLang].noLyrics;
        this.elements.lyricsToggle.style.display = 'none';

        if (this.isLocalFile) {
            const track = trackOrId;
            this.elements.textTitle.textContent = track.title;
            this.elements.textAuthor.textContent = "Local File";

            // Reset cover
            this.elements.vinylCover.style.backgroundImage = "url('images/vinyl-cover.png')";

            // Extract metadata
            if (track.file) {
                jsmediatags.read(track.file, {
                    onSuccess: (tag) => {
                        const tags = tag.tags;
                        if (tags.title) this.elements.textTitle.textContent = tags.title;
                        if (tags.artist) this.elements.textAuthor.textContent = tags.artist;

                        // Description item
                        const descItem = document.querySelector('.desc-item');
                        if (descItem) descItem.textContent = `${this.elements.textAuthor.textContent} - ${this.elements.textTitle.textContent}`;

                        // Picture
                        if (tags.picture) {
                            const { data, format } = tags.picture;
                            let base64String = "";
                            for (let i = 0; i < data.length; i++) {
                                base64String += String.fromCharCode(data[i]);
                            }
                            const base64 = "data:" + format + ";base64," + window.btoa(base64String);
                            this.elements.vinylCover.style.backgroundImage = `url('${base64}')`;
                        }

                        // Lyrics (USLT)
                        if (tags.lyrics) {
                            this.elements.lyricsContent.textContent = tags.lyrics.lyrics || tags.lyrics;
                            this.elements.lyricsToggle.style.display = 'block';
                        }
                    },
                    onError: (error) => {
                        console.log('Error reading tags:', error);
                    }
                });
            }
        } else {
            // YouTube
            if (this.player && this.player.getVideoData) {
                const data = this.player.getVideoData();
                if (this.elements.textTitle) this.elements.textTitle.textContent = data.title;
                if (this.elements.textAuthor) this.elements.textAuthor.textContent = data.author;

                const descItem = document.querySelector('.desc-item');
                if (descItem) descItem.textContent = `${data.author} - ${data.title}`;

                const thumb = `https://img.youtube.com/vi/${trackOrId}/hqdefault.jpg`;
                this.elements.vinylCover.style.backgroundImage = `url('${thumb}')`;
            }
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
            if (!this.isPlaying) return;

            if (!this.isLocalFile && this.player && this.player.getCurrentTime && this.player.getDuration) {
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

                // Check for track change in playlist
                const data = this.player.getVideoData();
                if (data && data.title !== this.elements.textTitle.textContent) {
                    this.updateTrackInfo(data.video_id);
                }
            }
            // Local file progress handled by events
        }, 1000);
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "0:00";
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' + sec : sec}`;
    }

    downloadPlaylist() {
        let content = "Vinyl Player Playlist\n\n";

        // Check custom queue first
        if (this.playlistManager.queue.length > 0) {
            this.playlistManager.queue.forEach((track, index) => {
                const url = track.isLocal ? "Local File" : `https://www.youtube.com/watch?v=${track.id}`;
                content += `${index + 1}. ${track.title || 'Unknown'} - ${url}\n`;
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
            // Only show YouTube player if NOT local file
            if (this.player && !this.isLocalFile) {
                this.player.setSize(500, 500);
            }
            if (this.isLocalFile && this.isVideo) {
                this.localVideo.style.display = 'block';
                // Ensure YouTube is hidden
                if (this.player) this.player.setSize(0, 0);
            }
        } else {
            this.elements.container.classList.remove('video-mode');
            if (this.player) {
                this.player.setSize(0, 0);
            }
            if (this.isLocalFile && this.isVideo) {
                this.localVideo.style.display = 'none';
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

    updateLanguage(lang) {
        this.currentLang = lang;
        const t = translations[lang];

        // Update UI elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) el.textContent = t[key];
        });

        // Update specific elements
        if (this.elements.loadUrlBtn) this.elements.loadUrlBtn.querySelector('span').textContent = t.loadFromUrl;
        if (this.elements.settingsBtn) this.elements.settingsBtn.querySelector('span').textContent = t.settings;
        if (document.getElementById('feedbackBtn')) document.getElementById('feedbackBtn').querySelector('span').textContent = t.feedback;
        if (document.getElementById('downloadBtn')) document.getElementById('downloadBtn').querySelector('span').textContent = t.downloadPlaylist;

        // File input label
        const fileLabel = document.querySelector('label[class="menu-item"] span');
        if (fileLabel) fileLabel.textContent = t.loadFromFile;

        // Placeholders
        if (this.elements.urlInput) this.elements.urlInput.placeholder = t.enterUrl;
        if (document.getElementById('feedbackText')) document.getElementById('feedbackText').placeholder = t.yourFeedback;
    }
    updateSettings() {
        // Lyrics
        if (this.elements.showLyricsToggle && !this.elements.showLyricsToggle.checked) {
            this.elements.lyricsToggle.style.display = 'none';
        } else {
            // Only show if lyrics exist (handled in updateTrackInfo)
            if (this.elements.lyricsContent.textContent !== translations[this.currentLang].noLyrics) {
                this.elements.lyricsToggle.style.display = 'block';
            }
        }

        // Chapters
        if (this.elements.showChaptersToggle && this.elements.showChaptersToggle.checked) {
            this.elements.descToggle.classList.add('long-mode');
            this.elements.descToggle.setAttribute('data-chapter', translations[this.currentLang].chapter + " 1"); // Default
        } else {
            this.elements.descToggle.classList.remove('long-mode');
            this.elements.descToggle.removeAttribute('data-chapter');
        }
    }

    checkHoliday() {
        if (!this.elements.showHolidayToggle || !this.elements.showHolidayToggle.checked) return;

        const holiday = this.holidayManager.checkHoliday();
        if (holiday) {
            // Show Banner
            let banner = document.querySelector('.holiday-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.className = 'holiday-banner';
                document.body.appendChild(banner);
            }
            banner.innerHTML = `${holiday.icon} ${translations[this.currentLang].holidayMode} (${holiday.name})`;

            // Auto-load playlist if queue is empty
            if (this.playlistManager.queue.length === 0 && !this.isPlaying) {
                const playlistId = this.holidayManager.getHolidayPlaylist(holiday);
                if (playlistId) {
                    this.loadFromUrl(`https://www.youtube.com/playlist?list=${playlistId}`);
                }
            }
        }
    }

    toggleChapterMenu() {
        if (this.elements.chapterMenu.style.display === 'flex') {
            this.elements.chapterMenu.style.display = 'none';
        } else {
            this.renderChapters();
            this.elements.chapterMenu.style.display = 'flex';
        }
    }

    renderChapters() {
        this.elements.chapterList.innerHTML = '';

        // Mock Chapters for now (or simple time split)
        const duration = this.isLocalFile ? (this.isVideo ? this.localVideo.duration : this.localAudio.duration) : (this.player ? this.player.getDuration() : 0);

        if (!duration) return;

        // Create 5 minute chapters as fallback
        const chapterCount = Math.ceil(duration / 300);

        for (let i = 0; i < chapterCount; i++) {
            const time = i * 300;
            const div = document.createElement('div');
            div.className = 'chapter-item';
            div.innerHTML = `
                <span>${translations[this.currentLang].chapter} ${i + 1}</span>
                <span class="chapter-time">${this.formatTime(time)}</span>
            `;
            div.addEventListener('click', () => {
                if (this.isLocalFile) {
                    const media = this.isVideo ? this.localVideo : this.localAudio;
                    media.currentTime = time;
                } else if (this.player) {
                    this.player.seekTo(time, true);
                }
                this.elements.chapterMenu.style.display = 'none';
                this.elements.descToggle.setAttribute('data-chapter', `${translations[this.currentLang].chapter} ${i + 1}`);
            });
            this.elements.chapterList.appendChild(div);
        }
    }
}
