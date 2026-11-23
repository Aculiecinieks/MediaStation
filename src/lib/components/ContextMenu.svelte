<script lang="ts">
  import { uiState } from '../stores/ui.svelte';
</script>

{#if uiState.contextMenu}
  {@const menu = uiState.contextMenu}
  <div class="context-menu" style="top:{menu.y}px;left:{menu.x}px;display:block;">
    {#each menu.items as item, i}
      {#if i === menu.items.length - 1 && item.danger}
        <div class="context-menu-sep"></div>
      {/if}
      <div class="context-menu-item" class:danger={item.danger}
        onclick={() => { uiState.contextMenu = null; item.action(); }}>
        {item.label}
      </div>
    {/each}
  </div>
{/if}
