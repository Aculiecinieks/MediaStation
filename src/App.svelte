<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import Header from './lib/components/Header.svelte';
  import Playlist from './lib/components/playlist/Playlist.svelte';
  import Player from './lib/components/player/Player.svelte';
  import SettingsModal from './lib/components/modals/SettingsModal.svelte';
  import SyncModal from './lib/components/modals/SyncModal.svelte';
  import AddLinkModal from './lib/components/modals/AddLinkModal.svelte';
  import ColorPickerModal from './lib/components/modals/ColorPickerModal.svelte';
  import ConfirmModal from './lib/components/modals/ConfirmModal.svelte';
  import PermissionDialog from './lib/components/PermissionDialog.svelte';
  import ContextMenu from './lib/components/ContextMenu.svelte';
  import AiLoadingOverlay from './lib/components/AiLoadingOverlay.svelte';
  import UpdateModal from './lib/components/UpdateModal.svelte';
  import { registerHotkeys } from './lib/hotkeys';
  import { initDB, getHandleFromDB, SAVE_FILE_KEY } from './lib/services/db';
  import { restoreState } from './lib/services/savefile';
  import { initYouTubeAPI } from './lib/services/youtube';
  import { saveState } from './lib/stores/save.svelte';
  import { groupsState } from './lib/stores/groups.svelte';
  import { playerState } from './lib/stores/player.svelte';
  import { updatesState } from './lib/stores/updates.svelte';
  import { buildFixture } from './lib/fixtures/sampleSave';

  onMount(() => {
    const guardUnsaved = (e: BeforeUnloadEvent) => {
      if (saveState.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guardUnsaved);
    return () => window.removeEventListener('beforeunload', guardUnsaved);
  });

  onMount(() => {
    const initial = setTimeout(() => updatesState.check(), 5000);
    const timer = setInterval(() => updatesState.check(), 6 * 60 * 60 * 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  });

  onMount(async () => {
    registerHotkeys();
    initYouTubeAPI();

    if (import.meta.env.VITE_USE_FIXTURES === 'true') {
      const fx = buildFixture();
      groupsState.videoGroups = fx.groups;
      groupsState.videoDurations = new SvelteMap(fx.durations);
      groupsState.groupIdCounter = fx.groupIdCounter;
      playerState.loadVideo(fx.currentGroup, fx.currentVideo);
      return;
    }

    try {
      await initDB();
      const handle = await getHandleFromDB(SAVE_FILE_KEY);
      if (handle) {
        try {
          const perm = await handle.queryPermission({ mode: 'read' });
          if (perm === 'granted') {
            const file = await handle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            await restoreState(data);
            saveState.currentSaveFileHandle = handle;
            saveState.currentSaveFileName = handle.name;
          }
        } catch (e) {
          console.warn('Failed to auto-load save file:', e);
        }
      }
    } catch (e) {
      console.error('Initialization failed:', e);
    }
  });
</script>

<Header />

<div class="content">
  <Playlist />
  <Player />
</div>

<SettingsModal />
<SyncModal />
<AddLinkModal />
<ColorPickerModal />
<ConfirmModal />
<PermissionDialog />
<ContextMenu />
<AiLoadingOverlay />
<UpdateModal />
