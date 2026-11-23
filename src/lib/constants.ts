export const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mkv', '.webm', '.ogg'] as const;
export const SUBTITLE_EXTENSIONS = ['.srt', '.vtt'] as const;

export function hasExtension(name: string, extensions: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return extensions.some(ext => lower.endsWith(ext));
}

export function isVideoFile(name: string): boolean {
  return hasExtension(name, VIDEO_EXTENSIONS);
}

export function isSubtitleFile(name: string): boolean {
  return hasExtension(name, SUBTITLE_EXTENSIONS);
}

export const MASTER_COLORS = [
  '#18181b', '#27272a', '#3f3f46', '#52525b',
  '#1e1b4b', '#172554', '#0f172a',
  '#312e81', '#4c1d95', '#881337'
];

export interface ModelInfo {
  id: string;
  name: string;
  meta: string;
}

export const MODELS: { standard: ModelInfo[]; distilled: ModelInfo[] } = {
  standard: [
    { id: 'onnx-community/whisper-tiny.en', name: 'Tiny.en', meta: '~40MB · Fastest' },
    { id: 'onnx-community/whisper-base', name: 'Base', meta: '~75MB · Balanced' },
    { id: 'onnx-community/whisper-small', name: 'Small', meta: '~240MB · Best quality' },
  ],
  distilled: []
};

export const SPEEDS = [1, 1.25, 1.5, 2, 0.5];

export const PRECISIONS = [
  { id: 'fp32', name: 'Balanced', meta: 'fp32 · reliable' },
  { id: 'fp16', name: 'Speed', meta: 'fp16 · RTX GPUs' },
  { id: 'q4', name: 'Low Memory', meta: 'q4 · standard GPUs' },
  { id: 'hybrid', name: 'Hybrid', meta: 'Pro · enc fp32 / dec q4' },
] as const;

export type Precision = typeof PRECISIONS[number]['id'];
