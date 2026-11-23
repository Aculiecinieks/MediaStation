import { playerState } from '../stores/player.svelte';
import { groupsState } from '../stores/groups.svelte';

export const youtubeState = {
  player: null as any,
  isYoutube: false,
  apiReady: false,
  pendingVideoId: null as string | null,
  ytTimeInterval: null as ReturnType<typeof setInterval> | null,
};

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export function initYouTubeAPI() {
  if (window.YT?.Player) {
    youtubeState.apiReady = true;
    const pending = youtubeState.pendingVideoId;
    youtubeState.pendingVideoId = null;
    if (pending && youtubeState.isYoutube) loadYouTubeVideo(pending);
    return;
  }
  if (document.getElementById('yt-api')) return;
  const tag = document.createElement('script');
  tag.id = 'yt-api';
  tag.src = 'https://www.youtube.com/iframe_api';
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = function () {
  youtubeState.apiReady = true;
  const pending = youtubeState.pendingVideoId;
  youtubeState.pendingVideoId = null;
  if (pending && youtubeState.isYoutube) loadYouTubeVideo(pending);
};

export function extractYoutubeId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2]!.length === 11) ? match[2]! : null;
}

function playerIsAttached(): boolean {
  try {
    const iframe = youtubeState.player?.getIframe?.();
    return !!iframe && document.body.contains(iframe);
  } catch {
    return false;
  }
}

function destroyPlayer() {
  const player = youtubeState.player;
  youtubeState.player = null;
  if (!player) return;
  try { player.pauseVideo?.(); } catch { /* no-op */ }
  try { player.destroy?.(); } catch { /* no-op */ }
}

export function resetYoutubePlayer() {
  stopYoutubeSync();
  destroyPlayer();
  youtubeState.isYoutube = false;
  youtubeState.pendingVideoId = null;
  const holder = document.getElementById('youtube-player');
  if (holder) holder.style.display = 'none';
}

export function loadYouTubeVideo(youtubeId: string) {
  const YT = window.YT;
  if (YT?.Player) youtubeState.apiReady = true;
  if (!youtubeState.apiReady || !YT?.Player) {
    youtubeState.pendingVideoId = youtubeId;
    return;
  }

  const el = playerState.videoElement;

  if (youtubeState.player && !playerIsAttached()) {
    destroyPlayer();
  }

  const holder = document.getElementById('youtube-player');
  if (!holder) return;

  if (el) el.style.display = 'none';
  holder.style.display = 'block';

  if (!youtubeState.player) {
    youtubeState.player = new YT.Player('youtube-player', {
      height: '100%',
      width: '100%',
      videoId: youtubeId,
      playerVars: {
        'playsinline': 1,
        'controls': 0,
        'disablekb': 1,
        'fs': 0,
        'rel': 0,
        'origin': window.location.origin
      },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange
      }
    });
  } else {
    youtubeState.player.loadVideoById(youtubeId);
  }
}

export function showVideoHideYoutube() {
  const el = playerState.videoElement;
  const holder = document.getElementById('youtube-player');
  if (holder) holder.style.display = 'none';
  if (el) el.style.display = 'block';
}

function onPlayerReady(event: any) {
  if (playerState.autoplayEnabled) event.target.playVideo();
  youtubeState.player?.setPlaybackRate(playerState.playbackRate);
}

function onPlayerStateChange(event: any) {
  const YT = window.YT;
  playerState.isPlaying = event.data === YT?.PlayerState?.PLAYING;
  if (event.data === YT?.PlayerState?.ENDED) {
    playerState.handleEnded();
  }
}

export function startYoutubeSync() {
  stopYoutubeSync();
  youtubeState.ytTimeInterval = setInterval(() => {
    const p = youtubeState.player;
    if (p && p.getCurrentTime) {
      const curr = p.getCurrentTime();
      const dur = p.getDuration();
      if (dur > 0) {
        const pct = (curr / dur) * 100;
        playerState.progressPct = pct;
        playerState.timeDisplay = fmt(curr) + ' / ' + fmt(dur);

        if (playerState.currentGroup !== null && playerState.currentVideo !== null) {
          const key = `${playerState.currentGroup}-${playerState.currentVideo}`;
          if (!groupsState.videoDurations.has(key) || groupsState.videoDurations.get(key) === 0) {
            groupsState.videoDurations.set(key, dur);
          }
        }
      }
    }
  }, 500);
}

export function stopYoutubeSync() {
  if (youtubeState.ytTimeInterval) clearInterval(youtubeState.ytTimeInterval);
  youtubeState.ytTimeInterval = null;
}

function fmt(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
