import { SPEEDS } from '../constants';
import type { Group } from '../types';
import { getSubtitle } from '../services/subtitles';
import { groupsState } from './groups.svelte';
import { saveState } from './save.svelte';
import { extractYoutubeId, loadYouTubeVideo, resetYoutubePlayer, showVideoHideYoutube, startYoutubeSync, stopYoutubeSync, youtubeState } from '../services/youtube';
import { tick } from 'svelte';

class PlayerState {
  currentGroup = $state<number | null>(null);
  currentVideo = $state<number | null>(null);
  autoplayEnabled = $state(true);
  playbackRate = $state(1);
  mode = $state<'empty' | 'missing' | 'player'>('empty');
  emptyMessage = $state('Select a video folder to start');
  missingName = $state('');
  title = $state('');
  errorTitle = $state<string | null>(null);
  subtitleStatus = $state<'loaded' | 'none'>('none');
  subtitleAvailable = $state(false);
  subtitleActive = $state(false);
  currentCompleted = $state(false);
  loadSerial = $state(0);
  speedLabel = $state('1x');
  annotation = $state('');
  progressPct = $state(0);
  timeDisplay = $state('0:00 / 0:00');
  isPlaying = $state(false);
  isYoutube = $state(false);

  videoElement: HTMLVideoElement | null = null;
  wrapperElement: HTMLElement | null = null;
  private currentTrackUrl: string | null = null;
  private currentVideoUrl: string | null = null;
  private loadToken = 0;
  ignoreNextClick = false;

  private revokeVideoUrl() {
    if (this.currentVideoUrl) {
      URL.revokeObjectURL(this.currentVideoUrl);
      this.currentVideoUrl = null;
    }
  }

  clearPlayback(message: string) {
    this.loadToken++;
    this.currentGroup = null;
    this.currentVideo = null;
    this.mode = 'empty';
    this.emptyMessage = message;
    this.videoElement = null;
    this.isPlaying = false;
    this.isYoutube = false;
    this.subtitleActive = false;
    if (this.currentTrackUrl) {
      URL.revokeObjectURL(this.currentTrackUrl);
      this.currentTrackUrl = null;
    }
    this.revokeVideoUrl();
    resetYoutubePlayer();
  }

  async loadVideo(gid: number, vid: number) {
    const group = groupsState.findGroupById(gid);
    const video = group?.videos[vid];
    if (!group || !video) return;
    const token = ++this.loadToken;
    this.loadSerial++;

    if (this.currentGroup !== null && this.currentGroup !== gid) {
      groupsState.selectedIndices.clear();
      groupsState.lastSelectedIndex = null;
    }

    if ('isMissing' in video && video.isMissing) {
      this.currentGroup = gid;
      this.currentVideo = vid;
      this.mode = 'missing';
      this.missingName = video.name;
      this.isPlaying = false;
      this.isYoutube = false;
      this.title = video.name;
      this.errorTitle = null;
      resetYoutubePlayer();
      this.revokeVideoUrl();
      if (this.currentTrackUrl) {
        URL.revokeObjectURL(this.currentTrackUrl);
        this.currentTrackUrl = null;
      }
      return;
    }

    this.currentGroup = gid;
    this.currentVideo = vid;
    this.mode = 'player';
    this.title = video.name;
    this.errorTitle = null;
    this.isPlaying = false;
    this.progressPct = 0;
    this.timeDisplay = '0:00 / 0:00';
    const sub = getSubtitle(group, video.name);
    this.subtitleStatus = sub ? 'loaded' : 'none';
    this.subtitleAvailable = !!sub;
    this.subtitleActive = false;
    this.currentCompleted = group.completed.has(vid);
    this.annotation = video.annotation || '';

    await tick();
    if (token !== this.loadToken) return;
    const el = this.videoElement;
    if (!el) return;

    Array.from(el.getElementsByTagName('track')).forEach(t => t.remove());
    if (this.currentTrackUrl) URL.revokeObjectURL(this.currentTrackUrl);
    this.currentTrackUrl = null;
    this.revokeVideoUrl();
    el.pause();

    const youtubeId = extractYoutubeId('url' in video ? video.url || '' : '');
    if ('isLink' in video && video.isLink && youtubeId) {
      youtubeState.isYoutube = true;
      this.isYoutube = true;
      loadYouTubeVideo(youtubeId);
      startYoutubeSync();
    } else {
      youtubeState.isYoutube = false;
      youtubeState.pendingVideoId = null;
      this.isYoutube = false;
      stopYoutubeSync();
      showVideoHideYoutube();
      try { youtubeState.player?.pauseVideo?.(); } catch { /* no-op */ }

      if ('isLink' in video && video.isLink) {
        el.src = video.url;
      } else {
        this.currentVideoUrl = URL.createObjectURL(video as File);
        el.src = this.currentVideoUrl;
      }
      if (sub) {
        try {
          let txt = await sub.text();
          if (token !== this.loadToken) return;
          if (!txt.trim().startsWith('WEBVTT')) {
            txt = 'WEBVTT\n\n' + txt;
          }
          const vtt = txt.replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, '$1:$2:$3.$4');
          const blob = new Blob([vtt], { type: 'text/vtt' });
          this.currentTrackUrl = URL.createObjectURL(blob);
          const track = document.createElement('track');
          track.kind = 'subtitles'; track.label = 'English'; track.srclang = 'en'; track.src = this.currentTrackUrl; track.default = true;
          el.appendChild(track);
          track.track.mode = 'showing';
          this.subtitleActive = true;
        } catch (e) {
          console.warn('Failed to load subtitle track:', e);
          this.subtitleStatus = 'none';
          this.subtitleAvailable = false;
          this.subtitleActive = false;
        }
      }

      if (this.autoplayEnabled) {
        el.play().catch(e => console.warn('Autoplay blocked or failed:', e));
      }
    }
  }

  onTimeUpdate() {
    const el = this.videoElement;
    if (!el) return;
    this.progressPct = (el.currentTime / el.duration) * 100 || 0;
    this.timeDisplay = this.fmt(el.currentTime) + ' / ' + this.fmt(el.duration);
  }

  private fmt(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  pause() {
    if (youtubeState.isYoutube && youtubeState.player?.pauseVideo) {
      try { youtubeState.player.pauseVideo(); } catch { /* no-op */ }
    } else if (this.videoElement && !this.videoElement.paused) {
      this.videoElement.pause();
    }
  }

  togglePlay() {
    if (this.ignoreNextClick) return;
    if (youtubeState.isYoutube && youtubeState.player) {
      if (youtubeState.player.getPlayerState() === 1) {
        youtubeState.player.pauseVideo();
      } else {
        youtubeState.player.playVideo();
      }
    } else if (this.videoElement) {
      if (this.videoElement.paused) {
        this.videoElement.play().catch(e => console.warn('Play failed:', e));
      } else {
        this.videoElement.pause();
      }
    }
  }

  seekBy(delta: number) {
    if (youtubeState.isYoutube && youtubeState.player?.getCurrentTime) {
      youtubeState.player.seekTo(youtubeState.player.getCurrentTime() + delta, true);
    } else if (this.videoElement) {
      this.videoElement.currentTime += delta;
    }
  }

  seekToFraction(frac: number) {
    if (youtubeState.isYoutube && youtubeState.player?.seekTo) {
      const duration = youtubeState.player.getDuration();
      youtubeState.player.seekTo(duration * frac, true);
    } else if (this.videoElement) {
      this.videoElement.currentTime = frac * this.videoElement.duration;
    }
  }

  playNext() {
    if (this.currentGroup === null || this.currentVideo === null) return;
    const g = groupsState.findGroupById(this.currentGroup);
    if (g && this.currentVideo < g.videos.length - 1) this.loadVideo(this.currentGroup, this.currentVideo + 1);
  }

  playPrev() {
    if (this.currentGroup === null || this.currentVideo === null) return;
    if (this.currentVideo > 0) this.loadVideo(this.currentGroup, this.currentVideo - 1);
  }

  cycleSpeed() {
    const idx = SPEEDS.indexOf(this.playbackRate);
    this.playbackRate = SPEEDS[(idx + 1) % SPEEDS.length]!;
    this.speedLabel = this.playbackRate + 'x';
    if (youtubeState.isYoutube && youtubeState.player) {
      youtubeState.player.setPlaybackRate(this.playbackRate);
    } else if (this.videoElement) {
      this.videoElement.playbackRate = this.playbackRate;
    }
  }

  toggleSubtitleTrack() {
    if (youtubeState.isYoutube && youtubeState.player) {
      if (this.subtitleActive) {
        youtubeState.player.setOption('captions', 'track', {});
        this.subtitleActive = false;
      } else {
        youtubeState.player.setOption('captions', 'track', { languageCode: 'en' });
        this.subtitleActive = true;
      }
    } else if (this.videoElement && this.videoElement.textTracks.length > 0) {
      const track = this.videoElement.textTracks[0]!;
      track.mode = track.mode === 'showing' ? 'hidden' : 'showing';
      this.subtitleActive = track.mode === 'showing';
    }
  }

  toggleCurrentComplete() {
    if (this.currentGroup !== null && this.currentVideo !== null) {
      groupsState.toggleComplete(this.currentGroup, this.currentVideo);
    }
  }

  toggleFS() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.wrapperElement?.requestFullscreen();
    }
  }

  handleEnded() {
    if (this.currentGroup === null || this.currentVideo === null) return;
    const group = groupsState.findGroupById(this.currentGroup);
    if (!group) return;
    group.completed = new Set([...group.completed, this.currentVideo]);
    this.currentCompleted = true;
    saveState.markUnsaved();
    if (this.autoplayEnabled) this.playNext();
  }

  handleError() {
    const el = this.videoElement;
    if (!el) return;
    const err = el.error;
    console.error('Video Error:', err);
    const msg = err && err.code === 4 ? 'Source not supported (Code 4)' : 'Error loading video';
    this.errorTitle = `⚠️ ${msg}: ${this.title}`;
  }

  toggleAutoplay() {
    this.autoplayEnabled = !this.autoplayEnabled;
    saveState.markUnsaved();
  }
}

export const playerState = new PlayerState();
