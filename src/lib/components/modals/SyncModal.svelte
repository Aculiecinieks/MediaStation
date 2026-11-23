<script lang="ts">
  import { uiState } from '../../stores/ui.svelte';
  import { groupsState } from '../../stores/groups.svelte';
  import { playerState } from '../../stores/player.svelte';
  import { saveState } from '../../stores/save.svelte';
  import { settingsState } from '../../stores/settings.svelte';
  import { getSubtitle, removeSubtitleFromGroup, subtitleKeyOwner, subtitleKeysForVideo } from '../../services/subtitles';
  import { startAITranscription, startYouTubeCaptionFetch, extractYoutubeId } from '../../services/ai';
  import { stripExtension } from '../../utils';

  let linkTitle = $state('');
  let linkUrl = $state('');

  const group = $derived(uiState.syncGid !== null ? groupsState.findGroupById(uiState.syncGid) : undefined);
  const video = $derived(group && uiState.syncVid !== null ? group.videos[uiState.syncVid] : undefined);
  const youtubeId = $derived(video && 'url' in video ? extractYoutubeId(video.url || '') : null);

  $effect(() => {
    if (uiState.syncOpen && video) {
      linkTitle = video.name || '';
      linkUrl = 'url' in video ? (video.url || '') : '';
    }
  });

  function finishSync() {
    const gid = uiState.syncGid;
    const vid = uiState.syncVid;
    uiState.syncOpen = false;
    saveState.markUnsaved();
    if (gid !== null && vid !== null && playerState.currentGroup === gid && playerState.currentVideo === vid) {
      playerState.loadVideo(gid, vid);
    }
  }

  async function browseLocal() {
    if (!group || uiState.syncVid === null) return;
    try {
      const [fh] = await (window as any).showOpenFilePicker({ types: [{ accept: { 'text/srt': ['.srt', '.vtt'] } }] });
      const f = await fh.getFile();
      const base = stripExtension(group.videos[uiState.syncVid]!.name);

      const text = await f.text();
      if (!group.customSubtitleFiles) group.customSubtitleFiles = {};
      group.customSubtitleFiles[base] = text;

      group.manualSync[base] = f;
      if (group.subtitleRemoved) delete group.subtitleRemoved[base];
      finishSync();
    } catch (e) {
      console.error(e);
    }
  }

  async function saveLinkEdit() {
    if (!group || uiState.syncVid === null || !video) return;
    const newTitle = linkTitle.trim();
    const newUrl = linkUrl.trim();
    if (!newTitle || !newUrl) return alert('Title and URL cannot be empty.');

    const oldName = video.name;
    const oldBase = stripExtension(oldName);
    const newBase = stripExtension(newTitle);
    const wasRemoved = !!group.subtitleRemoved?.[oldBase];
    const ownedKeys = subtitleKeysForVideo(group, oldName, true)
      .filter(key => subtitleKeyOwner(key, group.videos) === oldName);
    const ownedSet = new Set(ownedKeys);

    let resolved: Blob | File | null = null;
    if (!wasRemoved) {
      resolved = group.manualSync[oldBase] || group.subtitles[oldBase] || null;
      if (!resolved) {
        for (const key of ownedKeys) {
          const value = group.manualSync[key] || group.subtitles[key];
          if (value) { resolved = value; break; }
        }
      }
    }

    (video as any).name = newTitle;
    (video as any).url = newUrl;

    if (oldBase !== newBase) {
      const renameKeys = (map: Record<string, any>) => {
        for (const key of Object.keys(map)) {
          if (key !== oldBase && !ownedSet.has(key)) continue;
          if (!key.startsWith(oldBase)) continue;
          const nextKey = newBase + key.slice(oldBase.length);
          if (nextKey === key || map[nextKey] !== undefined) continue;
          map[nextKey] = map[key];
          delete map[key];
        }
      };
      renameKeys(group.manualSync);
      renameKeys(group.customSubtitleFiles);
      if (wasRemoved) {
        delete group.subtitleRemoved![oldBase];
        group.subtitleRemoved![newBase] = true;
      }
      for (const key of ownedSet) {
        if (key.startsWith(oldBase)) continue;
        delete group.manualSync[key];
        delete group.customSubtitleFiles[key];
      }
    }

    if (!wasRemoved && resolved) {
      try {
        const text = await resolved.text();
        if (group.customSubtitleFiles[newBase] === undefined) group.customSubtitleFiles[newBase] = text;
        if (!group.manualSync[newBase]) group.manualSync[newBase] = resolved;
      } catch {
        /* keep existing subtitle mapping */
      }
    }

    for (const key of ownedSet) {
      delete group.subtitles[key];
    }

    const gid = uiState.syncGid;
    const vid = uiState.syncVid;
    if (gid !== null && vid !== null) {
      const key = `${gid}-${vid}`;
      groupsState.videoDurations.delete(key);
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        if (group.videos[vid] !== video) return;
        if (Number.isFinite(probe.duration)) groupsState.videoDurations.set(key, probe.duration);
      };
      probe.src = newUrl;
    }

    if (gid !== null && vid !== null && playerState.currentGroup === gid && playerState.currentVideo === vid) {
      playerState.loadVideo(gid, vid);
    }

    saveState.markUnsaved();
    uiState.syncOpen = false;
  }

  async function manualAssign(key: string) {
    if (!group || uiState.syncVid === null) return;
    const base = stripExtension(group.videos[uiState.syncVid]!.name);
    const file = group.subtitles[key];
    if (!file) return;
    group.manualSync[base] = file;
    if (group.subtitleRemoved) delete group.subtitleRemoved[base];
    try {
      if (!group.customSubtitleFiles) group.customSubtitleFiles = {};
      group.customSubtitleFiles[base] = await file.text();
    } catch {
      /* keep manual override only */
    }
    finishSync();
  }
</script>

{#if uiState.syncOpen && group && video}
  <div class="modal active">
    <div class="modal-content">
      <div class="modal-header">
        <div style="font-weight: 600;">Select Subtitles</div>
        <button class="btn" style="width: 28px; height: 28px; padding: 0; justify-content: center;"
          onclick={() => uiState.syncOpen = false}>✕</button>
      </div>
      <div class="modal-body">
        {#if 'isLink' in video && video.isLink}
          <div style="margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:12px;">
            <div style="font-weight:600; margin-bottom:8px;">Edit Link</div>
            <div style="margin-bottom:8px;">
              <label class="field-label">Title</label>
              <input type="text" class="text-input" bind:value={linkTitle}>
            </div>
            <div style="margin-bottom:8px;">
              <label class="field-label">URL</label>
              <input type="text" class="text-input" bind:value={linkUrl}>
            </div>
            <button class="btn" style="width:100%; justify-content:center; background:var(--primary); color:white; border:none;"
              onclick={saveLinkEdit}>Save Changes</button>
          </div>
        {/if}

        <div>
          {#if getSubtitle(group, video.name)}
            <div class="subtitle-option" style="color: var(--danger);"
              onclick={() => {
                if (uiState.syncVid !== null) {
                  removeSubtitleFromGroup(group, uiState.syncVid);
                  if (playerState.currentGroup === uiState.syncGid && playerState.currentVideo === uiState.syncVid) {
                    playerState.loadVideo(uiState.syncGid!, uiState.syncVid);
                  }
                  saveState.markUnsaved();
                  uiState.syncOpen = false;
                }
              }}>✕ Remove Subtitles</div>
          {/if}

          <div class="subtitle-option file-input-option" onclick={browseLocal}>Browse local file...</div>

          {#if youtubeId}
            <div class="subtitle-option file-input-option"
              onclick={() => uiState.syncGid !== null && uiState.syncVid !== null && youtubeId && startYouTubeCaptionFetch(uiState.syncGid, uiState.syncVid, youtubeId)}>
              Fetch YouTube Captions [Beta, may not work]
            </div>
          {:else}
            <div class="subtitle-option file-input-option"
              onclick={() => uiState.syncGid !== null && uiState.syncVid !== null && startAITranscription(uiState.syncGid, uiState.syncVid)}>
              Generate Subtitles (AI)
              {#if settingsState.lastGenDuration}
                <div style="font-size:11px;opacity:0.6;margin-top:2px;">Last generation took: {settingsState.lastGenDuration}</div>
              {/if}
            </div>
          {/if}

          {#each Object.keys(group.subtitles) as k (k)}
            <div class="subtitle-option" onclick={() => manualAssign(k)}>{k}</div>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}
