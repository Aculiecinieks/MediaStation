<script lang="ts">
  import { uiState } from '../stores/ui.svelte';

  let elapsed = $state('0.0');

  $effect(() => {
    if (uiState.aiStatus !== null) {
      const start = uiState.aiStartTime;
      const tickFn = () => {
        elapsed = ((performance.now() - start) / 1000).toFixed(1);
      };
      tickFn();
      const interval = setInterval(tickFn, 100);
      return () => clearInterval(interval);
    }
  });
</script>

{#if uiState.aiStatus !== null && uiState.aiError === null}
  <div class="ai-loading-overlay">
    <div class="ai-spinner"></div>
    <div class="ai-status-text">{uiState.aiStatus}</div>
    <div class="ai-timer">{elapsed}s</div>
    <button class="ai-cancel-btn" onclick={() => uiState.cancelAI()}>Cancel</button>
  </div>
{/if}

{#if uiState.aiError !== null}
  <div class="ai-loading-overlay">
    <div style="font-size:28px;margin-bottom:10px;">&#9888;&#65039;</div>
    <div class="ai-status-text" style="color:#f87171;font-weight:600;">Generation failed</div>
    <div class="ai-error-message">{uiState.aiError}</div>
    <button class="ai-cancel-btn" style="background:var(--danger);" onclick={() => uiState.dismissAI()}>Close</button>
  </div>
{/if}
