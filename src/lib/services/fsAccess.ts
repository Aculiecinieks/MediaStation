import { groupsState } from '../stores/groups.svelte';
import { playerState } from '../stores/player.svelte';
import { saveState } from '../stores/save.svelte';
import { uiState, type PermissionItem } from '../stores/ui.svelte';
import { isSubtitleFile, isVideoFile, VIDEO_EXTENSIONS } from '../constants';
import { stripExtension } from '../utils';
import { getHandleFromDB, storeDirectoryHandle } from './db';

export async function selectVideoFolder() {
  try {
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
    const newGroup = groupsState.createNewGroup(dirHandle.name);
    const videoFiles: File[] = [];
    const handles: any[] = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && isVideoFile(entry.name)) {
        const file = await entry.getFile();
        videoFiles.push(file);
        handles.push(entry);
      }
    }
    if (videoFiles.length === 0) return alert('No supported video files found');
    const sorted = videoFiles.map((f, i) => ({ f, h: handles[i]! })).sort((a, b) => a.f.name.localeCompare(b.f.name));
    newGroup.videos = sorted.map(i => i.f);
    newGroup.videoHandles = sorted.map(i => i.h);
    const key = `video_dir_${saveState.ensureHandleNamespace()}_${newGroup.id}`;
    await storeDirectoryHandle(key, dirHandle);
    newGroup.directoryHandleKey = key;
    groupsState.videoGroups.push(newGroup);
    playerState.currentGroup = newGroup.id;
    groupsState.loadDurations(newGroup);
    if (newGroup.videos.length > 0) playerState.loadVideo(newGroup.id, 0);
    saveState.markUnsaved();
  } catch (err: any) {
    if (err.name !== 'AbortError') alert(err.message);
  }
}

export async function selectIndividualVideos() {
  try {
    const handles = await (window as any).showOpenFilePicker({
      multiple: true,
      types: [{ description: 'Videos', accept: { 'video/*': [...VIDEO_EXTENSIONS] } }]
    });

    if (handles.length === 0) return;

    const newGroup = groupsState.createNewGroup('New Collection');
    const videoFiles: File[] = [];
    const videoHandles: any[] = [];

    for (const h of handles) {
      const file = await h.getFile();
      videoFiles.push(file);
      videoHandles.push(h);
    }

    const sorted = videoFiles.map((f, i) => ({ f, h: videoHandles[i]! })).sort((a, b) => a.f.name.localeCompare(b.f.name));
    newGroup.videos = sorted.map(i => i.f);
    newGroup.videoHandles = sorted.map(i => i.h);

    groupsState.videoGroups.push(newGroup);
    playerState.currentGroup = newGroup.id;
    groupsState.loadDurations(newGroup);
    if (newGroup.videos.length > 0) playerState.loadVideo(newGroup.id, 0);
    saveState.markUnsaved();
  } catch (err: any) {
    if (err.name !== 'AbortError') console.error(err);
  }
}

export async function selectSubtitleFolder() {
  if (groupsState.videoGroups.length === 0 || playerState.currentGroup === null) return alert('Select and load videos first');
  try {
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
    const currentGrpObj = groupsState.findGroupById(playerState.currentGroup);
    if (!currentGrpObj) return;

    let targetGroups = [currentGrpObj];
    const parentMaster = groupsState.videoGroups.find(g => g.isMaster && g.children.includes(playerState.currentGroup!));
    if (parentMaster) {
      targetGroups = parentMaster.children.map(id => groupsState.findGroupById(id)).filter(Boolean) as any[];
    }

    const srtFiles: { name: string; file: File }[] = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && isSubtitleFile(entry.name)) {
        srtFiles.push({ name: stripExtension(entry.name), file: await entry.getFile() });
      }
    }

    for (const g of targetGroups) {
      for (const srt of srtFiles) {
        g.subtitles[srt.name] = srt.file;
      }
      const key = `subtitle_dir_${saveState.ensureHandleNamespace()}_${g.id}`;
      await storeDirectoryHandle(key, dirHandle);
      g.subtitleDirectoryHandleKey = key;
    }

    if (playerState.currentGroup !== null && playerState.currentVideo !== null) {
      playerState.loadVideo(playerState.currentGroup, playerState.currentVideo);
    }
    saveState.markUnsaved();
  } catch (err: any) {
    if (err.name !== 'AbortError') alert(err.message);
  }
}

export function confirmAddLink(title: string, url: string) {
  if (!title || !url) return alert('Please provide both a title and a valid URL.');

  let targetGroup;
  if (playerState.currentGroup !== null) {
    const current = groupsState.findGroupById(playerState.currentGroup);
    if (current && !current.isMaster) targetGroup = current;
  }
  if (!targetGroup) {
    targetGroup = groupsState.createNewGroup('New Collection');
    groupsState.videoGroups.push(targetGroup);
  }

  const linkObj = { name: title, url: url, isLink: true as const };
  targetGroup.videos.push(linkObj);
  targetGroup.videoHandles.push(null);
  if (!targetGroup.directoryHandleKey && targetGroup.videos.every(v => 'isLink' in v && v.isLink)) {
    targetGroup.isLinkGroup = true;
  }

  playerState.currentGroup = targetGroup.id;

  const newIndex = targetGroup.videos.length - 1;
  playerState.loadVideo(targetGroup.id, newIndex);

  const v = document.createElement('video');
  v.onloadedmetadata = () => {
    groupsState.videoDurations.set(`${targetGroup!.id}-${newIndex}`, v.duration);
  };
  v.src = url;

  saveState.markUnsaved();
  uiState.addLinkOpen = false;
}

export async function checkAndRequestPermissions(groups: any[]): Promise<void> {
  const pendingPermissionItems: PermissionItem[] = [];
  const handlesToCheck: { type: 'folder' | 'files'; key: string; name: string }[] = [];
  const seenKeys = new Set<string>();

  for (const g of groups) {
    if (g.directoryHandleKey && !seenKeys.has(g.directoryHandleKey)) {
      handlesToCheck.push({ type: 'folder', key: g.directoryHandleKey, name: g.name });
      seenKeys.add(g.directoryHandleKey);
    }
    if (g.subtitleDirectoryHandleKey && !seenKeys.has(g.subtitleDirectoryHandleKey)) {
      handlesToCheck.push({ type: 'folder', key: g.subtitleDirectoryHandleKey, name: g.name + ' (Subtitles)' });
      seenKeys.add(g.subtitleDirectoryHandleKey);
    }
    if (g.videoHandlesKey && !seenKeys.has(g.videoHandlesKey)) {
      handlesToCheck.push({ type: 'files', key: g.videoHandlesKey, name: g.name });
      seenKeys.add(g.videoHandlesKey);
    }
  }

  for (const item of handlesToCheck) {
    try {
      if (item.type === 'folder') {
        const handle = await getHandleFromDB(item.key);
        if (handle) {
          const status = await handle.queryPermission({ mode: 'read' });
          if (status !== 'granted') {
            pendingPermissionItems.push({ handle, name: item.name, type: 'folder', granted: false });
          }
        }
      } else if (item.type === 'files') {
        const handles = await getHandleFromDB(item.key);
        if (Array.isArray(handles)) {
          for (const handle of handles) {
            if (!handle || typeof handle.queryPermission !== 'function') continue;
            try {
              const status = await handle.queryPermission({ mode: 'read' });
              if (status !== 'granted') {
                pendingPermissionItems.push({ handle, name: handle.name, type: 'file', granted: false });
              }
            } catch (e) {
              console.warn(`[PERMISSIONS] Failed to check file handle for ${item.key}:`, e);
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[PERMISSIONS] Failed to check handle ${item.key}:`, e);
    }
  }

  if (pendingPermissionItems.length === 0) return;

  await uiState.openPermissionDialog(pendingPermissionItems);
}

export async function grantSinglePermission(index: number) {
  const item = uiState.permissionItems[index];
  if (!item || item.granted) return;

  try {
    const status = await item.handle.requestPermission({ mode: 'read' });
    if (status === 'granted') {
      item.granted = true;
    }
  } catch (e: any) {
    console.error(`[PERMISSIONS] Error granting permission for ${item.name}:`, e);
    alert(`Error: ${e.message}`);
  }
}

export async function grantNextPermission() {
  const nextIndex = uiState.permissionItems.findIndex(i => !i.granted);
  if (nextIndex !== -1) {
    await grantSinglePermission(nextIndex);
  }
}
