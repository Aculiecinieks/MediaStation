import { groupsState } from './stores/groups.svelte';
import { uiState, type MenuItem } from './stores/ui.svelte';
import { saveState } from './stores/save.svelte';
import { playerState } from './stores/player.svelte';
import { getSubtitle, removeSubtitleFromGroup } from './services/subtitles';
import { startAITranscription, startBatchAITranscription } from './services/ai';

export function openGroupContextMenu(e: MouseEvent, gid: number) {
  e.preventDefault();
  const group = groupsState.findGroupById(gid);
  if (!group) return;

  if (!groupsState.selectedGroups.has(gid)) {
    if (!e.ctrlKey && !e.shiftKey) groupsState.selectedGroups.clear();
    groupsState.selectedGroups.add(gid);
  }
  const count = groupsState.selectedGroups.size;
  const multiple = count > 1;

  const items: MenuItem[] = [
    {
      label: multiple ? 'Rename (First)' : 'Rename',
      action: () => { groupsState.renamingGroup = gid; },
    },
  ];

  if (!multiple) {
    items.push(
      { label: 'Move Up', action: () => groupsState.moveGroupRelative(gid, -1) },
      { label: 'Move Down', action: () => groupsState.moveGroupRelative(gid, 1) },
    );
  }

  if (group.isMaster || group.isLinkGroup) {
    items.push({
      label: group.isMaster ? 'Ungroup' : 'Ungroup Links',
      action: async () => {
        if (await uiState.showConfirmModal('Ungroup this master group?', 'Ungroup', 'danger')) {
          groupsState.ungroupMaster(gid);
        }
      },
    });
  }

  if (group.isMaster) {
    items.push({ label: 'Sort Children A→Z', action: () => groupsState.sortMasterChildrenAlpha(gid) });
  }

  items.push({
    label: multiple ? `Delete ${count} Groups` : 'Delete Group',
    danger: true,
    action: async () => {
      if (multiple) {
        if (await uiState.showConfirmModal(`Are you sure you want to delete ${count} groups?`, 'Delete', 'danger')) {
          groupsState.deleteGroupsBatchInternal();
        }
      } else {
        if (await uiState.showConfirmModal('Delete this group and all its videos?', 'Delete', 'danger')) {
          groupsState.deleteGroupInternal(gid);
        }
      }
    },
  });

  const menuHeight = items.length * 36 + 16;
  uiState.contextMenu = {
    x: Math.min(e.clientX, Math.max(0, window.innerWidth - 220)),
    y: e.clientY + menuHeight > window.innerHeight ? Math.max(0, window.innerHeight - menuHeight) : e.clientY,
    items
  };
}

export function openVideoContextMenu(e: MouseEvent, gid: number, vid: number) {
  e.preventDefault();
  const group = groupsState.findGroupById(gid);
  if (!group) return;

  if (playerState.currentGroup !== gid) {
    groupsState.selectedIndices.clear();
    groupsState.lastSelectedIndex = null;
  }

  if (!groupsState.selectedIndices.has(vid)) {
    groupsState.selectedIndices.clear();
    groupsState.selectedIndices.add(vid);
  }

  const count = groupsState.selectedIndices.size;
  const items: MenuItem[] = [];

  if (count > 1) {
    items.push(
      {
        label: `Generate Subtitles (${count})`,
        action: () => startBatchAITranscription(gid),
      },
      {
        label: `Delete Subtitles (${count})`,
        action: async () => {
          if (await uiState.showConfirmModal(`Remove subtitles for ${groupsState.selectedIndices.size} videos?`, 'Remove', 'danger')) {
            groupsState.selectedIndices.forEach(v => removeSubtitleFromGroup(group, v));
            if (playerState.currentGroup === gid && playerState.currentVideo !== null && groupsState.selectedIndices.has(playerState.currentVideo)) {
              playerState.loadVideo(gid, playerState.currentVideo);
            }
            saveState.markUnsaved();
          }
        },
      },
      {
        label: `Delete ${count} Videos`,
        danger: true,
        action: async () => {
          if (await uiState.showConfirmModal(`Are you sure you want to delete ${count} videos?`)) {
            groupsState.deleteVideosBatchInternal(gid);
          }
        },
      },
    );
  } else {
    const missing = 'isMissing' in group.videos[vid]! && group.videos[vid]!.isMissing;
    const sub = getSubtitle(group, group.videos[vid]!.name);
    if (!missing) {
      items.push({
        label: 'Generate Subtitles',
        action: () => startAITranscription(gid, vid),
      });
    }
    if (sub) {
      items.push({
        label: 'Delete Subtitles',
        action: () => {
          removeSubtitleFromGroup(group, vid);
          if (playerState.currentGroup === gid && playerState.currentVideo === vid) {
            playerState.loadVideo(gid, vid);
          }
          saveState.markUnsaved();
        },
      });
    }
    items.push({
      label: 'Delete Video',
      danger: true,
      action: async () => {
        if (await uiState.showConfirmModal('Are you sure you want to delete this video?', 'Delete', 'danger')) {
          groupsState.deleteVideoInternal(gid, vid);
        }
      },
    });
  }

  const menuHeight = items.length * 36 + 16;
  uiState.contextMenu = {
    x: Math.min(e.clientX, Math.max(0, window.innerWidth - 220)),
    y: e.clientY + menuHeight > window.innerHeight ? Math.max(0, window.innerHeight - menuHeight) : e.clientY,
    items
  };
}
