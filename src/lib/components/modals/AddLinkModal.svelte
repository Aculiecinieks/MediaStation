<script lang="ts">
  import { uiState } from '../../stores/ui.svelte';
  import { confirmAddLink } from '../../services/fsAccess';

  let title = $state('');
  let url = $state('');

  $effect(() => {
    if (uiState.addLinkOpen) {
      title = '';
      url = '';
    }
  });
</script>

{#if uiState.addLinkOpen}
  <div class="modal active">
    <div class="modal-content">
      <div class="modal-header">
        <div style="font-weight: 600;">Add Embed Link</div>
        <button class="btn" style="width: 28px; height: 28px; padding: 0; justify-content: center;"
          onclick={() => uiState.addLinkOpen = false}>✕</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom: 12px;">
          <label class="field-label">Title</label>
          <input type="text" class="text-input" bind:value={title} placeholder="My Video">
        </div>
        <div style="margin-bottom: 16px;">
          <label class="field-label">Video URL (Direct MP4 or Stream)</label>
          <input type="text" class="text-input" bind:value={url} placeholder="http://localhost:8000/video.mp4">
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn" onclick={() => uiState.addLinkOpen = false}>Cancel</button>
          <button class="btn" style="background:var(--primary); border:none; color:white;"
            onclick={() => confirmAddLink(title.trim(), url.trim())}>Add Link</button>
        </div>
      </div>
    </div>
  </div>
{/if}
