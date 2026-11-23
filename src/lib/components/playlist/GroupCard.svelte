<script lang="ts">
  import type { Group } from '../../types';
  import { groupsState } from '../../stores/groups.svelte';
  import { playerState } from '../../stores/player.svelte';
  import { uiState } from '../../stores/ui.svelte';
  import { dnd } from '../../dnd';
  import { openGroupContextMenu } from '../../contextMenus';
  import GroupCard from './GroupCard.svelte';
  import VideoRow from './VideoRow.svelte';

  let { group }: { group: Group } = $props();

  const g = groupsState;

  let dragOverClass = $state('');
  let renameValue = $state('');

  const renaming = $derived(g.renamingGroup === group.id);
  const containerClass = $derived(`group-container${g.selectedGroups.has(group.id) ? ' selected-group' : ''}${dragOverClass ? ' ' + dragOverClass : ''}`);
  const stats = $derived(g.getGroupStats(group.id));

  function startRename() {
    renameValue = group.name;
    g.renamingGroup = group.id;
  }

  function commitRename() {
    g.renameGroup(group.id, renameValue);
    g.renamingGroup = null;
  }

  function onHeaderClick(e: MouseEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.shiftKey && !group.isMaster) {
      g.toggleGroupSelected(group.id);
    } else {
      g.toggleCollapse(group.id);
    }
  }

  function onDragStart(e: DragEvent) {
    e.stopPropagation();
    dnd.src = { type: 'group', id: group.id };
    (e.currentTarget as HTMLElement).classList.add('draggable-source');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDragEnd(e: DragEvent) {
    (e.currentTarget as HTMLElement).classList.remove('draggable-source');
    dragOverClass = '';
    dnd.src = null;
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!dnd.src) return;
    const target = e.currentTarget as HTMLElement;

    if (dnd.src.type === 'video' || dnd.src.type === 'video-batch') {
      if (group.isMaster) {
        dragOverClass = '';
        return;
      }
      dragOverClass = 'drag-over-group';
      return;
    }

    if (dnd.src.type === 'group' && dnd.src.id !== group.id) {
      const rect = target.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const headerHeight = 40;

      if (relY < headerHeight) {
        dragOverClass = relY < headerHeight / 2 ? 'drag-over-top' : 'drag-over-bottom';
      } else if (group.isMaster) {
        dragOverClass = 'drag-over-group';
      } else {
        dragOverClass = 'drag-over-bottom';
      }
    }
  }

  function onDragLeave() {
    dragOverClass = '';
  }

  function onDrop(e: DragEvent) {
    if (!dnd.src) {
      if (!dnd.dropTarget && e.dataTransfer?.files?.length) dnd.dropTarget = { gid: group.id, vid: null };
      return;
    }
    e.stopPropagation();
    e.preventDefault();

    let position: 'top' | 'bottom' | 'inside' = 'bottom';
    if (dragOverClass === 'drag-over-top') position = 'top';
    else if (dragOverClass === 'drag-over-group') position = 'inside';
    dragOverClass = '';

    if (dnd.src.type === 'video') {
      if (group.isMaster) return;
      g.moveVideo(dnd.src.id, dnd.src.index, group.id, null, true);
    } else if (dnd.src.type === 'video-batch') {
      if (group.isMaster) return;
      g.moveVideosBatch(dnd.src.gid, dnd.src.indices, group.id, null, true);
    } else if (dnd.src.type === 'group' && dnd.src.id !== group.id) {
      g.reorderGroup(dnd.src.id, group.id, position);
    }
    dnd.src = null;
  }
</script>

<div class={containerClass}
  draggable="true"
  ondragstart={onDragStart}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
  ondragend={onDragEnd}>
  <div class="group-header" onclick={onHeaderClick}
    ondblclick={(e) => { e.stopPropagation(); startRename(); }}
    oncontextmenu={(e) => openGroupContextMenu(e, group.id)}>
    <div style="display:flex;align-items:center;flex:1;min-width:0;">
      <span style="font-size:10px;transform:{g.collapsedGroups.has(group.id) ? 'rotate(-90deg)' : 'rotate(0)'};transition:0.2s">▼</span>
      {#if renaming}
        <input class="group-title-input" style="margin-left:8px" bind:value={renameValue}
          onblur={commitRename}
          onkeydown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
      {:else}
        <span class="group-title">{group.name}</span>
      {/if}
    </div>
    <div style="display:flex;align-items:center;">
      {#if group.isMaster}
        <div title="Ungroup" style="opacity:0.5;cursor:pointer;margin-right:8px;display:flex;"
          onclick={async (e) => {
            e.stopPropagation();
            if (await uiState.showConfirmModal('Ungroup this master group?', 'Ungroup', 'danger')) {
              g.ungroupMaster(group.id);
            }
          }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        </div>
      {:else if group.isLinkGroup}
        <div style="opacity:0.7;margin-right:8px;color:var(--primary);display:flex;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        </div>
      {/if}
      <div class="stat-wrapper">
        <span class="stat-count">{stats.countStr}</span>
        <span class="stat-time">{stats.timeStr}</span>
      </div>
      {#if group.isMaster}
        <div title="Season Color"
          style="width:12px;height:12px;background:{group.masterColor || 'var(--border)'};border-radius:50%;margin-left:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.15);"
          onclick={(e) => { e.stopPropagation(); uiState.colorPickerGid = group.id; uiState.colorPickerOpen = true; }}></div>
      {/if}
    </div>
  </div>

  <div class="group-videos" class:collapsed={g.collapsedGroups.has(group.id)}>
    {#if group.isMaster}
      {#each group.children as cid (cid)}
        {@const child = g.findGroupById(cid)}
        {#if child}
          <GroupCard group={child} />
        {/if}
      {/each}
    {:else}
      {#each group.videos as video, i (i)}
        <VideoRow {group} index={i} {video} />
      {/each}
    {/if}
  </div>
</div>
