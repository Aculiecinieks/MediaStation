import type { Group } from '../types';
import { stripExtension } from '../utils';

export function subtitleKeyPrefixMatches(key: string, filename: string): boolean {
  const base = stripExtension(filename);
  const startsWithFile = key.startsWith(filename);
  const startsWithBase = key.startsWith(base);
  if (!startsWithFile && !startsWithBase) return false;
  const remainder = key.substring(startsWithFile ? filename.length : base.length);
  return !remainder || /^[ _\-\(]/.test(remainder);
}

export function subtitleKeyMatchesVideo(key: string, filename: string): boolean {
  if (key === stripExtension(filename)) return true;
  if (subtitleKeyPrefixMatches(key, filename)) return true;
  return key.includes(filename) || key.includes(stripExtension(filename));
}

export function subtitleKeyOwner(key: string, videos: Array<{ name: string }>): string | null {
  let owner: string | null = null;
  let ownerLength = -1;
  for (const video of videos) {
    if (!subtitleKeyMatchesVideo(key, video.name)) continue;
    const length = stripExtension(video.name).length;
    if (length > ownerLength) {
      owner = video.name;
      ownerLength = length;
    }
  }
  return owner;
}

export function subtitleKeysForVideo(group: Group, filename: string, includeSubstring = true): string[] {
  const keys = new Set<string>();
  const base = stripExtension(filename);
  for (const map of [group.manualSync, group.customSubtitleFiles, group.subtitles]) {
    for (const key of Object.keys(map)) {
      if (key === base || subtitleKeyPrefixMatches(key, filename) || (includeSubstring && subtitleKeyMatchesVideo(key, filename))) {
        keys.add(key);
      }
    }
  }
  return Array.from(keys);
}

export function pruneSubtitleMaps(group: Group, candidateKeys: Iterable<string>): void {
  const videos = group.videos;
  for (const key of candidateKeys) {
    if (videos.some(v => subtitleKeyMatchesVideo(key, v.name))) continue;
    delete group.manualSync[key];
    delete group.customSubtitleFiles[key];
    delete group.subtitles[key];
  }
  if (group.subtitleRemoved) {
    for (const key of Object.keys(group.subtitleRemoved)) {
      if (!videos.some(v => subtitleKeyMatchesVideo(key, v.name))) delete group.subtitleRemoved[key];
    }
  }
}

export function getSubtitle(group: Group, filename: string): Blob | File | null {
  const base = stripExtension(filename);
  if (group.subtitleRemoved?.[base]) return null;

  if (group.manualSync[base]) return group.manualSync[base]!;
  if (group.subtitles[base]) return group.subtitles[base]!;

  const subKeys = Object.keys(group.subtitles);

  for (const key of subKeys) {
    if (subtitleKeyPrefixMatches(key, filename)) {
      return group.subtitles[key]!;
    }
  }

  for (const key of subKeys) {
    if (key.includes(filename) || key.includes(base)) {
      return group.subtitles[key]!;
    }
  }

  return null;
}

export function saveSubtitleToGroup(group: Group, videoIndex: number, vttContent: string) {
  const video = group.videos[videoIndex];
  if (!video) return;
  const videoBase = stripExtension(video.name);

  const blob = new Blob([vttContent], { type: 'text/vtt' });

  if (!group.customSubtitleFiles) {
    group.customSubtitleFiles = {};
  }
  group.customSubtitleFiles[videoBase] = vttContent;
  group.manualSync[videoBase] = blob;
  if (group.subtitleRemoved) delete group.subtitleRemoved[videoBase];
}

export function removeSubtitleFromGroup(group: Group, videoIndex: number) {
  const video = group.videos[videoIndex];
  if (!video) return;
  const videoBase = stripExtension(video.name);

  if (!group.subtitleRemoved) group.subtitleRemoved = {};
  group.subtitleRemoved[videoBase] = true;
  delete group.manualSync[videoBase];
  delete group.customSubtitleFiles[videoBase];
  delete group.subtitles[videoBase];
}
