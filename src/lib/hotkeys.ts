import { isSubtitleFile } from './constants';
import { dnd } from './dnd';
import { groupsState } from './stores/groups.svelte';
import { playerState } from './stores/player.svelte';
import { saveState } from './stores/save.svelte';
import { uiState } from './stores/ui.svelte';
import { stripExtension } from './utils';

export function registerHotkeys() {
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (e.key === 'Escape') {
      uiState.contextMenu = null;
      uiState.saveMenuOpen = false;
      uiState.videoMenuOpen = false;
      return;
    }
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.shiftKey && (e.key === 'G' || e.key === 'g')) {
      e.preventDefault();
      groupsState.createMasterGroup();
      return;
    }
    if (e.code === 'Space') {
      if (target.closest('button')) return;
      e.preventDefault();
      playerState.togglePlay();
      return;
    }
    if (e.key.toLowerCase() === 'f') {
      playerState.toggleFS();
      return;
    }
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      playerState.seekBy(5);
      return;
    }
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      playerState.seekBy(-5);
      return;
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.save-wrapper')) {
      uiState.saveMenuOpen = false;
      uiState.videoMenuOpen = false;
    }
    if (!target.closest('.context-menu')) {
      uiState.contextMenu = null;
    }
  });

  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    const target = dnd.dropTarget;
    dnd.dropTarget = null;
    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;

    const gid = target?.gid ?? playerState.currentGroup;
    if (gid === null) return;
    const group = groupsState.findGroupById(gid);
    if (!group) return;

    const currentVid = playerState.currentGroup === gid ? playerState.currentVideo : null;
    const fallbackVid = target?.vid ?? currentVid;

    const dropped = Array.from(e.dataTransfer.files).filter(file => isSubtitleFile(file.name));
    if (dropped.length === 0) return;

    const matched = new Set<number>();
    for (const file of dropped) {
      const fileBase = stripExtension(file.name);
      let targetIndex = group.videos.findIndex(video => {
        const videoBase = stripExtension(video.name);
        return fileBase === videoBase
          || fileBase.startsWith(videoBase + '.')
          || fileBase.startsWith(videoBase + ' ')
          || fileBase.startsWith(videoBase + '-')
          || fileBase.startsWith(videoBase + '_');
      });
      if (targetIndex === -1 && dropped.length === 1 && fallbackVid !== null) targetIndex = fallbackVid;
      if (targetIndex === -1 || matched.has(targetIndex)) continue;

      try {
        const text = await file.text();
        const { saveSubtitleToGroup } = await import('./services/subtitles');
        saveSubtitleToGroup(group, targetIndex, text);
        matched.add(targetIndex);
      } catch (err) {
        console.error('Failed to load subtitle drop:', err);
      }
    }

    if (matched.size > 0) {
      saveState.markUnsaved();
      if (currentVid !== null && matched.has(currentVid)) {
        await playerState.loadVideo(gid, currentVid);
      }
    }
  });
}
