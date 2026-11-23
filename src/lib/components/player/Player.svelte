<script lang="ts">
  import { playerState as p } from '../../stores/player.svelte';
  import { groupsState } from '../../stores/groups.svelte';
  import { youtubeState } from '../../services/youtube';
  import VideoInfo from './VideoInfo.svelte';

  let videoEl: HTMLVideoElement | undefined = $state(undefined);
  let wrapperEl: HTMLDivElement | undefined = $state(undefined);
  let controlsVisible = $state(true);
  let hideTimer: ReturnType<typeof setTimeout> | undefined = $state(undefined);
  let longPressTimer: ReturnType<typeof setTimeout> | undefined = $state(undefined);
  let normalSpeed = 1;
  let isFastForwarding = false;

  let qualityOpen = $state(false);
  let currentQuality = $state('Auto');
  const QUALITY_OPTIONS = [
    { label: 'Auto', value: 'auto' },
    { label: '1080p', value: 'hd1080' },
    { label: '720p', value: 'hd720' },
    { label: '480p', value: 'large' },
    { label: '360p', value: 'medium' },
  ];

  function setQuality(value: string, label: string) {
    try { youtubeState.player?.setQuality?.(value); } catch { /* no-op */ }
    currentQuality = label;
    qualityOpen = false;
  }

  $effect(() => {
    p.videoElement = videoEl ?? null;
    p.wrapperElement = wrapperEl ?? null;
  });

  function showControls() {
    controlsVisible = true;
    clearTimeout(hideTimer);
    const delay = videoEl?.paused ? 3000 : 2500;
    hideTimer = setTimeout(() => {
      controlsVisible = false;
      if (document.fullscreenElement && wrapperEl) {
        wrapperEl.style.cursor = 'none';
      }
    }, delay);
    if (wrapperEl) wrapperEl.style.cursor = 'default';
  }

  $effect(() => {
    const handler = () => {
      if (document.fullscreenElement && document.fullscreenElement === wrapperEl) {
        showControls();
      }
    };
    const fsHandler = () => {
      if (document.fullscreenElement === wrapperEl) {
        showControls();
      } else if (wrapperEl) {
        wrapperEl.style.cursor = 'default';
        controlsVisible = true;
      }
    };
    document.addEventListener('mousemove', handler);
    document.addEventListener('fullscreenchange', fsHandler);
    return () => {
      document.removeEventListener('mousemove', handler);
      document.removeEventListener('fullscreenchange', fsHandler);
    };
  });

  function onProgressClick(e: MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    const r = target.getBoundingClientRect();
    const clickPos = (e.clientX - r.left) / r.width;
    p.seekToFraction(clickPos);
  }

  function onVideoMouseDown(e: MouseEvent) {
    if (e.button === 0 && videoEl) {
      normalSpeed = videoEl.playbackRate;
      longPressTimer = setTimeout(() => {
        if (videoEl) {
          videoEl.playbackRate = 2.0;
          isFastForwarding = true;
          controlsVisible = false;
        }
      }, 200);
    }
  }

  function restoreSpeed() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
    if (isFastForwarding && videoEl) {
      videoEl.playbackRate = normalSpeed;
      isFastForwarding = false;
      p.ignoreNextClick = true;
      setTimeout(() => { p.ignoreNextClick = false; }, 100);
      showControls();
    }
  }
</script>

<div class="player-section">
  {#if p.mode === 'empty'}
    <div class="empty-state">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"
        style="opacity: 0.2; margin-bottom: 16px;">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
        <line x1="7" y1="2" x2="7" y2="22"></line>
        <line x1="17" y1="2" x2="17" y2="22"></line>
        <line x1="2" y1="12" x2="22" y2="12"></line>
      </svg>
      <p>{p.emptyMessage}</p>
    </div>
  {:else if p.mode === 'missing'}
    <div class="empty-state">
      <p style="color:var(--danger)">Video File Missing</p>
      <p style="font-size:12px;opacity:0.7">{p.missingName}</p>
    </div>
  {:else}
    <div class="video-wrapper" bind:this={wrapperEl}
      onmousemove={showControls}
      onmouseenter={showControls}>
      <div id="youtube-player" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;"></div>
      <video bind:this={videoEl}
        onclick={() => p.togglePlay()}
        ontimeupdate={() => p.onTimeUpdate()}
        onplay={() => { p.isPlaying = true; showControls(); }}
        onpause={() => { p.isPlaying = false; showControls(); }}
        onmousedown={onVideoMouseDown}
        onmouseup={restoreSpeed}
        onmouseleave={restoreSpeed}
        onended={() => p.handleEnded()}
        onerror={() => p.handleError()}></video>

      <div class="video-controls" class:show={controlsVisible}>
        <div class="video-progress-container" onclick={onProgressClick}>
          <div class="video-progress-bar">
            <div class="video-progress-filled" style="width:{p.progressPct}%"></div>
          </div>
        </div>
        <div class="video-control-bar" style="margin-top:12px;">
          <div style="display:flex;gap:12px;align-items:center;">
            <button class="control-btn" title="Previous" onclick={() => p.playPrev()}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
            <button class="control-btn" title="Play/Pause" onclick={() => p.togglePlay()}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                {#if p.isPlaying}
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                {:else}
                  <path d="M8 5v14l11-7z"/>
                {/if}
              </svg>
            </button>
            <button class="control-btn" title="Next" onclick={() => p.playNext()}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
            <span class="time-display">{p.timeDisplay}</span>
          </div>
          <div style="display:flex;gap:8px;">
            {#if p.isYoutube}
              <div style="position:relative;">
                <button class="control-btn" title="Quality" onclick={() => qualityOpen = !qualityOpen}>HQ</button>
                {#if qualityOpen}
                  <div class="quality-menu">
                    {#each QUALITY_OPTIONS as opt}
                      <div class="quality-option" class:active={currentQuality === opt.label}
                        onclick={() => setQuality(opt.value, opt.label)}>{opt.label}</div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
            <button class="control-btn" class:active={p.subtitleActive}
              style:opacity={p.subtitleAvailable ? '1' : '0.3'}
              title="Toggle Subtitles" onclick={() => p.toggleSubtitleTrack()}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/></svg></button>
            <button class="control-btn" class:completed={p.currentCompleted}
              title="Mark Completed" onclick={() => p.toggleCurrentComplete()}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
            <button class="control-btn" onclick={() => p.cycleSpeed()}>{p.speedLabel}</button>
            <button class="control-btn" onclick={() => p.toggleFS()}><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button>
          </div>
        </div>
      </div>
    </div>

    <VideoInfo />
  {/if}
</div>
