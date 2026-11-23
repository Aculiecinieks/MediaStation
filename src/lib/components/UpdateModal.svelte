<script lang="ts">
  import { updatesState } from '../stores/updates.svelte';
</script>

{#if updatesState.open}
  <div class="modal active" onclick={(e) => { if (e.target === e.currentTarget) updatesState.closePanel(); }}>
    <div class="modal-content" style="max-width: 460px;">
      <div class="modal-header">
        <h3>Updates</h3>
        <button class="close-btn" onclick={() => updatesState.closePanel()}>×</button>
      </div>

      <div class="modal-body" style="padding: 20px;">
        {#if updatesState.checking && !updatesState.available}
          <p class="update-meta">Checking for updates...</p>
        {:else if updatesState.error}
          <p class="update-error">{updatesState.error}</p>
        {/if}

        {#if updatesState.available}
          <div class="update-version">Version {updatesState.version} is available</div>
          {#if updatesState.currentVersion}
            <div class="update-meta">You have {updatesState.currentVersion}</div>
          {/if}
          {#if updatesState.date}
            <div class="update-meta">{updatesState.date.slice(0, 10)}</div>
          {/if}
          {#if updatesState.notes}
            <div class="update-notes">{updatesState.notes}</div>
          {/if}

          {#if updatesState.downloading || updatesState.installing}
            <div class="update-progress">
              <div class="progress-bar">
                <div class="progress-fill" style="width:{updatesState.progressPct}%"></div>
              </div>
              <div class="update-meta">
                {updatesState.installing ? 'Installing. The app will restart.' : updatesState.progressLabel}
              </div>
            </div>
          {:else}
            <button class="btn btn-primary" style="width: 100%; justify-content: center; margin-top: 18px;"
              disabled={updatesState.checking}
              onclick={() => updatesState.install()}>
              Download and install
            </button>
          {/if}
        {:else if !updatesState.checking && updatesState.checked}
          <p class="update-meta">You are running the latest version.</p>
        {/if}
      </div>

      <div class="modal-foot">
        <span class="foot-version">Updates are downloaded from GitHub Releases</span>
        <div style="display:flex;gap:8px;">
          <button class="btn" disabled={updatesState.checking || updatesState.downloading || updatesState.installing}
            onclick={() => updatesState.check(true)}>Check again</button>
          <button class="btn btn-primary" onclick={() => updatesState.closePanel()}>Close</button>
        </div>
      </div>
    </div>
  </div>
{/if}
