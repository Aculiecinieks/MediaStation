<script lang="ts">
  import { uiState } from '../../stores/ui.svelte';

  let message = $state('');
  let text = $state('Delete');
  let type = $state<'danger' | 'primary'>('danger');

  $effect(() => {
    const c = uiState.confirm;
    message = c.message;
    text = c.text;
    type = c.type;
  });
</script>

{#if uiState.confirm.open}
  <div class="modal active">
    <div class="modal-content" style="max-width: 400px;">
      <div class="modal-header">
        <h3>Confirm Action</h3>
        <button class="close-btn" onclick={() => uiState.resolveConfirm(false)}>×</button>
      </div>
      <div class="modal-body" style="padding: 20px;">
        <p style="color: var(--text-main); margin-bottom: 24px;">{message}</p>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="btn" style="background: var(--bg-active);" onclick={() => uiState.resolveConfirm(false)}>Cancel</button>
          <button class="btn {type === 'danger' ? 'btn-danger' : 'btn-primary'}" onclick={() => uiState.resolveConfirm(true)}>{text}</button>
        </div>
      </div>
    </div>
  </div>
{/if}
