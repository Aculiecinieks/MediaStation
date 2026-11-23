import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { groupsState } from '../stores/groups.svelte';
import { playerState } from '../stores/player.svelte';
import { saveState } from '../stores/save.svelte';
import { MASTER_COLORS, isSubtitleFile, isVideoFile } from '../constants';
import type { Group, SaveFile, SavedGroup, SavedVideoMeta } from '../types';
import { stripExtension } from '../utils';
import { getDirectoryHandle, getHandleFromDB, promptDirectoryRepair, storeDirectoryHandle } from './db';
import { checkAndRequestPermissions } from './fsAccess';

function makeGroup(gData: SavedGroup): Group {
  return {
    id: gData.id,
    name: gData.name,
    videos: [],
    videoHandles: [],
    subtitles: {},
    directoryHandleKey: gData.directoryHandleKey ?? null,
    subtitleDirectoryHandleKey: gData.subtitleDirectoryHandleKey ?? null,
    videoHandlesKey: gData.videoHandlesKey ?? null,
    manualSync: {},
    customSubtitleFiles: { ...(gData.customSubtitleFiles || {}) },
    subtitleRemoved: { ...(gData.subtitleRemoved || {}) },
    completed: new Set(Array.isArray(gData.completed) ? gData.completed : []),
    isMaster: !!gData.isMaster,
    children: Array.isArray(gData.children) ? [...gData.children] : [],
    isLinkGroup: !!gData.isLinkGroup,
    masterColor: gData.masterColor
  };
}

function pushLink(g: Group, meta: SavedVideoMeta) {
  g.videos.push({
    name: meta.name,
    url: meta.url || '',
    isLink: true,
    annotation: meta.annotation || ''
  });
  g.videoHandles.push(null);
}

function pushMissing(g: Group, meta: SavedVideoMeta, handle: FileSystemFileHandle | null = null) {
  g.videos.push({
    name: meta.name,
    isMissing: true,
    annotation: meta.annotation || ''
  });
  g.videoHandles.push(handle);
}

function createNamespace(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function validateSaveFile(data: SaveFile): void {
  if (!data || typeof data !== 'object' || data.version !== 3 || !Array.isArray(data.groups)) {
    throw new Error('Unsupported save file: expected a version 3 save with a groups array.');
  }
  if (data.groupIdCounter !== undefined && !Number.isInteger(data.groupIdCounter)) {
    throw new Error('Invalid save file: groupIdCounter must be an integer.');
  }
  const ids = new Set<number>();
  for (const group of data.groups) {
    if (!group || typeof group !== 'object') throw new Error('Invalid save file: group entry is not an object.');
    if (!Number.isInteger(group.id) || group.id < 0) throw new Error('Invalid save file: group id must be a non-negative integer.');
    if (ids.has(group.id)) throw new Error(`Invalid save file: duplicate group id ${group.id}.`);
    ids.add(group.id);
    if (typeof group.name !== 'string') throw new Error(`Invalid save file: group ${group.id} has no name.`);
    if (group.videos !== undefined && !Array.isArray(group.videos)) throw new Error(`Invalid save file: group ${group.id} videos must be an array.`);
    if (group.children !== undefined && !Array.isArray(group.children)) throw new Error(`Invalid save file: group ${group.id} children must be an array.`);
    if (group.completed !== undefined && !Array.isArray(group.completed)) throw new Error(`Invalid save file: group ${group.id} completed must be an array.`);
    if (Array.isArray(group.videos)) {
      for (const meta of group.videos) {
        if (typeof meta === 'string') continue;
        if (!meta || typeof meta !== 'object' || typeof meta.name !== 'string') {
          throw new Error(`Invalid save file: group ${group.id} has a malformed video entry.`);
        }
      }
    }
    if (Array.isArray(group.children) && group.children.some(id => !Number.isInteger(id))) {
      throw new Error(`Invalid save file: group ${group.id} has malformed children.`);
    }
    if (Array.isArray(group.completed) && group.completed.some(index => !Number.isInteger(index))) {
      throw new Error(`Invalid save file: group ${group.id} has malformed completed indexes.`);
    }
  }
}

async function migrateHandleKey(oldKey: string | null | undefined, newKey: string, namespace: string): Promise<string | null> {
  if (!oldKey) return null;
  if (oldKey.includes(namespace)) return oldKey;
  try {
    const raw = await getHandleFromDB(oldKey);
    if (raw === undefined || raw === null) return oldKey;
    await storeDirectoryHandle(newKey, raw);
    return newKey;
  } catch (e) {
    console.warn('[RESTORE] Failed to namespace handle key:', oldKey, e);
    return oldKey;
  }
}

async function loadHandleArray(key: string | null | undefined): Promise<Array<FileSystemFileHandle | null> | null> {
  if (!key) return null;
  try {
    const value = await getDirectoryHandle(key);
    return Array.isArray(value) ? value as Array<FileSystemFileHandle | null> : null;
  } catch (e) {
    console.warn('[RESTORE] Failed to load file handles:', e);
    return null;
  }
}

async function scanVideoDirectory(dirHandle: any): Promise<Map<string, { file: File; handle: FileSystemFileHandle }>> {
  const files = new Map<string, { file: File; handle: FileSystemFileHandle }>();
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && isVideoFile(entry.name)) {
      try {
        files.set(entry.name, { file: await entry.getFile(), handle: entry });
      } catch (e) {
        console.warn('[RESTORE] Failed to read video file:', entry.name, e);
      }
    }
  }
  return files;
}

async function restoreSubtitles(g: Group) {
  if (!g.subtitleDirectoryHandleKey) return;
  try {
    const dirHandle = await getDirectoryHandle(g.subtitleDirectoryHandleKey);
    if (!dirHandle) return;
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && isSubtitleFile(entry.name)) {
        g.subtitles[stripExtension(entry.name)] = await entry.getFile();
      }
    }
  } catch (e) {
    console.error('Failed to restore subtitles for ' + g.name, e);
  }
}

async function restoreVideos(g: Group, gData: SavedGroup) {
  const rawMetas = Array.isArray(gData.videos) ? gData.videos as Array<SavedVideoMeta | string> : null;
  const metas: SavedVideoMeta[] | null = rawMetas
    ? rawMetas.map(meta => typeof meta === 'string' ? { name: meta } : meta)
    : null;
  const handleArray = await loadHandleArray(g.videoHandlesKey);
  const handleMap = new Map<string, FileSystemFileHandle>();
  for (const handle of handleArray || []) {
    if (handle && typeof handle.name === 'string') handleMap.set(handle.name, handle);
  }
  const aligned = !!(handleArray && metas && handleArray.length === metas.length);
  const handleAt = (index: number, name: string): FileSystemFileHandle | null =>
    aligned ? handleArray![index] ?? null : handleMap.get(name) ?? null;
  const missingHandleNames = metas
    ? metas.filter((meta, index) => !meta.isLink && !handleAt(index, meta.name)).map(meta => meta.name)
    : [];
  const expectedAll = metas ? metas.filter(meta => !meta.isLink).map(meta => meta.name) : [];
  let directoryFiles: Map<string, { file: File; handle: FileSystemFileHandle }> | null = null;
  let preferDirectory = false;
  const allowPartialRepair = missingHandleNames.length === 0;

  if (g.directoryHandleKey) {
    let dirHandle: any = null;
    try {
      dirHandle = await getDirectoryHandle(g.directoryHandleKey);
    } catch (e) {
      console.error(`[RESTORE] Failed to restore directory for "${g.name}":`, e);
    }

    const scan = async (handle: any): Promise<Map<string, { file: File; handle: FileSystemFileHandle }> | null> => {
      if (!handle) return null;
      try {
        return await scanVideoDirectory(handle);
      } catch (e) {
        console.error(`[RESTORE] Failed to scan directory for "${g.name}":`, e);
        return null;
      }
    };

    if (!dirHandle && expectedAll.length > 0) {
      const repaired = await promptDirectoryRepair(g.name, expectedAll, allowPartialRepair);
      if (repaired) {
        await storeDirectoryHandle(g.directoryHandleKey, repaired);
        dirHandle = repaired;
        preferDirectory = true;
      }
    }

    if (dirHandle) directoryFiles = await scan(dirHandle);

    if (dirHandle && !directoryFiles && expectedAll.length > 0) {
      const repaired = await promptDirectoryRepair(g.name, expectedAll, allowPartialRepair);
      if (repaired) {
        await storeDirectoryHandle(g.directoryHandleKey, repaired);
        dirHandle = repaired;
        preferDirectory = true;
        directoryFiles = await scan(dirHandle);
      }
    }

    if (dirHandle && directoryFiles) {
      const checkNames = missingHandleNames.length > 0 ? missingHandleNames : expectedAll;
      const matched = checkNames.filter(name => directoryFiles!.has(name)).length;
      const invalid = missingHandleNames.length > 0
        ? matched < missingHandleNames.length * 0.5
        : expectedAll.length > 0 && matched === 0;
      if (invalid) {
        const repaired = await promptDirectoryRepair(g.name, checkNames, allowPartialRepair);
        if (repaired) {
          await storeDirectoryHandle(g.directoryHandleKey, repaired);
          dirHandle = repaired;
          preferDirectory = true;
          directoryFiles = await scan(dirHandle);
        }
      }
    }
  }

  if (metas) {
    if (metas.length === 0) return;
    for (let i = 0; i < metas.length; i++) {
      const meta = metas[i]!;
      if (meta.isLink) {
        pushLink(g, meta);
        continue;
      }

      const dirEntry = directoryFiles?.get(meta.name);
      if (preferDirectory && dirEntry) {
        if (meta.annotation) (dirEntry.file as any).annotation = meta.annotation;
        g.videos.push(dirEntry.file);
        g.videoHandles.push(dirEntry.handle);
        continue;
      }

      const handle = handleAt(i, meta.name);
      if (handle) {
        try {
          const file = await handle.getFile();
          if (meta.annotation) (file as any).annotation = meta.annotation;
          g.videos.push(file);
          g.videoHandles.push(handle);
          continue;
        } catch (e) {
          console.warn('Failed to retrieve file from handle:', meta.name, e);
        }
      }

      if (dirEntry) {
        if (meta.annotation) (dirEntry.file as any).annotation = meta.annotation;
        g.videos.push(dirEntry.file);
        g.videoHandles.push(dirEntry.handle);
        continue;
      }

      pushMissing(g, meta, handle);
    }
    return;
  }

  if (directoryFiles) {
    const entries = Array.from(directoryFiles.values()).sort((a, b) => a.file.name.localeCompare(b.file.name));
    for (const entry of entries) {
      g.videos.push(entry.file);
      g.videoHandles.push(entry.handle);
    }
    return;
  }

  for (const handle of Array.from(handleMap.values())) {
    try {
      g.videos.push(await handle.getFile());
      g.videoHandles.push(handle);
    } catch (e) {
      console.warn('Failed to retrieve file from handle:', handle.name, e);
    }
  }
}

export async function getSaveDataAsync(): Promise<SaveFile> {
  const namespace = saveState.ensureHandleNamespace();
  const groupsData: SavedGroup[] = await Promise.all(groupsState.videoGroups.map(async g => {
    const customSubtitles: Record<string, string> = { ...(g.customSubtitleFiles || {}) };
    for (const [base, source] of Object.entries(g.manualSync || {})) {
      if (customSubtitles[base] !== undefined) continue;
      try {
        customSubtitles[base] = await (source as Blob).text();
      } catch {
        /* unreadable subtitle blob */
      }
    }

    const gData: SavedGroup = {
      id: g.id,
      name: g.name,
      isMaster: g.isMaster,
      isLinkGroup: g.isLinkGroup,
      masterColor: g.masterColor,
      directoryHandleKey: g.isMaster ? null : g.directoryHandleKey,
      subtitleDirectoryHandleKey: g.isMaster ? null : g.subtitleDirectoryHandleKey,
      videoHandlesKey: null,
      children: g.isMaster ? g.children : [],
      videos: [],
      subtitles: Object.keys(g.subtitles),
      manualSync: {},
      customSubtitleFiles: customSubtitles,
      subtitleRemoved: g.subtitleRemoved || {},
      completed: Array.from(g.completed)
    };

    if (!g.isMaster) {
      g.directoryHandleKey = await migrateHandleKey(g.directoryHandleKey, `video_dir_${namespace}_${g.id}`, namespace);
      g.subtitleDirectoryHandleKey = await migrateHandleKey(g.subtitleDirectoryHandleKey, `subtitle_dir_${namespace}_${g.id}`, namespace);
      gData.directoryHandleKey = g.directoryHandleKey;
      gData.subtitleDirectoryHandleKey = g.subtitleDirectoryHandleKey;
      gData.videos = g.videos.map(v => ({
        name: v.name,
        isLink: 'isLink' in v ? v.isLink : undefined,
        url: 'url' in v ? v.url : undefined,
        annotation: v.annotation || ''
      } as SavedVideoMeta));
    }

    const alignedHandles = g.videos.map((_, index) => g.videoHandles[index] ?? null);
    const handleCount = alignedHandles.filter(handle => !!handle).length;
    const expectedFiles = g.videos.filter(v => !('isLink' in v) && !('isMissing' in v)).length;
    if (!g.isMaster && handleCount > 0) {
      const key = `video_handles_${namespace}_${g.id}`;
      const oldKey = g.videoHandlesKey;
      if (handleCount >= expectedFiles || !oldKey) {
        await storeDirectoryHandle(key, alignedHandles);
        gData.videoHandlesKey = key;
        g.videoHandlesKey = key;
      } else {
        gData.videoHandlesKey = oldKey;
      }
    } else if (!g.isMaster && g.videoHandlesKey) {
      gData.videoHandlesKey = g.videoHandlesKey;
    }

    return gData;
  }));

  return {
    version: 3,
    timestamp: Date.now(),
    autoplayEnabled: playerState.autoplayEnabled,
    colorIndex: 0,
    handleNamespace: namespace,
    groups: groupsData,
    collapsedGroups: Array.from(groupsState.collapsedGroups),
    videoDurations: Array.from(groupsState.videoDurations.entries()),
    currentGroup: playerState.currentGroup,
    currentVideo: playerState.currentVideo,
    groupIdCounter: groupsState.groupIdCounter
  };
}

export async function restoreState(data: SaveFile): Promise<void> {
  validateSaveFile(data);

  const namespace = typeof data.handleNamespace === 'string' && data.handleNamespace
    ? data.handleNamespace
    : createNamespace();

  const restored: Group[] = [];
  for (const gData of data.groups) {
    const g = makeGroup(gData);
    for (const [name, content] of Object.entries(g.customSubtitleFiles)) {
      g.manualSync[name] = new Blob([content], { type: 'text/vtt' });
    }
    if (!g.isMaster) {
      g.directoryHandleKey = await migrateHandleKey(g.directoryHandleKey, `video_dir_${namespace}_${g.id}`, namespace);
      g.subtitleDirectoryHandleKey = await migrateHandleKey(g.subtitleDirectoryHandleKey, `subtitle_dir_${namespace}_${g.id}`, namespace);
      g.videoHandlesKey = await migrateHandleKey(g.videoHandlesKey, `video_handles_${namespace}_${g.id}`, namespace);
    } else if (!g.masterColor) {
      g.masterColor = MASTER_COLORS[0];
    }
    restored.push(g);
  }

  await checkAndRequestPermissions(restored);

  for (let i = 0; i < restored.length; i++) {
    const g = restored[i]!;
    if (!g.isMaster) {
      await restoreSubtitles(g);
      await restoreVideos(g, data.groups[i]!);
    }
  }

  const maxId = restored.reduce((max, g) => Math.max(max, g.id), -1);
  groupsState.videoGroups = restored;
  groupsState.collapsedGroups = new SvelteSet(Array.isArray(data.collapsedGroups) ? data.collapsedGroups : []);
  groupsState.selectedGroups.clear();
  groupsState.selectedIndices.clear();
  groupsState.lastSelectedIndex = null;
  groupsState.renamingGroup = null;
  groupsState.clearDurationGenerations();
  groupsState.videoDurations = new SvelteMap(
    (Array.isArray(data.videoDurations) ? data.videoDurations : [])
      .filter((entry): entry is [string, number] => Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number')
  );
  groupsState.groupIdCounter = Math.max(data.groupIdCounter || 0, maxId + 1);

  const targetGroup = data.currentGroup !== null && data.currentGroup !== undefined
    ? restored.find(g => g.id === data.currentGroup)
    : undefined;
  const targetVideo = targetGroup && data.currentVideo !== null && data.currentVideo !== undefined
    ? targetGroup.videos[data.currentVideo]
    : undefined;

  playerState.autoplayEnabled = data.autoplayEnabled !== undefined ? data.autoplayEnabled : true;
  if (targetGroup && targetVideo) {
    playerState.currentGroup = targetGroup.id;
    playerState.currentVideo = data.currentVideo!;
    try {
      await playerState.loadVideo(targetGroup.id, data.currentVideo!);
    } catch (e) {
      console.warn('Failed to load restored video:', e);
      playerState.clearPlayback('Select a video folder or load a save to start');
    }
  } else {
    playerState.clearPlayback('Select a video folder or load a save to start');
  }
  saveState.handleNamespace = namespace;
  saveState.markSaved();
}
