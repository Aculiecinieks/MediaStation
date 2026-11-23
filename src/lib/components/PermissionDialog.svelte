<script lang="ts">
  import { uiState } from '../stores/ui.svelte';
  import { grantSinglePermission, grantNextPermission } from '../services/fsAccess';
</script>

{#if uiState.permissionOpen}
  <div class="permission-dialog">
    <div class="permission-content">
      <div class="permission-header">
        <h2>Permission Required</h2>
        <p>To load your video library, this application needs read access to the following items. Please grant
          access to each item below.</p>
      </div>
      <div class="permission-list">
        {#each uiState.permissionItems as item, index (index)}
          <div class="permission-item">
            <div class="permission-info">
              <div class="permission-icon">
                {#if item.type === 'folder'}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                {:else}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                {/if}
              </div>
              <div class="permission-name" title={item.name}>{item.name}</div>
            </div>
            <div class="permission-status">
              <button class="btn-grant" class:granted={item.granted}
                disabled={item.granted}
                onclick={() => grantSinglePermission(index)}>{item.granted ? 'Granted' : 'Grant'}</button>
            </div>
          </div>
        {/each}
      </div>
      <div class="permission-actions">
        <button class="btn-quick-grant" class:all-granted={uiState.allPermissionsGranted}
          disabled={uiState.allPermissionsGranted}
          onclick={() => grantNextPermission()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>{uiState.allPermissionsGranted ? 'All Granted' : `Grant Next (${uiState.pendingPermissionCount})`}</span>
        </button>
        <div class="permission-actions-right">
          <button class="permission-dialog-btn secondary" onclick={() => uiState.closePermissionDialog()}>Skip</button>
          <button class="permission-dialog-btn secondary" class:primary={uiState.allPermissionsGranted}
            disabled={!uiState.allPermissionsGranted}
            onclick={() => uiState.closePermissionDialog()}>Continue</button>
        </div>
      </div>
    </div>
  </div>
{/if}
