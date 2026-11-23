import type { AnnotatedFile, Group } from '../types';
import { MASTER_COLORS } from '../constants';

export interface FixtureData {
  groups: Group[];
  durations: Map<string, number>;
  currentGroup: number;
  currentVideo: number;
  groupIdCounter: number;
}

function fakeFile(name: string): File {
  return new File([''], name, { type: 'video/mp4' });
}

export function buildFixture(): FixtureData {
  const master: Group = {
    id: 3, name: 'Stranger Things', videos: [], videoHandles: [], subtitles: {},
    directoryHandleKey: null, subtitleDirectoryHandleKey: null, manualSync: {}, customSubtitleFiles: {},
    completed: new Set(), isMaster: true, children: [0, 1], isLinkGroup: false, masterColor: '#172554'
  };

  const s1videos: AnnotatedFile[] = [
    fakeFile('S01E01 - The Vanishing of Will Byers.mp4'),
    fakeFile('S01E02 - The Weirdo on Maple Street.mp4'),
    fakeFile('S01E03 - Holly, Jolly.mp4'),
    fakeFile('S01E04 - The Body.mp4'),
  ];
  const season1: Group = {
    id: 0, name: 'Season 1', videos: s1videos, videoHandles: [], subtitles: {},
    directoryHandleKey: null, subtitleDirectoryHandleKey: null,
    manualSync: {
      'S01E01 - The Vanishing of Will Byers': new Blob(['WEBVTT\n\n'], { type: 'text/vtt' }),
      'S01E03 - Holly, Jolly': new Blob(['WEBVTT\n\n'], { type: 'text/vtt' }),
    },
    customSubtitleFiles: {},
    completed: new Set([0, 1]), isMaster: false, children: [], isLinkGroup: false
  };

  const season2: Group = {
    id: 1, name: 'Season 2',
    videos: [fakeFile('S02E01 - MADMAX.mkv'), fakeFile('Stranger Things 2x02 - Trick or Treat, Freak.mp4')],
    videoHandles: [], subtitles: {},
    directoryHandleKey: null, subtitleDirectoryHandleKey: null, manualSync: {}, customSubtitleFiles: {},
    completed: new Set(), isMaster: false, children: [], isLinkGroup: false
  };

  const durations = new Map<string, number>([
    ['0-0', 2910], ['0-1', 2712], ['0-2', 2642], ['0-3', 2995],
    ['1-0', 2933], ['1-1', 3401],
  ]);

  s1videos[2]!.annotation = 'Barb deserved better. Rewatch the lights scene around 32:10 — foreshadowing for the finale.';

  return {
    groups: [master, season1, season2],
    durations,
    currentGroup: 0,
    currentVideo: 2,
    groupIdCounter: 4,
  };
}

export const FIXTURE_MASTER_COLOR = MASTER_COLORS[5];
