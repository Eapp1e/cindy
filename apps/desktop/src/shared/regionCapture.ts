import type { RegionPoint, RegionRect, RegionScreenshotBitmap } from './regionScreenshot';

export type RegionCaptureMode = 'scroll' | 'video' | 'gif';
export interface RegionCaptureBegin {
  mode: RegionCaptureMode;
  selection: RegionRect;
  first: RegionScreenshotBitmap;
  scrollLayout?: ScrollCaptureLayout;
  recordingLayout?: { viewport: { width: number; height: number }; controls: RegionRect };
}
export interface RecordingPreviewDocument {
  token: string;
  locale: string;
  bytes: Uint8Array<ArrayBuffer>;
  format: 'webm' | 'gif';
}
export const RECORDING_PREVIEW_CHANNEL = {
  READY: 'recording-preview:ready', BEGIN: 'recording-preview:begin', END: 'recording-preview:end',
  PAINTED: 'recording-preview:painted', FAILED: 'recording-preview:failed',
  CLOSE: 'recording-preview:close', MINIMIZE: 'recording-preview:minimize',
  SAVE: 'recording-preview:save', COPY: 'recording-preview:copy', ACTIVITY: 'recording-preview:activity',
} as const;
export interface RegionCaptureFrame {
  image: RegionScreenshotBitmap;
  cursor: RegionPoint | null;
  keys: string[] | null;
  autoScrolling?: boolean;
}
export interface ScrollCaptureLayout {
  viewport: { width: number; height: number };
  preview: RegionRect;
  auto: RegionRect;
  actions: RegionRect;
}
export const REGION_CAPTURE_CHANNEL = {
  START: 'region-screenshot:live-start',
  FRAME: 'region-screenshot:live-frame',
  SAVE: 'region-screenshot:live-save',
  EDIT: 'region-screenshot:live-edit',
  HOLD: 'region-screenshot:live-hold',
  AUTO_SCROLL: 'region-screenshot:auto-scroll',
  CONTROLS: 'region-screenshot:recording-controls',
  PREVIEW: 'region-screenshot:recording-preview',
} as const;
export const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
export const MAX_RECORDING_MS = 5 * 60_000;

/** Controls stay on the capture display and outside its pixels, even while dragged. */
export function recordingControlsBounds(selection: RegionRect, viewport: { width: number; height: number }, expanded: boolean, point?: RegionPoint): RegionRect | null {
  const width = 460, height = expanded ? 336 : 72, gap = 8;
  const spaces = [
    { x: gap, y: selection.y + selection.height + gap, width: viewport.width - 2 * gap, height: viewport.height - selection.y - selection.height - 2 * gap },
    { x: gap, y: gap, width: viewport.width - 2 * gap, height: selection.y - 2 * gap },
    { x: selection.x + selection.width + gap, y: gap, width: viewport.width - selection.x - selection.width - 2 * gap, height: viewport.height - 2 * gap },
    { x: gap, y: gap, width: selection.x - 2 * gap, height: viewport.height - 2 * gap },
  ];
  const candidates = spaces.filter((r) => r.width >= width && r.height >= height).map((r) => ({
    x: Math.round(Math.max(r.x, Math.min(r.x + r.width - width, point?.x ?? selection.x + selection.width - width))),
    y: Math.round(Math.max(r.y, Math.min(r.y + r.height - height, point?.y ?? (r.y > selection.y ? r.y : selection.y - height - gap)))),
    width, height,
  }));
  if (point) candidates.sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y));
  return candidates[0] ?? null;
}

/** The preview/actions belong to the selection and never cover source pixels. */
export function scrollCaptureLayout(selection: RegionRect, viewport: { width: number; height: number }): ScrollCaptureLayout | null {
  if (viewport.width < 304) return null;
  const gap = 12, minimumWidth = 208, preferredWidth = Math.min(640, Math.max(400, selection.width * 0.6));
  const right = selection.x + selection.width;
  const bottom = selection.y + selection.height;
  const rightSpace = viewport.width - right - gap - 8;
  const leftSpace = selection.x - gap - 8;
  const useRight = rightSpace >= minimumWidth;
  const sideSpace = useRight ? rightSpace : leftSpace;
  const width = Math.min(preferredWidth, sideSpace >= minimumWidth ? sideSpace : preferredWidth);
  const sideX = sideSpace >= minimumWidth ? (useRight ? right + gap : selection.x - width - gap) : null;
  const below = viewport.height - bottom >= 52;
  const above = selection.y >= 52;
  if (!below && !above) return null;
  const auto = { x: Math.max(0, Math.min(viewport.width - 132, selection.x + (selection.width - 132) / 2)), y: below ? bottom + 8 : selection.y - 40, width: 132, height: 32 };
  const actions = { x: Math.max(152, Math.min(viewport.width - 152, right - 144)), y: auto.y, width: 144, height: 32 };
  auto.x = Math.max(8, Math.min(auto.x, actions.x - auto.width - gap));
  if (sideX !== null) {
    const anchor = Math.min(viewport.height - 8, bottom);
    return { viewport, auto, actions, preview: { x: sideX, y: 8, width, height: anchor - 8 } };
  }
  // Wide selections place the thumbnail above/below, still on this display.
  const available = below ? viewport.height - bottom - 56 : selection.y - 56;
  const previewHeight = Math.min(220, available);
  if (previewHeight < 48) return null;
  const preview = { x: Math.max(8, Math.min(viewport.width - width - 8, right - width)), y: below ? bottom + 48 : selection.y - previewHeight - 48, width, height: previewHeight };
  return { viewport, auto, actions, preview };
}

/** Shared by native hit-testing and the bottom-anchored preview. */
export function scrollPreviewBounds(layout: ScrollCaptureLayout, visibleHeight: number): RegionRect {
  const height = Math.max(1, Math.min(layout.preview.height, visibleHeight));
  return { ...layout.preview, y: layout.preview.y + layout.preview.height - height, height };
}

/** Only fixed-format clip bytes cross the export bridge; paths never do. */
export function validRecordingBytes(raw: unknown, format: unknown): raw is Uint8Array {
  if (!(raw instanceof Uint8Array) || raw.length < 16 || raw.length > MAX_RECORDING_BYTES) return false;
  if (format === 'gif') return String.fromCharCode(...raw.subarray(0, 6)) === 'GIF89a' && raw[raw.length - 1] === 0x3b;
  return format === 'webm' && raw[0] === 0x1a && raw[1] === 0x45 && raw[2] === 0xdf && raw[3] === 0xa3;
}
