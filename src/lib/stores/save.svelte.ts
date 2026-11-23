import { groupsState } from './groups.svelte';
import { playerState } from './player.svelte';
import { uiState } from './ui.svelte';
import { deleteHandle, SAVE_FILE_KEY, storeDirectoryHandle } from '../services/db';
import { getSaveDataAsync, restoreState } from '../services/savefile';

class SaveState {
  currentSaveFileHandle = $state<FileSystemFileHandle | null>(null);
  currentSaveFileName = $state<string | null>(null);
  hasUnsavedChanges = $state(false);
  handleNamespace = $state<string | null>(null);

  markUnsaved() {
    this.hasUnsavedChanges = true;
  }

  markSaved() {
    this.hasUnsavedChanges = false;
  }

  ensureHandleNamespace(): string {
    if (!this.handleNamespace) {
      const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      this.handleNamespace = random;
    }
    return this.handleNamespace;
  }

  get saveBtnText(): string {
    return this.hasUnsavedChanges ? 'Save ●' : 'Save';
  }

  get folderStatus(): string {
    if (!this.currentSaveFileHandle) return '';
    return `${this.currentSaveFileName ?? ''}${this.hasUnsavedChanges ? ' (Unsaved)' : ''}`;
  }

  async quickSave() {
    try {
      const handle = this.currentSaveFileHandle;
      if (!handle) return this.saveAs();
      const data = await getSaveDataAsync();
      const jsonString = JSON.stringify(data, null, 2);
      const writable = await handle.createWritable();
      await writable.write(jsonString);
      await writable.close();
      this.markSaved();
    } catch (err: any) {
      console.error('Save failed:', err);
      alert('Failed to save file: ' + err.message);
    }
  }

  async saveAs() {
    try {
      const fh = await (window as any).showSaveFilePicker({
        suggestedName: 'media_station_save.json',
        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }]
      });
      this.handleNamespace = null;
      this.ensureHandleNamespace();
      this.currentSaveFileHandle = fh;
      this.currentSaveFileName = fh.name;
      await storeDirectoryHandle(SAVE_FILE_KEY, fh);
      await this.quickSave();
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    }
  }

  async loadSaveFile() {
    try {
      const [fileHandle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
        multiple: false
      });
      const file = await fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);

      if (groupsState.videoGroups.length > 0) {
        const confirmed = await uiState.showConfirmModal(
          'Loading this save will replace the current library. Continue?',
          'Load', 'primary'
        );
        if (!confirmed) return;
      }

      await restoreState(data);

      this.currentSaveFileHandle = fileHandle;
      this.currentSaveFileName = fileHandle.name;
      await storeDirectoryHandle(SAVE_FILE_KEY, fileHandle);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Load error:', err);
        alert('Error loading file: ' + err.message);
      }
    }
  }

  async closeSaveFile() {
    if (groupsState.videoGroups.length > 0) {
      const confirmed = await uiState.showConfirmModal('Are you sure you want to close the file? Unsaved changes will be lost.', 'OK', 'primary');
      if (!confirmed) return;
    }

    await deleteHandle(SAVE_FILE_KEY);

    this.currentSaveFileHandle = null;
    this.currentSaveFileName = 'media_station_save.json';
    this.hasUnsavedChanges = false;
    this.handleNamespace = null;

    groupsState.videoGroups = [];
    groupsState.clearDurationGenerations();
    groupsState.videoDurations.clear();
    groupsState.collapsedGroups.clear();
    groupsState.selectedGroups.clear();
    groupsState.selectedIndices.clear();
    groupsState.lastSelectedIndex = null;
    groupsState.renamingGroup = null;
    groupsState.groupIdCounter = 0;
    uiState.syncOpen = false;
    uiState.contextMenu = null;
    playerState.clearPlayback('Select a video folder or load a save to start');
  }
}

export const saveState = new SaveState();
