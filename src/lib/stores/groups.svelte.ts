import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { MASTER_COLORS } from '../constants';
import type { Group, VideoItem } from '../types';
import { formatDurationHuman, stripExtension } from '../utils';
import { pruneSubtitleMaps, subtitleKeyOwner, subtitleKeysForVideo } from '../services/subtitles';
import { saveState } from './save.svelte';
import { playerState } from './player.svelte';

function isMissingVideo(video: VideoItem): boolean {
  return 'isMissing' in video && video.isMissing;
}

function moveSubtitleMaps(src: Group, target: Group, filename: string) {
  const base = stripExtension(filename);
  const keys = subtitleKeysForVideo(src, filename, false)
    .filter(key => subtitleKeyOwner(key, src.videos) === filename);

  let resolved = src.manualSync[base] || src.subtitles[base] || null;
  if (!resolved) {
    for (const key of keys) {
      const value = src.manualSync[key] || src.subtitles[key];
      if (value) { resolved = value; break; }
    }
  }

  for (const key of keys) {
    if (src.manualSync[key]) {
      target.manualSync[key] = src.manualSync[key]!;
      delete src.manualSync[key];
    }
    if (src.customSubtitleFiles[key] !== undefined) {
      target.customSubtitleFiles[key] = src.customSubtitleFiles[key]!;
      delete src.customSubtitleFiles[key];
    }
    if (src.subtitles[key]) delete src.subtitles[key];
  }

  if (resolved && !target.manualSync[base]) {
    target.manualSync[base] = resolved;
  }
  if (src.subtitleRemoved?.[base]) {
    if (!target.subtitleRemoved) target.subtitleRemoved = {};
    target.subtitleRemoved[base] = true;
    delete src.subtitleRemoved[base];
  }
}

class GroupsState {
  videoGroups = $state<Group[]>([]);
  collapsedGroups = $state(new SvelteSet<number>());
  selectedGroups = $state(new SvelteSet<number>());
  selectedIndices = $state(new SvelteSet<number>());
  lastSelectedIndex = $state<number | null>(null);
  renamingGroup = $state<number | null>(null);
  videoDurations = $state(new SvelteMap<string, number>());
  groupIdCounter = $state(0);
  private durationGenerations = new Map<string, number>();
  private durationEpoch = 0;

  findGroupById(id: number): Group | undefined {
    return this.videoGroups.find(g => g.id === id);
  }

  createNewGroup(name?: string, isLinkGroup = false): Group {
    this.selectedIndices.clear();
    this.lastSelectedIndex = null;
    return {
      id: this.groupIdCounter++,
      name: name || `Collection ${this.videoGroups.filter(g => !g.isMaster).length + 1}`,
      videos: [], videoHandles: [], subtitles: {},
      directoryHandleKey: null, subtitleDirectoryHandleKey: null,
      manualSync: {}, customSubtitleFiles: {}, completed: new Set(),
      isMaster: false, children: [], isLinkGroup: isLinkGroup
    };
  }

  rootGroups(): Group[] {
    return this.videoGroups.filter(g => !this.videoGroups.some(m => m.isMaster && m.children.includes(g.id)));
  }

  private isDescendantOf(groupId: number, ancestorId: number, visited = new Set<number>()): boolean {
    if (groupId === ancestorId) return true;
    if (visited.has(groupId)) return false;
    visited.add(groupId);
    const group = this.findGroupById(groupId);
    if (!group || !group.isMaster) return false;
    return group.children.some(childId => this.isDescendantOf(childId, ancestorId, visited));
  }

  private collectStats(groupId: number, visited: Set<number>): { total: number; completed: number; remainingSeconds: number; countStr: string; timeStr: string } {
    const group = this.findGroupById(groupId);
    let total = 0;
    let completed = 0;
    let remainingSeconds = 0;

    if (group && !visited.has(groupId)) {
      visited.add(groupId);
      if (group.isMaster) {
        group.children.forEach(childId => {
          const childStats = this.collectStats(childId, visited);
          total += childStats.total;
          completed += childStats.completed;
          remainingSeconds += childStats.remainingSeconds;
        });
      } else {
        total = group.videos.length;
        completed = group.completed.size;
        group.videos.forEach((_, index) => {
          if (!group.completed.has(index)) {
            remainingSeconds += this.videoDurations.get(`${group.id}-${index}`) || 0;
          }
        });
      }
    }

    return {
      total,
      completed,
      remainingSeconds,
      countStr: group?.isMaster ? `${group.children.length} groups` : `${completed}/${total}`,
      timeStr: formatDurationHuman(remainingSeconds)
    };
  }

  getGroupStats(groupId: number): { total: number; completed: number; remainingSeconds: number; countStr: string; timeStr: string } {
    return this.collectStats(groupId, new Set());
  }

  libraryStats(): { totalVideos: number; completedVideos: number; totalDuration: number; completedDuration: number } {
    let totalVideos = 0, completedVideos = 0, totalDuration = 0, completedDuration = 0;
    this.videoGroups.forEach(g => {
      if (!g.isMaster) {
        totalVideos += g.videos.length;
        completedVideos += g.completed.size;
        g.videos.forEach((_, i) => {
          const dur = this.videoDurations.get(`${g.id}-${i}`) || 0;
          totalDuration += dur;
          if (g.completed.has(i)) completedDuration += dur;
        });
      }
    });
    return { totalVideos, completedVideos, totalDuration, completedDuration };
  }

  toggleCollapse(gid: number) {
    if (this.collapsedGroups.has(gid)) this.collapsedGroups.delete(gid);
    else this.collapsedGroups.add(gid);
    saveState.markUnsaved();
  }

  toggleGroupSelected(gid: number) {
    if (this.selectedGroups.has(gid)) this.selectedGroups.delete(gid);
    else this.selectedGroups.add(gid);
  }

  createMasterGroup() {
    if (this.selectedGroups.size < 1) return;
    const validSelected: number[] = [];
    for (const gid of this.selectedGroups) {
      const group = this.findGroupById(gid);
      if (!group) continue;
      if (group.isMaster) { alert('Cannot nest Seasons.'); return; }
      validSelected.push(gid);
    }
    if (validSelected.length === 0) {
      this.selectedGroups.clear();
      return;
    }
    validSelected.sort((a, b) =>
      this.videoGroups.findIndex(g => g.id === a) - this.videoGroups.findIndex(g => g.id === b)
    );

    const selectedSet = new Set(validSelected);
    this.videoGroups.forEach(g => {
      if (g.isMaster) g.children = g.children.filter(cid => !selectedSet.has(cid));
    });

    const firstChildIdx = this.videoGroups.findIndex(g => g.id === validSelected[0]);
    const master: Group = {
      id: this.groupIdCounter++,
      name: `Master Group ${this.videoGroups.filter(g => g.isMaster).length + 1}`,
      isMaster: true, masterColor: MASTER_COLORS[0],
      children: validSelected, completed: new Set(), videos: [], subtitles: {},
      videoHandles: [], directoryHandleKey: null,
      subtitleDirectoryHandleKey: null, manualSync: {}, customSubtitleFiles: {}, isLinkGroup: false
    };
    this.videoGroups.splice(firstChildIdx, 0, master);
    this.selectedGroups.clear();
    saveState.markUnsaved();
  }

  ungroupMaster(masterId: number) {
    this.videoGroups = this.videoGroups.filter(g => g.id !== masterId);
    this.selectedGroups.delete(masterId);
    this.collapsedGroups.delete(masterId);
    saveState.markUnsaved();
  }

  renameGroup(gid: number, name: string) {
    const group = this.findGroupById(gid);
    if (!group) return;
    if (name.trim()) group.name = name.trim();
    saveState.markUnsaved();
  }

  toggleComplete(gid: number, vid: number) {
    const g = this.findGroupById(gid);
    if (!g) return;
    const next = new Set(g.completed);
    if (next.has(vid)) next.delete(vid); else next.add(vid);
    g.completed = next;
    if (playerState.currentGroup === gid && playerState.currentVideo === vid) {
      playerState.currentCompleted = next.has(vid);
    }
    saveState.markUnsaved();
  }

  updateAnnotation(gid: number, vid: number, text: string) {
    const group = this.findGroupById(gid);
    if (group && group.videos[vid]) {
      group.videos[vid]!.annotation = text;
      saveState.markUnsaved();
    }
  }

  moveVideo(srcGid: number, srcIndex: number, targetGid: number, targetIndex: number | null, insertAfter: boolean) {
    const srcGroup = this.findGroupById(srcGid);
    const targetGroup = this.findGroupById(targetGid);
    if (!srcGroup || !targetGroup || srcGroup.isMaster || targetGroup.isMaster) return;
    const video = srcGroup.videos[srcIndex];
    if (!video) return;

    const handle = srcGroup.videoHandles[srcIndex] ?? null;
    const isCompleted = srcGroup.completed.has(srcIndex);
    const sameGroup = srcGid === targetGid;

    if (!sameGroup) moveSubtitleMaps(srcGroup, targetGroup, video.name);

    srcGroup.videos.splice(srcIndex, 1);
    srcGroup.videoHandles.splice(srcIndex, 1);

    const newSrcCompleted = new Set<number>();
    srcGroup.completed.forEach(idx => {
      if (idx < srcIndex) newSrcCompleted.add(idx);
      else if (idx > srcIndex) newSrcCompleted.add(idx - 1);
    });

    let destIdx: number;
    if (targetIndex === null) {
      destIdx = targetGroup.videos.length;
    } else if (sameGroup) {
      if (srcIndex < targetIndex) {
        destIdx = insertAfter ? targetIndex : targetIndex - 1;
      } else {
        destIdx = insertAfter ? targetIndex + 1 : targetIndex;
      }
    } else {
      destIdx = insertAfter ? targetIndex + 1 : targetIndex;
    }
    destIdx = Math.max(0, Math.min(destIdx, targetGroup.videos.length));

    targetGroup.videos.splice(destIdx, 0, video);
    targetGroup.videoHandles.splice(destIdx, 0, handle);

    if (sameGroup) {
      const newTargetCompleted = new Set<number>();
      newSrcCompleted.forEach(idx => {
        if (idx < destIdx) newTargetCompleted.add(idx);
        else newTargetCompleted.add(idx + 1);
      });
      if (isCompleted) newTargetCompleted.add(destIdx);
      targetGroup.completed = newTargetCompleted;
    } else {
      srcGroup.completed = newSrcCompleted;
      const newTargetCompleted = new Set<number>();
      targetGroup.completed.forEach(idx => {
        if (idx < destIdx) newTargetCompleted.add(idx);
        else newTargetCompleted.add(idx + 1);
      });
      if (isCompleted) newTargetCompleted.add(destIdx);
      targetGroup.completed = newTargetCompleted;
    }

    if (sameGroup && playerState.currentGroup === srcGid) {
      const mapIndex = (oldIndex: number): number => {
        if (oldIndex === srcIndex) return destIdx;
        const shifted = oldIndex < srcIndex ? oldIndex : oldIndex - 1;
        return shifted < destIdx ? shifted : shifted + 1;
      };
      const newSelection = new SvelteSet<number>();
      this.selectedIndices.forEach(idx => newSelection.add(mapIndex(idx)));
      this.selectedIndices = newSelection;
      if (playerState.currentVideo !== null) {
        playerState.currentVideo = mapIndex(playerState.currentVideo);
      }
    } else if (playerState.currentGroup === srcGid) {
      const wasMoved = this.selectedIndices.has(srcIndex);
      const newSelection = new SvelteSet<number>();
      this.selectedIndices.forEach(idx => {
        if (idx < srcIndex) newSelection.add(idx);
        else if (idx > srcIndex) newSelection.add(idx - 1);
      });
      if (wasMoved) newSelection.add(destIdx);
      this.selectedIndices = newSelection;
    } else if (playerState.currentGroup === targetGid) {
      const newSelection = new SvelteSet<number>();
      this.selectedIndices.forEach(idx => {
        if (idx < destIdx) newSelection.add(idx);
        else newSelection.add(idx + 1);
      });
      this.selectedIndices = newSelection;
    }

    if (!sameGroup && playerState.currentGroup === srcGid && playerState.currentVideo === srcIndex) {
      playerState.currentGroup = targetGid;
      playerState.currentVideo = destIdx;
    } else if (!sameGroup && playerState.currentGroup === srcGid && playerState.currentVideo !== null && playerState.currentVideo > srcIndex) {
      playerState.currentVideo--;
    } else if (!sameGroup && playerState.currentGroup === targetGid && playerState.currentVideo !== null && playerState.currentVideo >= destIdx) {
      playerState.currentVideo++;
    }

    const movedDuration = this.videoDurations.get(`${srcGid}-${srcIndex}`);

    if (sameGroup) {
      const indexMap = new Map<number, number>();
      for (let old = 0; old < srcGroup.videos.length + 1; old++) {
        if (old === srcIndex) {
          indexMap.set(old, destIdx);
        } else {
          const shifted = old < srcIndex ? old : old - 1;
          indexMap.set(old, shifted < destIdx ? shifted : shifted + 1);
        }
      }
      this.remapDurations(srcGid, indexMap);
    } else {
      const srcIndexMap = new Map<number, number>();
      for (let old = 0; old < srcGroup.videos.length + 1; old++) {
        if (old === srcIndex) continue;
        srcIndexMap.set(old, old < srcIndex ? old : old - 1);
      }
      this.remapDurations(srcGid, srcIndexMap);

      const targetOldLength = targetGroup.videos.length - 1;
      const targetIndexMap = new Map<number, number>();
      for (let old = 0; old < targetOldLength; old++) {
        targetIndexMap.set(old, old >= destIdx ? old + 1 : old);
      }
      this.remapDurations(targetGid, targetIndexMap);
      if (movedDuration !== undefined) this.videoDurations.set(`${targetGid}-${destIdx}`, movedDuration);
    }

    this.lastSelectedIndex = null;
    this.loadDurations(srcGroup);
    if (!sameGroup) this.loadDurations(targetGroup);
    saveState.markUnsaved();
  }

  moveVideosBatch(srcGid: number, indices: number[], targetGid: number, targetIndex: number | null, insertAfter: boolean) {
    const srcGroup = this.findGroupById(srcGid);
    const targetGroup = this.findGroupById(targetGid);
    if (!srcGroup || !targetGroup || srcGroup.isMaster || targetGroup.isMaster) return;

    const sorted = Array.from(new Set(indices))
      .filter(idx => idx >= 0 && idx < srcGroup.videos.length)
      .sort((a, b) => a - b);
    if (sorted.length === 0) return;

    const sameGroup = srcGid === targetGid;
    const items = sorted.map(idx => ({
      video: srcGroup.videos[idx]!,
      handle: srcGroup.videoHandles[idx] ?? null,
      completed: srcGroup.completed.has(idx),
      oldIndex: idx
    }));
    const oldCompleted = new Set(srcGroup.completed);
    const movedDurations = items.map(item => this.videoDurations.get(`${srcGid}-${item.oldIndex}`));

    if (!sameGroup) {
      for (const item of items) moveSubtitleMaps(srcGroup, targetGroup, item.video.name);
    }

    if (sameGroup) {
      const remaining = srcGroup.videos
        .map((video, i) => ({ video, handle: srcGroup.videoHandles[i] ?? null, oldIndex: i }))
        .filter(entry => !sorted.includes(entry.oldIndex));
      const removedBefore = targetIndex === null ? 0 : sorted.filter(idx => idx < targetIndex).length;
      let insertionIdx = targetIndex === null ? remaining.length : targetIndex - removedBefore;
      if (targetIndex !== null && insertAfter) insertionIdx++;
      insertionIdx = Math.max(0, Math.min(insertionIdx, remaining.length));

      const finalEntries = [
        ...remaining.slice(0, insertionIdx),
        ...items.map(item => ({ video: item.video, handle: item.handle, oldIndex: item.oldIndex })),
        ...remaining.slice(insertionIdx)
      ];
      const indexMap = new Map<number, number>();
      finalEntries.forEach((entry, newIdx) => indexMap.set(entry.oldIndex, newIdx));

      srcGroup.videos = finalEntries.map(entry => entry.video);
      srcGroup.videoHandles = finalEntries.map(entry => entry.handle);
      srcGroup.completed = new Set(
        Array.from(oldCompleted)
          .map(idx => indexMap.get(idx))
          .filter((idx): idx is number => idx !== undefined)
      );

      this.selectedIndices = new SvelteSet(items.map(item => indexMap.get(item.oldIndex)!));
      if (playerState.currentGroup === srcGid && playerState.currentVideo !== null) {
        playerState.currentVideo = indexMap.get(playerState.currentVideo) ?? playerState.currentVideo;
      }
      this.remapDurations(srcGid, indexMap);
      this.loadDurations(srcGroup);
    } else {
      const srcRemaining = srcGroup.videos
        .map((video, i) => ({ video, handle: srcGroup.videoHandles[i] ?? null, oldIndex: i }))
        .filter(entry => !sorted.includes(entry.oldIndex));
      const srcIndexMap = new Map<number, number>();
      srcRemaining.forEach((entry, newIdx) => srcIndexMap.set(entry.oldIndex, newIdx));

      srcGroup.videos = srcRemaining.map(entry => entry.video);
      srcGroup.videoHandles = srcRemaining.map(entry => entry.handle);
      srcGroup.completed = new Set(
        Array.from(oldCompleted)
          .map(idx => srcIndexMap.get(idx))
          .filter((idx): idx is number => idx !== undefined)
      );

      const targetOld = targetGroup.videos.map((video, i) => ({
        video,
        handle: targetGroup.videoHandles[i] ?? null,
        oldIndex: i,
        completed: targetGroup.completed.has(i)
      }));
      let insertionIdx = targetIndex === null ? targetOld.length : targetIndex + (insertAfter ? 1 : 0);
      insertionIdx = Math.max(0, Math.min(insertionIdx, targetOld.length));

      const targetEntries = [
        ...targetOld.slice(0, insertionIdx),
        ...items.map(item => ({ video: item.video, handle: item.handle, oldIndex: -1, completed: item.completed })),
        ...targetOld.slice(insertionIdx)
      ];
      targetGroup.videos = targetEntries.map(entry => entry.video);
      targetGroup.videoHandles = targetEntries.map(entry => entry.handle);

      const newTargetCompleted = new Set<number>();
      targetOld.forEach((entry, oldIdx) => {
        if (!entry.completed) return;
        newTargetCompleted.add(oldIdx >= insertionIdx ? oldIdx + items.length : oldIdx);
      });
      items.forEach((item, i) => {
        if (item.completed) newTargetCompleted.add(insertionIdx + i);
      });
      targetGroup.completed = newTargetCompleted;

      this.remapDurations(srcGid, srcIndexMap);
      const targetIndexMap = new Map<number, number>();
      targetOld.forEach((_, oldIdx) => targetIndexMap.set(oldIdx, oldIdx >= insertionIdx ? oldIdx + items.length : oldIdx));
      this.remapDurations(targetGid, targetIndexMap);
      movedDurations.forEach((duration, i) => {
        if (duration !== undefined) this.videoDurations.set(`${targetGid}-${insertionIdx + i}`, duration);
      });

      if (playerState.currentGroup === srcGid) {
        const current = playerState.currentVideo;
        const movedPos = current === null ? -1 : sorted.indexOf(current);
        if (movedPos >= 0) {
          playerState.currentGroup = targetGid;
          playerState.currentVideo = insertionIdx + movedPos;
        } else if (current !== null) {
          playerState.currentVideo = srcIndexMap.get(current) ?? null;
        }
        this.selectedIndices = new SvelteSet();
      } else if (playerState.currentGroup === targetGid) {
        if (playerState.currentVideo !== null && playerState.currentVideo >= insertionIdx) {
          playerState.currentVideo += items.length;
        }
        this.selectedIndices = new SvelteSet(items.map((_, i) => insertionIdx + i));
      }

      this.loadDurations(srcGroup);
      this.loadDurations(targetGroup);
    }

    this.lastSelectedIndex = null;
    saveState.markUnsaved();
  }

  reorderGroup(srcGid: number, targetGid: number, position: 'top' | 'bottom' | 'inside') {
    const srcGroup = this.findGroupById(srcGid);
    const targetGroup = this.findGroupById(targetGid);
    if (!srcGroup || !targetGroup || srcGid === targetGid) return;
    if (position === 'inside' && !targetGroup.isMaster) return;

    const targetParentMaster = this.videoGroups.find(g => g.isMaster && g.children.includes(targetGid));

    // Masters stay at root level and may never contain themselves or their descendants.
    if (srcGroup.isMaster && (position === 'inside' || targetParentMaster)) return;
    if (this.isDescendantOf(targetGid, srcGid)) return;

    this.videoGroups.forEach(g => {
      if (g.isMaster) g.children = g.children.filter(cid => cid !== srcGid);
    });

    if (position === 'inside') {
      if (!targetGroup.children.includes(srcGid)) targetGroup.children.push(srcGid);
    } else if (targetParentMaster) {
      const arr = targetParentMaster.children;
      const targetIdxInArr = arr.indexOf(targetGid);
      const insertAt = position === 'top' ? targetIdxInArr : targetIdxInArr + 1;
      if (!arr.includes(srcGid)) arr.splice(insertAt, 0, srcGid);
    }

    const srcIdx = this.videoGroups.findIndex(g => g.id === srcGid);
    this.videoGroups.splice(srcIdx, 1);

    const targetIdx = this.videoGroups.findIndex(g => g.id === targetGid);
    if (position === 'top') {
      this.videoGroups.splice(targetIdx, 0, srcGroup);
    } else {
      this.videoGroups.splice(targetIdx + 1, 0, srcGroup);
    }

    saveState.markUnsaved();
  }

  moveGroupRelative(gid: number, direction: -1 | 1) {
    const parentMaster = this.videoGroups.find(g => g.isMaster && g.children.includes(gid));
    if (parentMaster) {
      const arr = parentMaster.children;
      const idx = arr.indexOf(gid);
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= arr.length) return;
      [arr[idx], arr[newIdx]] = [arr[newIdx]!, arr[idx]!];
    } else {
      const roots = this.rootGroups();
      const rootIdx = roots.findIndex(g => g.id === gid);
      const swapTarget = roots[rootIdx + direction];
      if (!swapTarget) return;
      const idxA = this.videoGroups.findIndex(g => g.id === gid);
      const idxB = this.videoGroups.findIndex(g => g.id === swapTarget.id);
      [this.videoGroups[idxA], this.videoGroups[idxB]] = [this.videoGroups[idxB]!, this.videoGroups[idxA]!];
    }
    saveState.markUnsaved();
  }

  sortMasterChildrenAlpha(masterId: number) {
    const master = this.findGroupById(masterId);
    if (!master || !master.isMaster) return;
    master.children.sort((a, b) => {
      const ga = this.findGroupById(a);
      const gb = this.findGroupById(b);
      if (!ga || !gb) return 0;
      return ga.name.localeCompare(gb.name);
    });
    saveState.markUnsaved();
  }

  private deleteDurationsForGroup(gid: number) {
    this.bumpDurationGeneration(gid);
    for (const key of Array.from(this.videoDurations.keys())) {
      if (key.startsWith(`${gid}-`)) this.videoDurations.delete(key);
    }
  }

  clearDurationGenerations() {
    this.durationEpoch++;
    this.durationGenerations.clear();
  }

  private durationGenerationKey(gid: number): string {
    return `${this.durationEpoch}:${gid}`;
  }

  private bumpDurationGeneration(gid: number) {
    const key = this.durationGenerationKey(gid);
    this.durationGenerations.set(key, (this.durationGenerations.get(key) ?? 0) + 1);
  }

  private remapDurations(gid: number, indexMap: Map<number, number>) {
    const prefix = `${gid}-`;
    const updates = new Map<number, number>();
    for (const [key, value] of this.videoDurations) {
      if (!key.startsWith(prefix)) continue;
      const oldIndex = Number(key.slice(prefix.length));
      if (!Number.isInteger(oldIndex)) continue;
      const newIndex = indexMap.get(oldIndex);
      if (newIndex !== undefined) updates.set(newIndex, value);
    }
    for (const key of Array.from(this.videoDurations.keys())) {
      if (key.startsWith(prefix)) this.videoDurations.delete(key);
    }
    updates.forEach((value, index) => this.videoDurations.set(`${prefix}${index}`, value));
  }

  deleteGroupInternal(gid: number) {
    this.videoGroups = this.videoGroups.filter(g => g.id !== gid);
    this.selectedGroups.delete(gid);
    this.collapsedGroups.delete(gid);
    this.videoGroups.forEach(g => {
      if (g.isMaster && g.children) {
        g.children = g.children.filter(cid => cid !== gid);
      }
    });
    this.deleteDurationsForGroup(gid);
    if (playerState.currentGroup === gid) {
      playerState.clearPlayback('Group deleted');
      this.selectedIndices.clear();
      this.lastSelectedIndex = null;
    }
    saveState.markUnsaved();
  }

  deleteGroupsBatchInternal() {
    const deleted = this.videoGroups.filter(g => this.selectedGroups.has(g.id));
    this.videoGroups = this.videoGroups.filter(g => !this.selectedGroups.has(g.id));
    this.videoGroups.forEach(g => {
      if (g.isMaster && g.children) {
        g.children = g.children.filter(cid => !this.selectedGroups.has(cid));
      }
    });
    deleted.forEach(group => {
      this.deleteDurationsForGroup(group.id);
      this.collapsedGroups.delete(group.id);
    });
    if (playerState.currentGroup !== null && this.selectedGroups.has(playerState.currentGroup)) {
      playerState.clearPlayback('Groups deleted');
      this.selectedIndices.clear();
      this.lastSelectedIndex = null;
    }
    this.selectedGroups.clear();
    saveState.markUnsaved();
  }

  deleteVideoInternal(gid: number, vid: number) {
    const group = this.findGroupById(gid);
    if (!group) return;
    const video = group.videos[vid];
    if (!video) return;
    const removedSubtitleKeys = subtitleKeysForVideo(group, video.name);

    group.videos.splice(vid, 1);
    group.videoHandles.splice(vid, 1);
    this.bumpDurationGeneration(gid);

    for (let i = vid; i < group.videos.length; i++) {
      const nextKey = `${gid}-${i + 1}`;
      const currentKey = `${gid}-${i}`;
      if (this.videoDurations.has(nextKey)) {
        this.videoDurations.set(currentKey, this.videoDurations.get(nextKey)!);
      } else {
        this.videoDurations.delete(currentKey);
      }
    }
    this.videoDurations.delete(`${gid}-${group.videos.length}`);

    const newCompleted = new Set<number>();
    group.completed.forEach(idx => {
      if (idx < vid) newCompleted.add(idx);
      else if (idx > vid) newCompleted.add(idx - 1);
    });
    group.completed = newCompleted;

    pruneSubtitleMaps(group, removedSubtitleKeys);

    const newSelection = new SvelteSet<number>();
    this.selectedIndices.forEach(idx => {
      if (idx < vid) newSelection.add(idx);
      else if (idx > vid) newSelection.add(idx - 1);
    });
    this.selectedIndices = newSelection;
    if (this.lastSelectedIndex === vid) this.lastSelectedIndex = null;
    else if (this.lastSelectedIndex !== null && this.lastSelectedIndex > vid) this.lastSelectedIndex--;

    if (playerState.currentGroup === gid) {
      if (playerState.currentVideo === vid) {
        playerState.clearPlayback('Video deleted');
      } else if (playerState.currentVideo !== null && playerState.currentVideo > vid) {
        playerState.currentVideo--;
      }
    }

    saveState.markUnsaved();
  }

  deleteVideosBatchInternal(gid: number) {
    const group = this.findGroupById(gid);
    if (!group) return;
    const indices = Array.from(this.selectedIndices).sort((a, b) => b - a);
    const removedSubtitleKeys = new Set<string>();
    this.bumpDurationGeneration(gid);

    indices.forEach(vid => {
      const video = group.videos[vid];
      if (video) {
        subtitleKeysForVideo(group, video.name).forEach(key => removedSubtitleKeys.add(key));
      }
      group.videos.splice(vid, 1);
      group.videoHandles.splice(vid, 1);
      for (let i = vid; i < group.videos.length; i++) {
        const nextKey = `${gid}-${i + 1}`;
        const currentKey = `${gid}-${i}`;
        if (this.videoDurations.has(nextKey)) {
          this.videoDurations.set(currentKey, this.videoDurations.get(nextKey)!);
        } else {
          this.videoDurations.delete(currentKey);
        }
      }
      this.videoDurations.delete(`${gid}-${group.videos.length}`);

      const newCompleted = new Set<number>();
      group.completed.forEach(idx => {
        if (idx < vid) newCompleted.add(idx);
        else if (idx > vid) newCompleted.add(idx - 1);
      });
      group.completed = newCompleted;
    });

    pruneSubtitleMaps(group, removedSubtitleKeys);

    indices.forEach(vid => {
      if (playerState.currentGroup === gid) {
        if (playerState.currentVideo === vid) {
          playerState.clearPlayback('Video deleted');
        } else if (playerState.currentVideo !== null && playerState.currentVideo > vid) {
          playerState.currentVideo--;
        }
      }
    });

    this.selectedIndices.clear();
    this.lastSelectedIndex = null;
    saveState.markUnsaved();
  }

  loadDurations(group: Group) {
    const prefix = `${group.id}-`;
    const generationKey = this.durationGenerationKey(group.id);
    const generation = (this.durationGenerations.get(generationKey) ?? 0) + 1;
    this.durationGenerations.set(generationKey, generation);

    for (const key of Array.from(this.videoDurations.keys())) {
      if (!key.startsWith(prefix)) continue;
      const index = Number(key.slice(prefix.length));
      if (!Number.isInteger(index) || index >= group.videos.length) this.videoDurations.delete(key);
    }

    for (let i = 0; i < group.videos.length; i++) {
      const vidItem = group.videos[i]!;
      if ('isLink' in vidItem && vidItem.isLink) continue;
      if (isMissingVideo(vidItem)) continue;

      const key = `${prefix}${i}`;
      const url = URL.createObjectURL(vidItem as File);
      const v = document.createElement('video');
      v.preload = 'metadata';
      const cleanup = () => URL.revokeObjectURL(url);
      v.onloadedmetadata = () => {
        cleanup();
        if (this.durationGenerations.get(generationKey) !== generation) return;
        if (Number.isFinite(v.duration)) this.videoDurations.set(key, v.duration);
      };
      v.onerror = cleanup;
      v.src = url;
    }
  }
}

export const groupsState = new GroupsState();
