<script lang="ts">
  import { uiState } from '../../stores/ui.svelte';
  import { settingsState } from '../../stores/settings.svelte';
  import { MODELS, PRECISIONS } from '../../constants';
  import { clearAICache, resetAISettings, selectModel, selectPrecision, toggleGPU } from '../../services/ai';
  import { getVersion } from '@tauri-apps/api/app';

  let version = $state('1.1');

  $effect(() => {
    if (uiState.settingsOpen) {
      getVersion().then(v => version = v).catch(() => {});
    }
  });
</script>

{#if uiState.settingsOpen}
  <div class="modal active" id="settingsModal" onclick={(e) => { if (e.target === e.currentTarget) uiState.settingsOpen = false; }}>
    <div class="modal-content">
      <div class="modal-header">
        <h3>Settings</h3>
        <button class="close-btn" onclick={() => uiState.settingsOpen = false}>×</button>
      </div>

      <div class="modal-body">
        <div class="sec-card">
          <div class="sec-head">
            <span class="sec-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                <rect x="9" y="9" width="6" height="6"></rect>
                <line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line>
                <line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line>
                <line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line>
                <line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line>
              </svg>
            </span>
            <span class="sec-title">Transcription Engine</span>
            <span class="sec-desc">Whisper · runs locally in your browser</span>
          </div>
          <div class="sec-body">
            <div class="setting-row">
              <div>
                <div class="lbl">GPU Acceleration</div>
                <div class="sub">Uses WebGPU on modern GPUs. Off = CPU/WASM fallback.</div>
              </div>
              <div class="toggle-switch" class:active={settingsState.useGPU} onclick={() => toggleGPU()}>
                <div class="toggle-knob"></div>
              </div>
            </div>

            <div class="sub-label">Standard Models</div>
            <div class="model-grid">
              {#each MODELS.standard as m (m.id)}
                <div class="model-card" class:active={settingsState.currentModel === m.id} onclick={() => selectModel(m.id)}>
                  <div class="model-name">{m.name}</div>
                  <div class="model-meta">{m.meta}</div>
                </div>
              {/each}
            </div>

            <div class="sub-label">Distilled Models <span style="opacity:.5;text-transform:none;font-weight:400;">(Faster)</span></div>
            {#if MODELS.distilled.length === 0}
              <div class="dist-empty">No distilled models available yet.</div>
            {:else}
              <div class="model-grid">
                {#each MODELS.distilled as m (m.id)}
                  <div class="model-card" class:active={settingsState.currentModel === m.id} onclick={() => selectModel(m.id)}>
                    <div class="model-name">{m.name}</div>
                    <div class="model-meta">{m.meta}</div>
                  </div>
                {/each}
              </div>
            {/if}

            <div class="sub-label">Precision Strategy <span style="opacity:.5;text-transform:none;font-weight:400;">(GPU only)</span></div>
            <div class="prec-grid" class:dimmed={!settingsState.useGPU}>
              {#each PRECISIONS as prec (prec.id)}
                <div class="model-card" class:active={settingsState.currentPrecision === prec.id} onclick={() => selectPrecision(prec.id)}>
                  <div class="model-name">{prec.name}</div>
                  <div class="model-meta">{prec.meta}</div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <div class="sec-card">
          <div class="sec-head">
            <span class="sec-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              </svg>
            </span>
            <span class="sec-title">Storage</span>
            <span class="sec-desc">Downloaded models are cached by your browser</span>
          </div>
          <div class="sec-body">
            <div class="setting-row" style="border:none;background:transparent;padding:0;">
              <div>
                <div class="lbl">Cached AI models</div>
                <div class="sub">Models are stored in the browser cache</div>
              </div>
              <button class="btn btn-danger-ghost" onclick={() => clearAICache()}>Clear Cache</button>
            </div>
            <div class="storage-meter"><div class="storage-fill"></div></div>
            <div class="storage-note">Cleared models re-download automatically when next needed.</div>
          </div>
        </div>

        <div class="sec-card">
          <div class="sec-head">
            <span class="sec-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                <line x1="6" y1="10" x2="6" y2="10"></line><line x1="10" y1="10" x2="10" y2="10"></line>
                <line x1="14" y1="10" x2="14" y2="10"></line><line x1="18" y1="10" x2="18" y2="10"></line>
                <line x1="7" y1="14" x2="17" y2="14"></line>
              </svg>
            </span>
            <span class="sec-title">Reference</span>
            <span class="sec-desc">Hotkeys &amp; where to find functions</span>
          </div>
          <div class="sec-body">
            <div class="ref-grid">
              <div>
                <div class="ref-col-title">Hotkeys</div>
                <div class="info-item"><span class="info-label">Create Master Group</span><span class="hotkey">Shift + G</span></div>
                <div class="info-item"><span class="info-label">Play / Pause</span><span class="hotkey">Space</span></div>
                <div class="info-item"><span class="info-label">Fullscreen</span><span class="hotkey">F</span></div>
                <div class="info-item"><span class="info-label">Seek ±5s</span><span class="hotkey">Arrows</span></div>
                <div class="info-item"><span class="info-label">Multi-select</span><span class="hotkey">Shift + Click</span></div>
                <div class="info-item"><span class="info-label">2x Speed</span><span class="hotkey">Hold Mouse</span></div>
              </div>
              <div>
                <div class="ref-col-title">Functions</div>
                <div class="info-item"><span class="info-label">Sort A→Z</span><span style="font-size:11px;">Master context menu</span></div>
                <div class="info-item"><span class="info-label">Move Up/Down</span><span style="font-size:11px;">Group context menu</span></div>
                <div class="info-item"><span class="info-label">Reorder</span><span style="font-size:11px;">Drag &amp; drop groups</span></div>
                <div class="info-item"><span class="info-label">Video Links</span><span class="chip-dev">In Dev</span></div>
                <div class="info-item"><span class="info-label">Save / Load</span><span style="font-size:11px;">Save menu</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-foot">
        <span class="foot-version">Media Station v{version}</span>
        <div style="display:flex;gap:8px;">
          <button class="btn" onclick={() => resetAISettings()}>Reset Defaults</button>
          <button class="btn btn-primary" onclick={() => uiState.settingsOpen = false}>Done</button>
        </div>
      </div>
    </div>
  </div>
{/if}
