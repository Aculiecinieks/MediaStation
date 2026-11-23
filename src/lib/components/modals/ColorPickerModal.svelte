<script lang="ts">
  import { uiState } from '../../stores/ui.svelte';
  import { groupsState } from '../../stores/groups.svelte';
  import { saveState } from '../../stores/save.svelte';
  import { MASTER_COLORS } from '../../constants';

  function setColor(c: string) {
    if (uiState.colorPickerGid !== null) {
      const g = groupsState.findGroupById(uiState.colorPickerGid);
      if (g) {
        g.masterColor = c;
        saveState.markUnsaved();
      }
    }
    uiState.colorPickerOpen = false;
  }
</script>

{#if uiState.colorPickerOpen}
  <div class="modal active">
    <div class="modal-content" style="max-width: 300px;">
      <div class="modal-header">
        <div style="font-weight: 600;">Season Color</div>
        <button class="btn" style="width: 28px; height: 28px; padding: 0; justify-content: center;"
          onclick={() => uiState.colorPickerOpen = false}>✕</button>
      </div>
      <div class="modal-body" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;">
        {#each MASTER_COLORS as c (c)}
          <div style="background:{c};height:30px;border-radius:4px;cursor:pointer" onclick={() => setColor(c)}></div>
        {/each}
      </div>
    </div>
  </div>
{/if}
