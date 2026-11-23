import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown update error.';
}

class UpdatesState {
  open = $state(false);
  available = $state(false);
  checking = $state(false);
  checked = $state(false);
  downloading = $state(false);
  installing = $state(false);
  currentVersion = $state('');
  version = $state('');
  notes = $state('');
  date = $state('');
  received = $state(0);
  total = $state(0);
  error = $state<string | null>(null);

  private update: Update | null = null;

  get progressPct(): number {
    if (!this.total) return 0;
    return Math.min(100, Math.round((this.received / this.total) * 100));
  }

  get progressLabel(): string {
    const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
    if (this.total > 0) return `${mb(this.received)} / ${mb(this.total)} MB`;
    if (this.received > 0) return `${mb(this.received)} MB downloaded`;
    return 'Starting download...';
  }

  async check(manual = false) {
    if (this.checking || this.downloading || this.installing) return;
    if (!isTauriRuntime()) {
      if (manual) this.error = 'Updates are only available in the desktop app.';
      return;
    }

    this.checking = true;
    if (manual) this.error = null;

    try {
      const previous = this.update;
      const next = await check({ timeout: 20000 });

      if (previous && previous !== next) {
        try { await previous.close(); } catch { /* already released */ }
      }

      this.update = next;
      this.available = next !== null;
      this.checked = true;
      this.error = null;

      if (next) {
        this.currentVersion = next.currentVersion;
        this.version = next.version;
        this.notes = next.body || '';
        this.date = next.date || '';
      } else {
        this.currentVersion = '';
        this.version = '';
        this.notes = '';
        this.date = '';
      }
    } catch (error) {
      this.checked = false;
      if (manual) this.error = errorMessage(error);
      console.warn('[UPDATER] Check failed:', error);
    } finally {
      this.checking = false;
    }
  }

  async openPanel() {
    this.open = true;
    if (!this.checked) await this.check(true);
  }

  closePanel() {
    this.open = false;
  }

  async install() {
    if (!this.update || this.downloading || this.installing) return;

    this.downloading = true;
    this.installing = false;
    this.error = null;
    this.received = 0;
    this.total = 0;

    const update = this.update;

    try {
      await update.download((event: DownloadEvent) => {
        if (event.event === 'Started') {
          this.total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          this.received += event.data.chunkLength;
        } else if (event.event === 'Finished') {
          this.received = this.total || this.received;
        }
      }, { timeout: 10 * 60 * 1000 });

      this.downloading = false;
      this.installing = true;

      // Windows exits the app after launching the installer. The installer
      // restarts the app by default.
      await update.install({ restartAfterInstall: true });
    } catch (error) {
      this.installing = false;
      this.downloading = false;
      this.error = errorMessage(error);
      console.error('[UPDATER] Install failed:', error);
    } finally {
      this.downloading = false;
    }
  }
}

export const updatesState = new UpdatesState();
