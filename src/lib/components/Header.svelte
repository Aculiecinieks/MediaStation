<script lang="ts">
  import { uiState } from '../stores/ui.svelte';
  import { saveState } from '../stores/save.svelte';
  import { playerState } from '../stores/player.svelte';
  import { updatesState } from '../stores/updates.svelte';
  import { selectVideoFolder, selectIndividualVideos, selectSubtitleFolder } from '../services/fsAccess';

  function toggleSaveMenu(e: MouseEvent) {
    e.stopPropagation();
    uiState.videoMenuOpen = false;
    uiState.saveMenuOpen = !uiState.saveMenuOpen;
  }

  function toggleVideoMenu(e: MouseEvent) {
    e.stopPropagation();
    uiState.saveMenuOpen = false;
    uiState.videoMenuOpen = !uiState.videoMenuOpen;
  }
</script>

<div class="header">
  <div class="brand">
    <button class="btn" style="height: 36px; padding: 0 12px; border: 1px solid var(--border); margin-right: 4px;"
      onclick={() => { uiState.settingsOpen = true; }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z">
        </path>
      </svg>
    </button>
    <div style="width: 1px; height: 24px; background: var(--border); margin: 0 4px;"></div>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      style="color: var(--primary);">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
    <h1>Media Station</h1>
  </div>

  <div class="header-controls">
    <div class="save-wrapper">
      <div class="save-group">
        <button class="save-btn-main" onclick={() => saveState.quickSave()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          <span>{saveState.saveBtnText}</span>
        </button>
        <button class="save-btn-arrow" onclick={toggleSaveMenu}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {#if uiState.saveMenuOpen}
        <div class="save-dropdown">
          <div class="save-dropdown-item" onclick={() => { saveState.loadSaveFile(); uiState.saveMenuOpen = false; }}>Load Save</div>
          <div class="save-dropdown-item" onclick={() => { saveState.saveAs(); uiState.saveMenuOpen = false; }}>Save As...</div>
          <div style="height: 1px; background: var(--border); margin: 4px 0;"></div>
          <div class="save-dropdown-item" style="color: var(--danger);"
            onclick={() => { saveState.closeSaveFile(); uiState.saveMenuOpen = false; }}>Close File</div>
        </div>
      {/if}
    </div>

    <div class="save-wrapper" style="margin-right: 0;">
      <div class="save-group">
        <button class="save-btn-main" onclick={() => selectVideoFolder()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          Add Videos
        </button>
        <button class="save-btn-arrow" onclick={toggleVideoMenu}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {#if uiState.videoMenuOpen}
        <div class="save-dropdown">
          <div class="save-dropdown-item" onclick={() => { selectIndividualVideos(); uiState.videoMenuOpen = false; }}>Select Files</div>
          <div class="save-dropdown-item" onclick={() => { uiState.addLinkOpen = true; uiState.videoMenuOpen = false; }}>Embed Link</div>
        </div>
      {/if}
    </div>

    <button class="btn" onclick={() => selectSubtitleFolder()}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
      </svg>
      Subtitles
    </button>

    <div class="folder-status">{saveState.folderStatus}</div>

    <button class="btn update-btn" class:has-update={updatesState.available}
      title={updatesState.available ? `Version ${updatesState.version} is available` : 'Check for updates'}
      aria-label="Check for updates"
      onclick={() => updatesState.openPanel()}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3v12"></path>
        <path d="M7 10l5 5 5-5"></path>
        <path d="M4 19h16"></path>
      </svg>
      {#if updatesState.available}<span class="update-dot"></span>{/if}
    </button>

    <div class="autoplay-wrapper">
      <span style="font-size: 12px; color: var(--text-muted);">Autoplay</span>
      <div class="toggle-switch" class:active={playerState.autoplayEnabled} onclick={() => playerState.toggleAutoplay()}>
        <div class="toggle-slider"></div>
      </div>
    </div>
  </div>
</div>
