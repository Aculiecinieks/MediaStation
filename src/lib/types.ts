export interface LinkVideo {
  name: string;
  url: string;
  isLink: true;
  annotation?: string;
}

export interface MissingVideo {
  name: string;
  isMissing: true;
  annotation?: string;
}

export type AnnotatedFile = File & { annotation?: string };

export type VideoItem = AnnotatedFile | LinkVideo | MissingVideo;

export interface Group {
  id: number;
  name: string;
  videos: VideoItem[];
  videoHandles: (FileSystemFileHandle | null)[];
  subtitles: Record<string, File>;
  directoryHandleKey: string | null;
  subtitleDirectoryHandleKey: string | null;
  videoHandlesKey?: string | null;
  manualSync: Record<string, Blob | File>;
  customSubtitleFiles: Record<string, string>;
  subtitleRemoved?: Record<string, true>;
  completed: Set<number>;
  isMaster: boolean;
  children: number[];
  isLinkGroup: boolean;
  masterColor?: string;
}

export interface SavedVideoMeta {
  name: string;
  isLink?: boolean;
  url?: string;
  annotation?: string;
}

export interface SavedGroup {
  id: number;
  name: string;
  isMaster: boolean;
  isLinkGroup: boolean;
  masterColor?: string;
  directoryHandleKey: string | null;
  subtitleDirectoryHandleKey: string | null;
  videoHandlesKey: string | null;
  children: number[];
  videos: SavedVideoMeta[];
  subtitles: string[];
  manualSync: Record<string, unknown>;
  customSubtitleFiles: Record<string, string>;
  subtitleRemoved?: Record<string, true>;
  completed: number[];
}

export interface SaveFile {
  version: number;
  timestamp: number;
  autoplayEnabled: boolean;
  colorIndex: number;
  handleNamespace?: string;
  groups: SavedGroup[];
  collapsedGroups: number[];
  videoDurations: [string, number][];
  currentGroup: number | null;
  currentVideo: number | null;
  groupIdCounter: number;
}

export function isLink(v: VideoItem): v is LinkVideo {
  return (v as LinkVideo).isLink === true;
}

export function isMissing(v: VideoItem): v is MissingVideo {
  return (v as MissingVideo).isMissing === true;
}

export function videoName(v: VideoItem): string {
  return v.name;
}
