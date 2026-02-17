import { PlaylistManager } from './PlaylistManager.js';
import { translations } from './i18n.js';
import { HolidayManager } from './HolidayManager.js';
import { YouTubeService } from './YouTubeService.js';
import { ExportEngine } from './ExportEngine.js';

export class VinylPlayer {
    constructor() {
        console.log("VinylPlayer constructor started");
        this.playlistManager = new PlaylistManager();
        this.youTubeService = new YouTubeService(this); // Pass this as dom provider for notifications

        // Proxy player property for backward compatibility (ExportEngine)
        // ExportEngine asks for this.player.getDuration()
        // We can make this.player point to youTubeService for simple methods
        this.player = this.youTubeService;

        this.isPlaying = false;
        this.isDragging = false;
        this.volume = 100;
        this.currentLang = 'en';
        this.localAudio = new Audio();
        this.localVideo = document.getElementById('localVideo');
        this.isLocalFile = false;
        this.isVideo = false;
        this.holidayManager = new HolidayManager();
        this.chapters = []; // Store chapters
        this.currentExportTrack = null; // For export cleanup

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

            showYouTubeToggle: document.getElementById('showYouTubeToggle'),
            showLocalVideoToggle: document.getElementById('showLocalVideoToggle'),
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
            descToggle: document.querySelector('.desc-toggle'),
            installBtn: document.getElementById('installBtn'),
            exportVideoBtn: document.getElementById('exportVideoBtn'),
            renderModeToggle: document.getElementById('renderModeToggle')
        };

        this.deferredPrompt = null;
        try {
            this.ffmpeg = new FFmpegWASM.FFmpeg();
            this.exportEngine = new ExportEngine(this);
            console.log("ExportEngine initialized");
        } catch (e) {
            console.error("Failed to initialize ExportEngine or FFmpeg:", e);
        }
        this.init();
    }

    init() {
        console.log("VinylPlayer.init() called");
        // loadYouTubeAPI is handled by YouTubeService constructor
        this.setupEventListeners();
        this.setupToneArmDrag();
        this.setupLocalMediaListeners();
        this.updateLanguage(this.currentLang);
        this.checkHoliday();
        this.updateSettings();

        // Ensure vinyl is initially stationary and tonearm is off
        this.stopRotation();
        this.moveToneArmOffRecord();

        // PWA Install Prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            if (this.elements.installBtn) {
                this.elements.installBtn.style.display = 'flex';
            }
        });
    }

    // Callbacks for YouTubeService
    onPlayerReady(event, videoData) {
        console.log("Player Ready", videoData);
        this.setVolume(this.volume);
        if (this.isPlaying) {
            this.youTubeService.play();
        }

        // Update info if available from ready event
        if (videoData) {
            this.elements.textTitle.textContent = videoData.title;
            this.elements.textAuthor.textContent = videoData.author;
            this.updateDesc(videoData.author, videoData.title);
        }
    }

    onPlayerStateChange(event) {
        if (this.isLocalFile) return;

        if (event.data == YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.startRotation();
            this.moveToneArmToRecord();
            this.startProgressLoop();
            this.updatePlayButtonIcon(true);

            // Update metadata again on play to be sure
            const data = this.youTubeService.getVideoData();
            if (data) {
                this.elements.textTitle.textContent = data.title;
                this.elements.textAuthor.textContent = data.author;
                this.updateDesc(data.author, data.title);
            }

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

    // Helper to update desc item
    updateDesc(author, title) {
        const descItem = document.querySelector('.desc-item');
        if (descItem) descItem.textContent = `${author} - ${title}`;
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

        // Install Button
        if (this.elements.installBtn) {
            this.elements.installBtn.addEventListener('click', () => {
                this.installApp();
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

        // Language Select
        if (this.elements.languageSelect) {
            this.elements.languageSelect.addEventListener('change', (e) => {
                this.updateLanguage(e.target.value);
            });
        }

        // Settings Toggles
        if (this.elements.showYouTubeToggle) {
            this.elements.showYouTubeToggle.addEventListener('change', () => {
                this.updateSettings();
            });
        }

        if (this.elements.showLocalVideoToggle) {
            this.elements.showLocalVideoToggle.addEventListener('change', () => {
                this.updateSettings();
            });
        }

        if (this.elements.showLyricsToggle) {
            this.elements.showLyricsToggle.addEventListener('change', () => {
                this.updateSettings();
            });
        }

        if (this.elements.showChaptersToggle) {
            this.elements.showChaptersToggle.addEventListener('change', () => {
                this.updateSettings();
            });
        }

        if (this.elements.showHolidayToggle) {
            this.elements.showHolidayToggle.addEventListener('change', () => {
                this.checkHoliday(); // This handles the logic
            });
        }
        // URL Loading
        if (this.elements.loadUrlBtn) {
            this.elements.loadUrlBtn.addEventListener('click', () => {
                this.elements.urlModal.style.display = 'flex';
                this.elements.urlInput.value = '';
                this.elements.urlInput.focus();
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
                } else {
                    const duration = this.youTubeService.getDuration();
                    this.youTubeService.seekTo(duration * (val / 100));
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
                } else {
                    const current = this.youTubeService.getCurrentTime();
                    this.youTubeService.seekTo(current + 5);
                }
            } else if (e.code === 'ArrowLeft') {
                if (this.isLocalFile) {
                    const media = this.isVideo ? this.localVideo : this.localAudio;
                    media.currentTime -= 5;
                } else {
                    const current = this.youTubeService.getCurrentTime();
                    this.youTubeService.seekTo(current - 5);
                }
            }
        });

        if (this.elements.exportVideoBtn) {
            this.elements.exportVideoBtn.addEventListener('click', () => {
                this.exportEngine.exportPlaylist();
            });
        }

        if (this.elements.renderModeToggle) {
            this.elements.renderModeToggle.addEventListener('change', () => {
                this.updateSettings();
            });
        }
    }

    handleFileUpload(files) {
        if (!files || files.length === 0) return;

        const newTracks = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const isVideo = file.type.startsWith('video/');

            newTracks.push({
                title: file.name,
                isVideo: isVideo,
                isLocal: true,
                file: file
                // source is created in PlaylistManager.getCurrentTrack when needed
            });
        }

        this.playlistManager.addTracks(newTracks);

        // Auto play first track
        const firstTrack = this.playlistManager.getCurrentTrack();
        if (firstTrack) {
            this.playTrack(firstTrack);
        } else {
            this.showNotification(translations[this.currentLang].trackAdded, "success");
        }
    }


    setupToneArmDrag() {
        console.log("setupToneArmDrag called");
        const arm = this.elements.toneArm;
        if (!arm) return;

        let isDragging = false;
        let startX, startY;

        const onMouseDown = (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            arm.style.transition = 'none';
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
            arm.style.transition = '';

            // Check if dropped on record
            const recordRect = this.elements.vinylRecord.getBoundingClientRect();
            const centerX = recordRect.left + recordRect.width / 2;
            const centerY = recordRect.top + recordRect.height / 2;
            const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
            const radius = recordRect.width / 2;

            if (dist < radius) {
                if (!this.isPlaying) this.play();
                else this.moveToneArmToRecord();
            } else {
                if (this.isPlaying) this.pause();
                else this.moveToneArmOffRecord();
            }
        };

        arm.addEventListener('mousedown', onMouseDown);
    }

    loadFromUrl(url) {
        if (!url) return;
        const { videoId, listId } = this.playlistManager.parseUrl(url);

        if (listId) {
            // NOTE: YouTubeService doesn't support playlists natively via createPlayer yet in this detailed snippet
            // But we can just add the videos if we knew them?
            // Or maybe loadPlaylist is needed. 
            // The provided YouTubeService code only has createPlayer and basic controls.
            // It doesn't have loadPlaylist.
            // But we can fallback or implement it. 
            // For now, let's treat it as not supported or just single video if videoId exists.
            this.showNotification("Playlists are currently limited. Loading single video if present.");

            // If I want to support playlists, I'd need to fetch the playlist items.
        }

        if (videoId) {
            // Add single track
            this.playlistManager.addToQueue({
                id: videoId,
                title: 'Loading...',
                isVideo: true,
                isLocal: false
            });

            // Play it
            const track = this.playlistManager.getCurrentTrack(); // Might invoke if it was empty, or check queue
            // Actually playlistManager.addToQueue puts it at end. 
            // If it was empty, currentTrackIndex is 0.

            if (this.playlistManager.queue.length === 1 || !this.isPlaying) {
                // Ensure index is at the new track if we want to play it immediately?
                // Usually addToQueue appends. 
                // Force play the last added track?
                const lastIndex = this.playlistManager.queue.length - 1;
                this.playlistManager.currentTrackIndex = lastIndex;
                this.playTrack(this.playlistManager.queue[lastIndex]);
            } else {
                this.showNotification(translations[this.currentLang].trackAdded, "success");
            }
        } else {
            this.showNotification(translations[this.currentLang].invalidUrl, "error");
        }
    }

    playTrack(track) {
        if (!track) return;

        // If track is an ID string (legacy call), convert to minimal object
        if (typeof track === 'string') {
            track = { id: track, isLocal: false, isVideo: true };
        }

        console.log("playTrack called with:", track);

        if (track.isLocal) {
            this.isLocalFile = true;
            this.isVideo = track.isVideo;

            this.youTubeService.pause(); // Pause JS player

            if (this.isVideo) {
                this.localVideo.src = track.source;
                this.localVideo.style.display = this.elements.showLocalVideoToggle.checked ? 'block' : 'none';
                this.localVideo.play();
            } else {
                this.localAudio.src = track.source;
                this.localAudio.play();
            }

            this.updateTrackInfo(track);
            this.loadChapters(track);
            this.showNotification(translations[this.currentLang].playingTrack, "success");

        } else {
            this.isLocalFile = false;
            this.isVideo = true;
            this.localAudio.pause();
            this.localVideo.pause();
            this.localVideo.style.display = 'none';

            // Use YouTubeService to create/load player
            // Warning: YouTubeService.createPlayer destroys and recreates the player. 
            // This is robust but maybe heavy.
            this.youTubeService.createPlayer(
                'vinylTrack',
                track.id,
                (event, data) => this.onPlayerReady(event, data),
                (event) => this.onPlayerStateChange(event)
            );

            this.showNotification(translations[this.currentLang].playingTrack, "success");
        }
    }

    // Extracted chapter logic
    loadChapters(track) {
        this.chapters = [];
        if (track.file) {
            this.extractChapters(track.file)
                .then(chapters => {
                    this.chapters = chapters;
                    if (this.chapters.length > 0) {
                        console.log(`Found ${this.chapters.length} chapters`);
                    }
                })
                .catch(err => console.error(err));
        }
    }

    play() {
        if (this.isLocalFile) {
            const media = this.isVideo ? this.localVideo : this.localAudio;
            media.play();
        } else {
            this.youTubeService.play();
        }
    }

    pause() {
        if (this.isLocalFile) {
            const media = this.isVideo ? this.localVideo : this.localAudio;
            media.pause();
        } else {
            this.youTubeService.pause();
        }
    }

    togglePlay() {
        if (this.isPlaying) this.pause();
        else this.play();
    }

    playNext() {
        const nextTrack = this.playlistManager.nextTrack();
        if (nextTrack) {
            this.playTrack(nextTrack);
        }
    }

    playPrevious() {
        const prevTrack = this.playlistManager.previous();
        if (prevTrack) {
            this.playTrack(prevTrack);
        }
    }

    setVolume(vol) {
        this.volume = vol;
        this.youTubeService.setVolume(vol);
        this.localAudio.volume = vol / 100;
        this.localVideo.volume = vol / 100;
    }

    startRotation() {
        if (this.elements.vinylCover) {
            this.elements.vinylCover.classList.add('playing');
        }
    }

    stopRotation() {
        if (this.elements.vinylCover) {
            this.elements.vinylCover.classList.remove('playing');
        }
    }

    moveToneArmToRecord() {
        if (this.elements.toneArm) {
            this.elements.toneArm.classList.add('on-record');
        }
    }

    moveToneArmOffRecord() {
        if (this.elements.toneArm) {
            this.elements.toneArm.classList.remove('on-record');
        }
        if (this.isPlaying) {
            this.updatePlayButtonIcon(true);
        } else {
            this.updatePlayButtonIcon(false);
        }
    }

    updateTrackInfo(trackOrId) {
        // Clear lyrics by default
        this.elements.lyricsContent.textContent = translations[this.currentLang].noLyrics;
        this.elements.lyricsToggle.style.display = 'none';

        if (this.isLocalFile) {
            const track = trackOrId;
            this.elements.textTitle.textContent = track.title;
            this.elements.textAuthor.textContent = "Local File";
            this.elements.vinylCover.style.backgroundImage = "url('images/vinyl-cover.png')";

            this.updateDesc(this.elements.textAuthor.textContent, track.title);

            if (track.file) {
                jsmediatags.read(track.file, {
                    onSuccess: (tag) => {
                        const tags = tag.tags;
                        if (tags.title) this.elements.textTitle.textContent = tags.title;
                        if (tags.artist) this.elements.textAuthor.textContent = tags.artist;
                        this.updateDesc(this.elements.textAuthor.textContent, this.elements.textTitle.textContent);

                        if (tags.picture) {
                            const { data, format } = tags.picture;
                            let base64String = "";
                            for (let i = 0; i < data.length; i++) {
                                base64String += String.fromCharCode(data[i]);
                            }
                            const base64 = "data:" + format + ";base64," + window.btoa(base64String);
                            this.elements.vinylCover.style.backgroundImage = `url('${base64}')`;
                            // Set albumCoverImg for canvas export
                            this.albumCoverImg = new Image();
                            this.albumCoverImg.crossOrigin = "Anonymous";
                            this.albumCoverImg.src = base64;
                        }

                        if (tags.lyrics) {
                            this.elements.lyricsContent.textContent = tags.lyrics.lyrics || tags.lyrics;
                            this.elements.lyricsToggle.style.display = 'block';
                        }
                    },
                    onError: (error) => console.log('Error reading tags:', error)
                });
            }
        } else {
            // YouTube
            // Data is handled async via onPlayerReady/StateChange, but we can set defaults
            // We can also ask YouTubeService for cover
            if (typeof trackOrId === 'object' && trackOrId.id) {
                this.youTubeService.getVideoCoverUrl(trackOrId.id).then(url => {
                    this.elements.vinylCover.style.backgroundImage = `url('${url}')`;

                    // Keep image for canvas export
                    this.albumCoverImg = new Image();
                    this.albumCoverImg.crossOrigin = "Anonymous";
                    this.albumCoverImg.src = url;
                });
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

            if (!this.isLocalFile) {
                const current = this.youTubeService.getCurrentTime();
                const total = this.youTubeService.getDuration();

                if (this.elements.progressBar) {
                    this.elements.progressBar.value = (total > 0) ? (current / total) * 100 : 0;
                }

                if (this.elements.currentTime) {
                    this.elements.currentTime.textContent = this.formatTime(current);
                }
                if (this.elements.duration) {
                    this.elements.duration.textContent = this.formatTime(total);
                }
            }
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
        else {
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
            // YouTube Video handled mostly by CSS opacity in user's new version?
            // But we might need to set size if player object supports it?
            // YouTubeService creates player 0x0.

            // Local Video
            if (this.isLocalFile && this.isVideo) {
                if (this.elements.showLocalVideoToggle && this.elements.showLocalVideoToggle.checked) {
                    this.localVideo.style.display = 'block';
                } else {
                    this.localVideo.style.display = 'none';
                }
            }
        } else {
            this.elements.container.classList.remove('video-mode');
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

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) el.textContent = t[key];
        });

        if (this.elements.loadUrlBtn) this.elements.loadUrlBtn.querySelector('span').textContent = t.loadFromUrl;
        if (this.elements.settingsBtn) this.elements.settingsBtn.querySelector('span').textContent = t.settings;
        if (document.getElementById('feedbackBtn')) document.getElementById('feedbackBtn').querySelector('span').textContent = t.feedback;
        if (document.getElementById('downloadBtn')) document.getElementById('downloadBtn').querySelector('span').textContent = t.downloadPlaylist;

        const fileLabel = document.querySelector('label[class="menu-item"] span');
        if (fileLabel) fileLabel.textContent = t.loadFromFile;

        if (this.elements.urlInput) this.elements.urlInput.placeholder = t.enterUrl;
        if (document.getElementById('feedbackText')) document.getElementById('feedbackText').placeholder = t.yourFeedback;
    }
    updateSettings() {
        if (this.elements.showLyricsToggle && !this.elements.showLyricsToggle.checked) {
            this.elements.lyricsToggle.style.display = 'none';
        } else {
            if (this.elements.lyricsContent.textContent !== translations[this.currentLang].noLyrics) {
                this.elements.lyricsToggle.style.display = 'block';
            }
        }
        if (this.elements.showChaptersToggle && this.elements.showChaptersToggle.checked) {
            this.elements.descToggle.classList.add('long-mode');
            this.elements.descToggle.setAttribute('data-chapter', translations[this.currentLang].chapter + " 1");
        } else {
            this.elements.descToggle.classList.remove('long-mode');
            this.elements.descToggle.removeAttribute('data-chapter');
        }
        if (this.isPlaying) {
            this.toggleVideoMode(true);
        }
    }

    checkHoliday() {
        if (!this.elements.showHolidayToggle || !this.elements.showHolidayToggle.checked) return;

        const holiday = this.holidayManager.checkHoliday();
        if (holiday) {
            let banner = document.querySelector('.holiday-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.className = 'holiday-banner';
                document.body.appendChild(banner);
            }
            banner.innerHTML = `${holiday.icon} ${translations[this.currentLang].holidayMode} (${holiday.name})`;

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

    log(msg) {
        console.log(msg);
        if (!this.logs) this.logs = [];
        this.logs.push(msg);
    }

    async extractChapters(file) {
        this.log("Starting extraction...");

        // Check for Cross-Origin Isolation
        if (!window.crossOriginIsolated) {
            this.log("⚠️ Page is not Cross-Origin Isolated. FFmpeg might fail or be slow.");
        }

        // --- Strategy: FFmpeg (Primary) ---
        try {
            this.log("Initializing FFmpeg...");
            const { fetchFile } = FFmpegUtil;

            if (!this.ffmpeg) {
                this.ffmpeg = new FFmpegWASM.FFmpeg();
                this.ffmpeg.on("log", ({ message }) => {
                    // Filter out noisy logs, keep important ones
                    if (message.includes("Chapter") || message.includes("Duration") || message.includes("Error")) {
                        this.log(`FFmpeg: ${message}`);
                    }
                });

                // Load FFmpeg from CDN
                await this.ffmpeg.load({
                    coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
                });
            }

            const ffmpeg = this.ffmpeg;
            const fileName = "input.m4b";

            this.log("Writing file to memory...");
            await ffmpeg.writeFile(fileName, await fetchFile(file));

            this.log("Running FFmpeg (extracting metadata)...");
            // Use -f ffmetadata to get chapters
            await ffmpeg.exec(["-i", fileName, "-f", "ffmetadata", "metadata.txt"]);

            this.log("Reading metadata...");
            const data = await ffmpeg.readFile("metadata.txt");
            const metadata = new TextDecoder().decode(data);

            // Parse ffmetadata format
            const chapters = [];
            const lines = metadata.split("\n");
            let currentChapter = null;

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed === "[CHAPTER]") {
                    if (currentChapter) chapters.push(currentChapter);
                    currentChapter = { index: chapters.length + 1, title: `Chapter ${chapters.length + 1}`, startSeconds: 0 };
                } else if (currentChapter) {
                    const [key, ...values] = trimmed.split("=");
                    const value = values.join("="); // Handle values with =

                    if (key && value) {
                        if (key === "START") {
                            currentChapter.startSeconds = parseInt(value, 10);
                        } else if (key === "title" || key === "TIMEBASE") {
                            if (key === "title") currentChapter.title = value;
                            if (key === "TIMEBASE") currentChapter.timebase = value;
                        }
                    }
                }
            }
            if (currentChapter) chapters.push(currentChapter);

            if (chapters.length > 0) {
                this.log(`FFmpeg found ${chapters.length} chapters.`);

                // Normalize timestamps
                chapters.forEach(ch => {
                    if (ch.timebase) {
                        const [num, den] = ch.timebase.split("/");
                        ch.startSeconds = ch.startSeconds * (num / den);
                    } else {
                        // Default fallback if no timebase (unlikely with ffmetadata)
                        ch.startSeconds = ch.startSeconds / 1000;
                    }
                });

                chapters.sort((a, b) => a.startSeconds - b.startSeconds);

                // Cleanup
                try {
                    await ffmpeg.deleteFile(fileName);
                    await ffmpeg.deleteFile("metadata.txt");
                } catch (cleanupErr) {
                    console.warn("Cleanup failed:", cleanupErr);
                }

                return chapters;
            } else {
                this.log("FFmpeg found no chapters in metadata. Attempting stderr parsing...");

                let stderrLog = "";
                const logHandler = ({ message }) => {
                    stderrLog += message + "\n";
                };
                this.ffmpeg.on("log", logHandler);

                await ffmpeg.exec(["-i", fileName]);

                this.ffmpeg.off("log", logHandler); // Stop listening

                const stderrChapters = [];
                const lines = stderrLog.split('\n');

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.includes("Chapter #")) {
                        const startMatch = /start (\d+\.?\d*)/.exec(line);
                        if (startMatch) {
                            const startSeconds = parseFloat(startMatch[1]);
                            let title = `Chapter ${stderrChapters.length + 1}`;

                            for (let j = 1; j <= 5; j++) {
                                if (lines[i + j] && lines[i + j].includes("title")) {
                                    const titleMatch = /title\s*:\s*(.*)/.exec(lines[i + j]);
                                    if (titleMatch) {
                                        title = titleMatch[1].trim();
                                        break;
                                    }
                                }
                            }

                            stderrChapters.push({
                                index: stderrChapters.length + 1,
                                title: title,
                                startSeconds: startSeconds
                            });
                        }
                    }
                }

                if (stderrChapters.length > 0) {
                    this.log(`Found ${stderrChapters.length} chapters via stderr parsing.`);
                    return stderrChapters;
                }

                this.log("FFmpeg found no chapters in stderr.");
            }

        } catch (e) {
            this.log(`FFmpeg Error: ${e.message}`);
            console.error(e);
        }

        // --- Fallback: MP4Box ---
        this.log("Falling back to MP4Box...");
        return this.extractChaptersMP4Box(file);
    }

    extractChaptersMP4Box(file) {
        return new Promise((resolve) => {
            const mp4boxfile = MP4Box.createFile();
            let foundInfo = false;

            mp4boxfile.onReady = (info) => {
                foundInfo = true;
                let chapters = [];
                this.log(`MP4Box Info found. Tracks: ${info.tracks.length}`);

                if (info.chapters && info.chapters.length > 0) {
                    this.log("Found chapters via info.chapters");
                    chapters = info.chapters.map((ch, i) => ({
                        index: i + 1,
                        title: ch.title || `Chapter ${i + 1}`,
                        startSeconds: ch.start_time / info.timescale
                    }));
                }

                if (chapters.length === 0) {
                    const chpl = this.findBox(mp4boxfile.moov, 'chpl');
                    if (chpl) {
                        this.log("Found 'chpl' atom.");
                        if (chpl.entries) {
                            chapters = chpl.entries.map((entry, i) => ({
                                index: i + 1,
                                title: entry.chapter_name || `Chapter ${i + 1}`,
                                startSeconds: entry.start_time / info.timescale
                            }));
                        } else if (chpl.data) {
                            try {
                                const buffer = chpl.data.buffer;
                                const view = new DataView(buffer);
                                let offset = 8;
                                const count = view.getUint8(offset);
                                offset += 1;

                                for (let i = 0; i < count; i++) {
                                    const startNs = view.getBigUint64(offset, false);
                                    offset += 8;
                                    const startSeconds = Number(startNs) / 10000000;
                                    const titleLen = view.getUint8(offset);
                                    offset += 1;
                                    const titleBytes = new Uint8Array(buffer, offset, titleLen);
                                    const title = new TextDecoder().decode(titleBytes);
                                    offset += titleLen;

                                    chapters.push({
                                        index: i + 1,
                                        title: title,
                                        startSeconds: startSeconds
                                    });
                                }
                            } catch (err) {
                                this.log(`Error parsing chpl raw: ${err.message}`);
                            }
                        }
                    }
                }

                chapters.sort((a, b) => a.startSeconds - b.startSeconds);
                resolve(chapters);
            };

            mp4boxfile.onError = (e) => {
                this.log(`MP4Box Error: ${e}`);
                resolve([]);
            };

            const chunkSize = 1024 * 1024 * 2;
            let offset = 0;
            const readChunk = () => {
                if (foundInfo || offset >= file.size) return;
                const reader = new FileReader();
                const blob = file.slice(offset, offset + chunkSize);
                reader.onload = (e) => {
                    if (foundInfo) return;
                    const buffer = e.target.result;
                    buffer.fileStart = offset;
                    try {
                        mp4boxfile.appendBuffer(buffer);
                    } catch (err) {
                        resolve([]);
                        return;
                    }
                    offset += chunkSize;
                    readChunk();
                };
                reader.readAsArrayBuffer(blob);
            };
            readChunk();
        });
    }

    findBox(box, type) {
        if (!box) return null;
        if (box.type === type) return box;
        if (box.boxes) {
            for (let i = 0; i < box.boxes.length; i++) {
                const found = this.findBox(box.boxes[i], type);
                if (found) return found;
            }
        }
        if (box.container && box.container.boxes) {
            for (let i = 0; i < box.container.boxes.length; i++) {
                const found = this.findBox(box.container.boxes[i], type);
                if (found) return found;
            }
        }
        return null;
    }

    renderChapters() {
        this.elements.chapterList.innerHTML = '';
        if (this.chapters.length === 0) {
            this.elements.chapterList.innerHTML = '<div class="chapter-item"><span>No chapters found</span></div>';
            return;
        }

        this.chapters.forEach(chapter => {
            const div = document.createElement('div');
            div.className = 'chapter-item';
            div.innerHTML = `<span>${chapter.title}</span><span class="chapter-time">${this.formatTime(chapter.startSeconds)}</span>`;
            div.addEventListener('click', () => {
                if (this.isLocalFile) {
                    const media = this.isVideo ? this.localVideo : this.localAudio;
                    media.currentTime = chapter.startSeconds;
                } else {
                    this.youTubeService.seekTo(chapter.startSeconds);
                }
                this.elements.chapterMenu.style.display = 'none';
                this.elements.descToggle.setAttribute('data-chapter', chapter.title);
            });
            this.elements.chapterList.appendChild(div);
        });

        if (this.logs && this.logs.length > 0) {
            const logContainer = document.createElement('div');
            logContainer.className = 'chapter-logs';
            this.logs.forEach(log => {
                const logItem = document.createElement('div');
                logItem.className = 'log-item';
                logItem.textContent = `> ${log}`;
                logContainer.appendChild(logItem);
            });
            this.elements.chapterList.appendChild(logContainer);
        }
    }

    async installApp() {
        if (!this.deferredPrompt) return;
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        console.log(`User response: ${outcome}`);
        this.deferredPrompt = null;
        if (this.elements.installBtn) this.elements.installBtn.style.display = 'none';
    }

    renderToCanvas(ctx, width, height, time) {
        // ... (Keep the 4K render logic as implemented previously)
        if (this.elements.renderModeToggle && this.elements.renderModeToggle.checked) {
            ctx.fillStyle = "#191616";
            ctx.fillRect(0, 0, width, height);
        } else {
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, "#80bfff");
            gradient.addColorStop(1, "#191616");
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        }
        const centerX = width / 2;
        const centerY = height / 2;
        const vinylSize = Math.min(width, height) * 0.8;
        ctx.save();
        ctx.translate(centerX - (vinylSize * 0.1), centerY);
        const rotation = (time * 60 * Math.PI * 2) / 60;
        ctx.rotate(rotation);
        ctx.beginPath();
        ctx.arc(0, 0, vinylSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = "#111";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        for (let i = 0; i < 20; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, (vinylSize / 2) * (i / 20), 0, Math.PI * 2);
            ctx.stroke();
        }
        if (this.albumCoverImg && this.albumCoverImg.complete) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, vinylSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(this.albumCoverImg, -vinylSize / 2, -vinylSize / 2, vinylSize, vinylSize);
            ctx.restore();
        }
        ctx.restore();
        ctx.save();
        ctx.translate(centerX + (vinylSize * 0.4), centerY - (vinylSize * 0.4));
        const duration = this.isLocalFile ? (this.isVideo ? this.localVideo.duration : this.localAudio.duration) : this.youTubeService.getDuration();
        const progress = duration > 0 ? time / duration : 0;
        const armAngle = 0.2 + (progress * 0.3);
        ctx.rotate(armAngle);
        ctx.fillStyle = "#444";
        ctx.fillRect(-10, 0, 20, vinylSize * 0.6);
        ctx.restore();
        ctx.fillStyle = "white";
        ctx.font = `${height * 0.03}px Arial`;
        const title = this.elements.textTitle.textContent || "Unknown Title";
        const author = this.elements.textAuthor.textContent || "Unknown Author";
        ctx.fillText(title, 50, height - 150);
        ctx.font = `${height * 0.02}px Arial`;
        ctx.fillText(author, 50, height - 110);
        const barWidth = width - 100;
        const barHeight = 10;
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(50, height - 80, barWidth, barHeight);
        ctx.fillStyle = "white";
        ctx.fillRect(50, height - 80, barWidth * progress, barHeight);
        const timeStr = `${this.formatTime(time)} / ${this.formatTime(duration)}`;
        ctx.fillText(timeStr, width - 200, height - 110);
    }

    // Export preparation and audio capture methods

    async loadAlbumCoverFromFile(file, track) {
        return new Promise((resolve) => {
            jsmediatags.read(file, {
                onSuccess: (tag) => {
                    const tags = tag.tags;
                    // Update title and author from tags if available
                    if (tags.title) {
                        track.title = tags.title;
                        this.elements.textTitle.textContent = tags.title;
                    }
                    if (tags.artist) {
                        track.author = tags.artist;
                        this.elements.textAuthor.textContent = tags.artist;
                    }
                    // Update description if either changed
                    if (tags.title || tags.artist) {
                        this.updateDesc(this.elements.textAuthor.textContent, this.elements.textTitle.textContent);
                    }
                    if (tags.picture) {
                        const { data, format } = tags.picture;
                        let base64String = "";
                        for (let i = 0; i < data.length; i++) {
                            base64String += String.fromCharCode(data[i]);
                        }
                        const base64 = "data:" + format + ";base64," + window.btoa(base64String);
                        const img = new Image();
                        img.crossOrigin = "Anonymous";
                        img.onload = () => {
                            this.albumCoverImg = img;
                            resolve();
                        };
                        img.onerror = () => {
                            console.warn('Failed to load album cover image');
                            this.albumCoverImg = null;
                            resolve();
                        };
                        img.src = base64;
                    } else {
                        resolve();
                    }
                },
                onError: (err) => {
                    console.log('Error reading tags:', err);
                    resolve();
                }
            });
        });
    }

    async loadYouTubeTrackForExport(track) {
        return new Promise(async (resolve, reject) => {
            // Fetch video details for title/author
            const details = await this.youTubeService.getVideoDetails(track.id);
            if (details) {
                track.title = details.title;
                track.author = details.author;
                this.elements.textTitle.textContent = details.title;
                this.elements.textAuthor.textContent = details.author;
                this.updateDesc(details.author, details.title);
            }
            const onReady = (event, videoData) => {
                const duration = this.youTubeService.getDuration();
                track.duration = duration;
                this.youTubeService.getVideoCoverUrl(track.id)
                    .then(url => {
                        this.albumCoverImg = new Image();
                        this.albumCoverImg.crossOrigin = "Anonymous";
                        this.albumCoverImg.onload = () => resolve(duration);
                        this.albumCoverImg.onerror = () => resolve(duration);
                        this.albumCoverImg.src = url;
                    })
                    .catch(err => {
                        console.warn('Failed to get cover for YouTube video', err);
                        resolve(duration);
                    });
            };
            const onStateChange = (event) => {
                // ignore
            };
            this.isLocalFile = false;
            this.isVideo = true;
            this.youTubeService.createPlayer('vinylTrack', track.id, onReady, onStateChange);
            setTimeout(() => {
                if (track.duration === undefined) {
                    reject(new Error('YouTube load timeout for video: ' + track.id));
                }
            }, 30000);
        });
    }

    async prepareTrackForExport(track) {
        // Cleanup previous track if any
        if (this.currentExportTrack && this.currentExportTrack !== track) {
            this.cleanupTrack(this.currentExportTrack);
        }
        this.currentExportTrack = track;
        this.albumCoverImg = null; // reset for this track

        if (track.isLocal) {
            this.isLocalFile = true;
            this.isVideo = track.isVideo;
            // Ensure source blob URL
            if (!track.source && track.file) {
                track.source = URL.createObjectURL(track.file);
            }
            const media = track.isVideo ? this.localVideo : this.localAudio;
            // Pause and clear any previous source
            media.pause();
            media.src = track.source;
            // Wait for metadata
            await new Promise((resolve, reject) => {
                const onLoaded = () => resolve();
                const onError = (e) => reject(e);
                media.addEventListener('loadedmetadata', onLoaded, { once: true });
                media.addEventListener('error', onError, { once: true });
            });
            track.duration = media.duration;
            // Set default author if not set
            if (!track.author) {
                track.author = "Local File";
            }
            // Update UI initially with file name and default author
            this.elements.textTitle.textContent = track.title;
            this.elements.textAuthor.textContent = track.author;
            this.updateDesc(this.elements.textAuthor.textContent, this.elements.textTitle.textContent);
            // Load tags to possibly override title/author and get cover
            await this.loadAlbumCoverFromFile(track.file, track);
        } else {
            // YouTube track
            await this.loadYouTubeTrackForExport(track);
        }
    }

    async captureTrackAudio(track) {
        const sampleRate = 48000;
        let audioBuffer;
        if (track.isLocal) {
            // Fetch the audio file as array buffer
            const response = await fetch(track.source);
            const arrayBuffer = await response.arrayBuffer();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
            try {
                audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            } catch (e) {
                throw new Error('Failed to decode audio: ' + e);
            } finally {
                audioCtx.close();
            }
        } else {
            // YouTube: generate silent audio buffer
            const numSamples = Math.floor(track.duration * sampleRate);
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
            audioBuffer = audioCtx.createBuffer(2, numSamples, sampleRate);
            // Silent by default
            audioCtx.close();
        }
        // Ensure exact sample count matches track.duration * sampleRate
        const expectedSamples = Math.floor(track.duration * sampleRate);
        if (audioBuffer.length !== expectedSamples) {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
            const newBuffer = audioCtx.createBuffer(2, expectedSamples, sampleRate);
            for (let ch = 0; ch < 2; ch++) {
                const originalData = audioBuffer.getChannelData(ch);
                if (originalData.length >= expectedSamples) {
                    newBuffer.copyToChannel(originalData.subarray(0, expectedSamples), ch);
                } else {
                    newBuffer.copyToChannel(originalData, ch, 0);
                }
            }
            audioBuffer = newBuffer;
            audioCtx.close();
        }
        return this.encodeWAV(audioBuffer);
    }

    encodeWAV(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length;
        const bitsPerSample = 16;
        const blockAlign = numChannels * bitsPerSample / 8;
        const byteRate = sampleRate * blockAlign;
        const dataSize = length * blockAlign;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        // RIFF chunk descriptor
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        this.writeString(view, 8, 'WAVE');
        // fmt sub-chunk
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        // data sub-chunk
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // Write audio data
        const channels = [];
        for (let i = 0; i < numChannels; i++) {
            channels.push(audioBuffer.getChannelData(i));
        }
        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, channels[ch][i]));
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, intSample, true);
                offset += 2;
            }
        }
        return new Uint8Array(buffer);
    }

    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    cleanupTrack(track) {
        if (track && track.isLocal && track.source) {
            if (this.localVideo.src === track.source) {
                this.localVideo.pause();
                this.localVideo.src = '';
            }
            if (this.localAudio.src === track.source) {
                this.localAudio.pause();
                this.localAudio.src = '';
            }
            URL.revokeObjectURL(track.source);
            track.source = '';
        }
    }
}
