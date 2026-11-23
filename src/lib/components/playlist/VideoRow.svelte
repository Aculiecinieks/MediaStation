<script lang="ts">
  import type { Group, VideoItem } from '../../types';
  import { groupsState } from '../../stores/groups.svelte';
  import { playerState } from '../../stores/player.svelte';
  import { uiState } from '../../stores/ui.svelte';
  import { dnd } from '../../dnd';
  import { openVideoContextMenu } from '../../contextMenus';
  import { getSubtitle } from '../../services/subtitles';
  import { formatTime } from '../../utils';

  let { group, index, video }: { group: Group; index: number; video: VideoItem } = $props();

  const g = groupsState;
  const p = playerState;

  let dragOverClass = $state('');

  const isDone = $derived(group.completed.has(index));
  const missing = $derived('isMissing' in video && video.isMissing);
  const dur = $derived(g.videoDurations.get(`${group.id}-${index}`) || 0);
  const sub = $derived(getSubtitle(group, video.name));
  const isActive = $derived(p.currentGroup === group.id && p.currentVideo === index);
  const isSelected = $derived(p.currentGroup === group.id && g.selectedIndices.has(index));

  function onClick(e: MouseEvent) {
    if (missing) {
      alert('Original file not found. It may have been moved or deleted.');
      return;
    }
    handleVideoClick(e, group.id, index);
  }

  function handleVideoClick(e: MouseEvent, gid: number, vid: number) {
    const changedGroup = gid !== p.currentGroup;
    if (changedGroup && (e.ctrlKey || e.metaKey || e.shiftKey)) {
      if (p.currentGroup !== null) {
        g.selectedIndices.clear();
      }
      p.currentGroup = gid;
    } else if (changedGroup) {
      g.selectedIndices.clear();
      p.currentGroup = gid;
    }
    if (changedGroup) g.lastSelectedIndex = null;

    if (e.ctrlKey || e.metaKey) {
      if (g.selectedIndices.has(vid)) g.selectedIndices.delete(vid);
      else g.selectedIndices.add(vid);
      g.lastSelectedIndex = vid;
    } else if (e.shiftKey && g.lastSelectedIndex !== null) {
      g.selectedIndices.clear();
      const start = Math.min(g.lastSelectedIndex, vid);
      const end = Math.max(g.lastSelectedIndex, vid);
      for (let i = start; i <= end; i++) {
        g.selectedIndices.add(i);
      }
    } else {
      g.selectedIndices.clear();
      g.selectedIndices.add(vid);
      g.lastSelectedIndex = vid;
      p.loadVideo(gid, vid);
    }
  }

  function onDragStart(e: DragEvent) {
    e.stopPropagation();
    if (p.currentGroup === group.id && g.selectedIndices.has(index)) {
      const indices = Array.from(g.selectedIndices).sort((a, b) => a - b);
      dnd.src = { type: 'video-batch', gid: group.id, indices };
    } else {
      dnd.src = { type: 'video', id: group.id, index };
    }
    (e.currentTarget as HTMLElement).classList.add('draggable-source');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    if (dnd.src && dnd.src.type === 'group') return;

    e.stopPropagation();
    if (!dnd.src || (dnd.src.type !== 'video' && dnd.src.type !== 'video-batch')) return;

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const height = rect.height;

    dragOverClass = relY < height / 2 ? 'drag-over-top' : 'drag-over-bottom';
  }

  function onDragLeave() {
    dragOverClass = '';
  }

  function onDrop(e: DragEvent) {
    if (!dnd.src) {
      if (e.dataTransfer?.files?.length) dnd.dropTarget = { gid: group.id, vid: index };
      return;
    }
    if (dnd.src.type === 'group') return;

    e.stopPropagation();
    e.preventDefault();

    const insertAfter = dragOverClass === 'drag-over-bottom';
    dragOverClass = '';

    if (dnd.src.type === 'video') {
      g.moveVideo(dnd.src.id, dnd.src.index, group.id, index, insertAfter);
    } else if (dnd.src.type === 'video-batch') {
      g.moveVideosBatch(dnd.src.gid, dnd.src.indices, group.id, index, insertAfter);
    }
    dnd.src = null;
  }

  function onDragEnd(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('draggable-source');
    dragOverClass = '';
    dnd.src = null;
  }

  function openSync() {
    uiState.syncGid = group.id;
    uiState.syncVid = index;
    uiState.syncOpen = true;
  }
</script>

<div class="playlist-item"
  class:active={isActive}
  class:selected={isSelected}
  class:completed={isDone}
  style:opacity={isDone ? '0.6' : missing ? '0.7' : undefined}
  style:color={missing ? 'var(--danger)' : undefined}
  title={missing ? 'File not found in directory' : undefined}
  draggable="true"
  onclick={onClick}
  ondragstart={onDragStart}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
  ondragend={onDragEnd}
  oncontextmenu={(e) => openVideoContextMenu(e, group.id, index)}
  class:drag-over-top={dragOverClass === 'drag-over-top'}
  class:drag-over-bottom={dragOverClass === 'drag-over-bottom'}>
  <div style="flex:1;min-width:0">
    <div class="playlist-item-title">{video.name}</div>
    <div class="playlist-item-subtitle">
      <span>{dur ? formatTime(dur) : ''}</span>
      {#if sub} • <span style="color:var(--success)">CC</span>{/if}
      {#if 'isLink' in video && video.isLink} • <span style="color:var(--primary)">Link</span>{/if}
    </div>
  </div>
  <div class="playlist-item-actions">
    <button class="sync-btn" onclick={(e) => { e.stopPropagation(); openSync(); }}>SYNC</button>
    <div class="checkbox" class:checked={isDone}
      onclick={(e) => { e.stopPropagation(); g.toggleComplete(group.id, index); }}></div>
  </div>
</div>
