import { settingsState } from '../stores/settings.svelte';
import { groupsState } from '../stores/groups.svelte';
import { playerState } from '../stores/player.svelte';
import { saveState } from '../stores/save.svelte';
import { uiState } from '../stores/ui.svelte';
import { formatTimestamp } from '../utils';
import { saveSubtitleToGroup } from './subtitles';
import { extractYoutubeId } from './youtube';
import { ensureTransformers } from './transformers';

const CANCELLED = 'cancelled';

function checkCancelled(runId: number) {
  if (uiState.aiCancelRequested || uiState.aiRunId !== runId) {
    throw new Error(CANCELLED);
  }
}

export async function resetTranscriber() {
  if (settingsState.transcriber) {
    const old = settingsState.transcriber;
    settingsState.transcriber = null;

    const safeDispose = async (name: string, obj: any) => {
      if (obj && typeof obj.dispose === 'function') {
        try {
          await obj.dispose();
        } catch (e: any) {
          if (e.message && (e.message.includes('invalid session id') || e.message.includes('cannot release session'))) {
            console.log(`${name} was already disposed (session invalid).`);
          } else {
            console.warn(`Failed to dispose ${name}:`, e);
          }
        }
      }
    };

    try {
      await safeDispose('pipeline.tokenizer', old.tokenizer);
      await safeDispose('pipeline.processor', old.processor);
      await safeDispose('pipeline.model', old.model);
      await safeDispose('pipeline', old);
    } catch (e) {
      console.warn('Unexpected error during disposal sequence:', e);
    }
  }
}

export async function getTranscriber(): Promise<any> {
  if (settingsState.useGPU && !(navigator as any).gpu) {
    alert('WebGPU is not supported in this browser. Switching to CPU/WASM.');
    settingsState.useGPU = false;
    settingsState.persist();
  }

  if (!settingsState.transcriber) {
    let dtypeVal: any = settingsState.useGPU ? 'fp32' : 'q8';

    if (settingsState.useGPU) {
      if (settingsState.currentPrecision === 'fp16') dtypeVal = 'fp16';
      else if (settingsState.currentPrecision === 'q4') dtypeVal = 'q4';
      else if (settingsState.currentPrecision === 'hybrid') {
        dtypeVal = { encoder_model: 'fp32', decoder_model_merged: 'q4' };
      }
    }

    const options = {
      device: settingsState.useGPU ? 'webgpu' : 'wasm',
      dtype: dtypeVal,
    };

    await ensureTransformers();
    settingsState.transcriber = await window.transformersPipeline('automatic-speech-recognition', settingsState.currentModel, options);
  }
  return settingsState.transcriber;
}

export async function selectModel(id: string) {
  settingsState.currentModel = id;
  settingsState.persist();
  await resetTranscriber();
}

export async function toggleGPU() {
  settingsState.useGPU = !settingsState.useGPU;
  settingsState.persist();
  await resetTranscriber();
}

export async function selectPrecision(mode: typeof settingsState.currentPrecision) {
  settingsState.currentPrecision = mode;
  settingsState.persist();
  await resetTranscriber();
}

export async function resetAISettings() {
  settingsState.resetDefaults();
  await resetTranscriber();
}

export async function clearAICache() {
  if (!await uiState.showConfirmModal('This will delete all downloaded AI models. Continue?')) return;
  try {
    const cacheNames = await caches.keys();
    let clearedCount = 0;
    for (const name of cacheNames) {
      if (name.includes('transformers') || name.includes('onnx')) {
        await caches.delete(name);
        clearedCount++;
      }
    }
    await resetTranscriber();
    alert(`Cleared ${clearedCount} caches.`);
  } catch (e) {
    console.error(e);
    alert('Error clearing cache');
  }
}

export function convertToVTT(chunks: any[]): string {
  let vtt = 'WEBVTT\n\n';
  chunks.forEach((chunk, index) => {
    if (!chunk.timestamp) return;
    const [start, end] = chunk.timestamp;
    vtt += `${index + 1}\n`;
    vtt += `${formatTimestamp(start)} --> ${formatTimestamp(end)}\n`;
    vtt += `${chunk.text.trim()}\n\n`;
  });
  return vtt;
}

export async function generateSubtitles(url: string, statusCallback: (s: string) => void, runId: number): Promise<string> {
  try {
    checkCancelled(runId);
    statusCallback('Initializing AI Model (this may take a moment)...');
    const transcriber = await getTranscriber();
    checkCancelled(runId);

    statusCallback('Transcribing Audio (this may take several minutes)...');
    const result = await transcriber(url, {
      chunk_length_s: 30,
      return_timestamps: true,
    });
    checkCancelled(runId);

    statusCallback('Formatting Subtitles...');
    return convertToVTT(result.chunks || []);
  } catch (error: any) {
    if (error?.message === CANCELLED) throw error;
    console.error('Transcription error:', error);
    throw new Error(`AI transcription failed: ${error.message}`);
  }
}

export async function startAITranscription(gid: number, vid: number) {
  const group = groupsState.findGroupById(gid);
  const video = group?.videos[vid];
  if (!group || !video) return;
  if ('isMissing' in video && video.isMissing) {
    alert('Cannot generate subtitles: the original video file is missing.');
    return;
  }

  let videoUrl: string | null = null;
  const sourceUrl = 'isLink' in video && video.isLink
    ? (video as any).url as string
    : URL.createObjectURL(video as File);
  videoUrl = sourceUrl;

  playerState.pause();
  uiState.showAI('Initializing AI Model...');
  const runId = uiState.aiRunId;

  try {
    const vttContent = await generateSubtitles(sourceUrl, (status) => {
      uiState.updateAI(status);
    }, runId);

    if (uiState.aiRunId !== runId) return;
    const dur = ((performance.now() - uiState.aiStartTime) / 1000).toFixed(2) + 's';
    settingsState.lastGenDuration = dur;

    saveSubtitleToGroup(group, vid, vttContent);
    uiState.hideAI();
    uiState.syncOpen = false;
    saveState.markUnsaved();

    if (playerState.currentGroup === gid && playerState.currentVideo === vid) {
      playerState.loadVideo(gid, vid);
    }
  } catch (error: any) {
    if (error?.message === CANCELLED) return;
    if (uiState.aiRunId !== runId) return;
    console.error('AI transcription error:', error);
    uiState.failAI(error.message || 'Unknown error during transcription.');
  } finally {
    if (videoUrl && !('isLink' in video && video.isLink)) URL.revokeObjectURL(videoUrl);
  }
}

export async function startBatchAITranscription(gid: number) {
  const indices = Array.from(groupsState.selectedIndices).sort((a, b) => a - b);
  const total = indices.length;

  playerState.pause();
  uiState.showAI(`Preparing to process ${total} videos...`);
  const runId = uiState.aiRunId;

  for (let i = 0; i < total; i++) {
    if (uiState.aiCancelRequested || uiState.aiRunId !== runId) break;
    const vid = indices[i]!;
    const group = groupsState.findGroupById(gid);
    const video = group?.videos[vid];
    if (!group || !video) continue;
    if ('isMissing' in video && video.isMissing) continue;

    const remaining = total - i;
    uiState.updateAI(`Processing video ${i + 1}/${total} (${remaining} left)...`);

    let videoUrl: string | null = null;
    let sourceUrl = '';
    try {
      if ('isLink' in video && video.isLink) sourceUrl = (video as any).url as string;
      else sourceUrl = URL.createObjectURL(video as File);
      videoUrl = sourceUrl;

      const prefix = `Video ${i + 1}/${total}: `;

      const vttContent = await generateSubtitles(sourceUrl, (status) => {
        uiState.updateAI(`${prefix}${status}`);
      }, runId);

      if (uiState.aiRunId !== runId) break;
      saveSubtitleToGroup(group, vid, vttContent);
      saveState.markUnsaved();

      if (!('isLink' in video && video.isLink)) URL.revokeObjectURL(videoUrl);
      videoUrl = null;
    } catch (err: any) {
      if (err?.message === CANCELLED) break;
      console.error(`Error processing video index ${vid}:`, err);
    } finally {
      if (videoUrl && !('isLink' in video && video.isLink)) URL.revokeObjectURL(videoUrl);
    }
  }

  if (uiState.aiRunId !== runId) return;
  uiState.hideAI();

  if (playerState.currentGroup === gid && playerState.currentVideo !== null && groupsState.selectedIndices.has(playerState.currentVideo)) {
    playerState.loadVideo(gid, playerState.currentVideo);
  }
  saveState.markUnsaved();
}

export async function fetchYouTubeCaptions(videoId: string): Promise<string> {
  const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch captions');
  }
  const xml = await response.text();
  return convertYouTubeXMLToVTT(xml);
}

export function convertYouTubeXMLToVTT(xml: string): string {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, 'text/xml');
  const textElements = xmlDoc.getElementsByTagName('text');

  if (textElements.length === 0) {
    throw new Error('No captions found in response');
  }

  let vtt = 'WEBVTT\n\n';
  for (let i = 0; i < textElements.length; i++) {
    const text = textElements[i]!;
    const start = parseFloat(text.getAttribute('start') || '0');
    const dur = parseFloat(text.getAttribute('dur') || '0');
    const end = start + dur;
    const content = (text.textContent || '')
      .replace(/&amp;#39;/g, "'")
      .replace(/&amp;quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\n/g, ' ');

    vtt += `${i + 1}\n`;
    vtt += `${formatTimestamp(start)} --> ${formatTimestamp(end)}\n`;
    vtt += `${content}\n\n`;
  }
  return vtt;
}

export async function startYouTubeCaptionFetch(gid: number, vid: number, videoId: string) {
  uiState.showAI('Fetching YouTube captions...');
  const runId = uiState.aiRunId;
  try {
    const vttContent = await fetchYouTubeCaptions(videoId);
    if (uiState.aiRunId !== runId) return;
    const group = groupsState.findGroupById(gid);
    if (group) {
      saveSubtitleToGroup(group, vid, vttContent);
      saveState.markUnsaved();
    }
    uiState.hideAI();
    uiState.syncOpen = false;
    if (playerState.currentGroup === gid && playerState.currentVideo === vid) {
      playerState.loadVideo(gid, vid);
    }
  } catch (error) {
    if (uiState.aiRunId !== runId) return;
    console.error('YouTube caption fetch error:', error);
    uiState.failAI('Failed to fetch YouTube captions. The video may not have captions available.');
  }
}

export { extractYoutubeId };
