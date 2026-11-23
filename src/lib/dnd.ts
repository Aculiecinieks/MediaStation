export type DragSrc =
  | { type: 'video'; id: number; index: number }
  | { type: 'video-batch'; gid: number; indices: number[] }
  | { type: 'group'; id: number };

export const dnd = {
  src: null as DragSrc | null,
  dropTarget: null as { gid: number; vid: number | null } | null,
};
