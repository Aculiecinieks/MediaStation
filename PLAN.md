# PLAN — MediaStation NW.js → Tauri v2 + Svelte 5 Rebuild

## GOAL

Migrate MediaStation off NW.js onto Tauri v2 (WebView2) and rebuild the frontend as Svelte 5 + TypeScript. User goal verbatim: "move this from NW.js to Tauri so its more lightweight" plus "make the code cleaner aswell. More organized."

Why:
- NW.js ships ~280MB runtime folder; Tauri installer ≈ <15 MB, evergreen shared WebView2.
- App uses ZERO `nw.*` / Node APIs (verified by grep over all 5,192 lines) — pure web app. Migration is scaffolding, not porting backend logic.
- WebView2 has native H.264/AAC → deletes the entire custom `ffmpeg.dll` swap hack (`lib/ffmpeg.dll`, `build.mjs` post-step `build.mjs:26-45`, `setup-dev-ffmpeg.mjs`, `package.json` postinstall).
- Single-file HTML (5,192 lines) becomes an organized Svelte component/service tree.

Locked decisions (user-confirmed):
- TypeScript everywhere. Views = Svelte 5 runes. Core services = framework-agnostic plain TS.
- All-at-once migration (no staged parity gates between old/new UI); commit after every slice for bisectability.
- CDNs KEPT: Transformers.js via jsdelivr (`VideoStationVisualizer2.html:1669`), Google Fonts (`:8-10`), HF model hub at runtime. Do NOT vendor. Do NOT touch the inline module script `:1666-1686`; carry it verbatim into new `index.html`.
- Windows-first (matches current win-x64-only target).
- UI must follow `ui-mockup.html` EXACTLY (see MOCKUP section).

Ref (live roots, not backups): `VideoStationVisualizer2.html` = behavioral truth for logic. `ui-mockup.html` = visual truth for UI.

## PRESERVED (invariants)

- **Save-file JSON schema**: produced by `getSaveDataAsync` (`VideoStationVisualizer2.html:4520`) — groups/videos/completed sets/subtitles/annotations/masterColor/manualSync. Format unchanged; old `.json` saves must load.
- **IndexedDB handle store**: DB `VideoPlayerDB` v1, store `directoryHandles`, key `currentSaveFile` (`:1690-1694`). Persisted FileSystemFileHandle/DirectoryHandle semantics unchanged.
- **FS Access API flows**: `showDirectoryPicker/OpenFilePicker/SaveFilePicker`, `queryPermission/requestPermission` re-grant on restore (`:1783-1799`), batch permission dialog (`:4653+ checkAndRequestPermissions/grantSinglePermission/grantNextPermission/finishPermissions/skipPermissions`).
- **Hotkeys**: Shift+G master group, Space play/pause, F fullscreen (`toggleFS :3057` area), Arrows ±5s seek, Shift+Click multi-select, hold-mouse 2x speed.
- **Drag & drop reorder engine**: `handleDrag*/handleVideo*/handleGroup*`, `moveVideosBatch/moveVideo/reorderGroup/moveGroupRelative/sortMasterChildrenAlpha` (`:4090-4330` region). Behavior parity required, implementation may use svelte-dnd-action if exact-match too costly — decide at SLICE11, default = port custom engine.
- **YouTube embed**: iframe API `controls:0` player, sync loop, caption fetch `:2644-2700`.
- **AI transcription**: pipeline options device/dtype incl. hybrid `{encoder fp32, decoder q4}` (`:2403-2419`), model catalog `MODELS` (`:2256-2263`, distilled currently EMPTY array — keep empty, show placeholder), Cache Storage clear filtered on names containing 'transformers'/'onnx' (`:2379-2393`).
- **Window**: 1280×720, title "Media Station", icons `mediastation_icon.ico/png`.
- **Subtitle matching priority**: manualSync → exact → prefix → substring (`getSubtitle :2607-2639`).

## MOCKUP (UI source of truth)

`ui-mockup.html` (repo root). Static single-file preview; double-click to open; contains only cosmetic class-toggle JS. Opened-by-default Settings modal shows the ONLY intentional UI change; everything else is a faithful replica of the current app.

Intentional deviations from legacy rendering (all approved in chat):
1. Settings modal redesigned: three section cards (Transcription Engine / Storage / Reference), sticky footer (version + Reset Defaults/Done), GPU row label-left switch-right, model cards with active checkmark badge, precision grid dims when GPU off, distilled placeholder text. NO tabs.
2. Master group container has NO colored left border stripe (removed per user).
3. Control bar = space-between clusters (was briefly centered in mockup v1; fixed back to legacy layout).

Everything else in mockup replicates legacy DOM/CSS: caret-prefixed group titles (`▼` span), season color dot at far right AFTER stats, SYNC button hover-reveal + checkbox right-aligned in `.playlist-item-actions`, completed items opacity 0.6 (NO strikethrough), active item blue ::before bar, time display inline after next button (`13:07 / 41:10` format), video-info = title + "Subtitle Loaded"/"No Subtitle" + annotation textarea.

Rule for all view slices: **follow ui-mockup.html exactly**. Where mockup and legacy disagree, mockup wins visually; legacy wins for anything mockup doesn't render (context menus, permission dialog internals, sync modal, color picker grid, AI overlay).

## PREREQS

- Rust toolchain (rustup, MSVC) on build machine — user install.
- Node stays (Vite tooling only; zero runtime npm deps besides svelte/vite/ts).
- `npm create tauri-app` svelte-ts template as scaffold base.
- WebView2 Runtime present (Win10/11 default).

## ARCH (files touched, order)

New tree:
```
index.html                  # fonts links + transformers CDN module verbatim; mounts #app
vite.config.ts / svelte.config.js / tsconfig.json / package.json
public/icons/               # mediastation_icon.ico/png (moved)
src/
  main.ts · App.svelte · app.css
  lib/
    types.ts                # VideoItem, Group, MasterGroup, SaveFile
    fixtures/sampleSave.ts  # masters w/ colors, seasons, watched/active states, CC chips, YT link
    stores/groups.svelte.ts · player.svelte.ts · settings.svelte.ts · save.svelte.ts
    services/db.ts · fsAccess.ts · savefile.ts · subtitles.ts · ai.ts · youtube.ts
    components/
      Header.svelte (+ SaveMenu/AddVideoMenu dropdowns)
      playlist/Playlist.svelte · GroupCard.svelte · VideoRow.svelte · ProgressBar.svelte
      player/Player.svelte · ControlBar.svelte · VideoInfo.svelte · EmptyState.svelte
      modals/SettingsModal.svelte · SyncModal.svelte · AddLinkModal.svelte · ColorPickerModal.svelte · ConfirmModal.svelte · PermissionDialog.svelte
      ContextMenu.svelte · AiLoadingOverlay.svelte
src-tauri/tauri.conf.json · Cargo.toml · src/main.rs   # stock, no custom Rust
```

Order rationale: config before code; types/fixtures before stores; stores before components; services independent (can land parallel to B but wired only at SLICE11); tauri.conf last (needs final asset list for CSP).

Delete at end (NW.js layer): `nw`, `nw-builder` devDeps, `build.mjs`, `setup-dev-ffmpeg.mjs`, `postinstall` script, `lib/`, stale `build/`, `cache/`, `MediaStation_V1.1.zip` optional, `window`+`chromium-args`+`build` fields from package.json.

## SLICE1 <config + shell>

Files: package.json, vite.config.ts, svelte.config.js, tsconfig.json, index.html, src/main.ts, src/App.svelte, src/app.css, src-tauri/* (stock).

- Scaffold tauri v2 svelte-ts INTO existing dir (keep ui-mockup.html, legacy HTML untouched until SLICE12).
- `index.html`: Inter font links + transformers inline module copied verbatim from `VideoStationVisualizer2.html:1666-1686` (sets `window.transformersPipeline/Env/Ready`).
- `app.css`: copy `:root` vars + resets + scrollbar styles from `:12-46`, `:1181-1198`.
- Gate: `npm run dev` renders empty shell; `npm run tauri dev` opens 1280×720 window titled "Media Station".

## SLICE2 <types + fixtures>

Files: src/lib/types.ts, src/lib/fixtures/sampleSave.ts.

- Type the save schema against `getSaveDataAsync` output shape (`:4520`) and restoreState consumption (`:4760+`).
- Fixtures mirror mockup data exactly: master "Stranger Things" (#172554 dot), Season 1 (4 videos: 2 done w/ opacity, S01E03 active w/ CC, S01E04), Season 2 (MADMAX.mkv, long-name mp4), durations, one annotation, progress 42% 12/28 9h24m.

## SLICE3 <stores>

Files: src/lib/stores/*.svelte.ts.

- groups: tree, collapsedGroups Set, selectedGroups, selectedIndices, lastSelectedIndex, shiftKeyPressed, videoDurations Map, groupIdCounter.
- player: currentGroup/currentVideo ids, playbackRate, autoplayEnabled, controls visibility timer state.
- settings: currentModel ('onnx-community/whisper-tiny.en' default), currentPrecision 'fp32', useGPU false, transcriber ref.
- save: currentSaveFileHandle, currentSaveFileName, hasUnsavedChanges.
- `VITE_USE_FIXTURES=true` hydrates groups/player/settings from fixtures; false = empty until services load.

## SLICE4 <header>

Files: src/lib/components/Header.svelte (+menus).

- Replica of mockup header: gear btn (opens SettingsModal), divider, play glyph + h1 order-right brand, Save split-button + dropdown (Load Save/Save As.../Close File), Add Videos split + dropdown (Select Files/Embed Link), Subtitles btn, folderStatus ellipsis, Autoplay toggle. CSS from `:48-195`.

## SLICE5 <playlist components>

Files: src/lib/components/playlist/*.

- ProgressBar card (Library Progress, %, watched count, remaining).
- GroupCard: header = caret span rotate-on-collapse, title, [ungroup icon if master] + stat-wrapper hover-swap (count/time) + [color dot LAST if master]; dblclick rename inline input; contextmenu hook; nested children indent 16px + 1px left border; NO master stripe (mockup rule).
- VideoRow: title + subtitle duration • green CC chip • blue Link chip; actions = SYNC hover-reveal + checkbox; completed → opacity .6 inline; missing → red tint + title attr; active/selected classes per legacy `:2560-2562`.
- Empty state when no groups.

## SLICE6 <player components>

Files: src/lib/components/player/*.

- Player: wrapper + fake-video gradient replaced by `<video>` (click=togglePlay) + hidden youtube div; controls auto-hide on mouse-idle in fullscreen (port `setupControls :3079` timers).
- ControlBar EXACT legacy markup (`:2943-2962`): progress bar full-width; space-between clusters — left prev/play(28px)/next + inline timeDisplay `m:ss / m:ss`; right CC(active when subs)/complete(green when done)/speed text/fullscreen. SVG paths verbatim from `:2951-2960`.
- VideoInfo: filename title + "Subtitle Loaded"/"No Subtitle" muted line + annotation textarea bound per-video.
- EmptyState: film icon + prompt text (two variants: initial vs closeSaveFile `:4637-4647`).

## SLICE7 <modals + overlays>

Files: src/lib/components/modals/*, ContextMenu.svelte, AiLoadingOverlay.svelte.

- SettingsModal = mockup v2 design EXACTLY (three sec-cards, sticky foot, precision dim toggle, storage meter static width 21% until real cache size wired, reference 2-col). Model grids driven by MODELS catalog port; distilled empty → dashed placeholder row.
- SyncModal: subtitle list + linkEditForm (title/url inputs) per `:1542-1572`.
- AddLinkModal, ColorPickerModal (5-col grid MASTER_COLORS), ConfirmModal (message/custom labels/type), PermissionDialog (list rows + Quick Grant pulse + Continue/Skip per `:1038-1298` CSS + `:4653+` flow).
- ContextMenu: dynamic items, danger variant.
- AiLoadingOverlay: spinner + status text + elapsed timer.

## SLICE8 <services db + fsAccess>

Files: src/lib/services/db.ts, fsAccess.ts.

- Port initDB/getDirectoryHandle/storeDirectoryHandle/getHandleFromDB/validateDirectoryHandle/promptDirectoryRepair near-verbatim, typed.
- fsAccess: selectVideoFolder (recursive scan video extensions), selectIndividualVideos, selectSubtitleFolder + pairing, batch permission flow state machine (pendingPermissionResolver pattern `:4653-4760`).

## SLICE9 <services savefile + subtitles>

Files: src/lib/services/savefile.ts, subtitles.ts.

- savefile: getSaveDataAsync/quickSave/saveAs/loadSaveFile/closeSaveFile/markSaved/markUnsaved/restoreState — JSON byte-compat with legacy saves.
- subtitles: getSubtitle 3-tier match port (`:2607-2639`), srt→vtt comma-to-dot conversion (`:3042-3047`), formatTimestamp, saveSubtitleToGroup, removeSubtitle, sync modal helpers.

## SLICE10 <services ai + youtube>

Files: src/lib/services/ai.ts, youtube.ts.

- ai: getTranscriber dtype matrix (`:2402-2421`), resetTranscriber safeDispose, generateSubtitles chunking + convertToVTT, fetchYouTubeCaptions + XML→VTT, model-warning trigger, clearAICache filter.
- youtube: initYouTubeAPI, extractYoutubeId, player create/load, startYoutubeSync/stopYoutubeSync interval, caption fetch reuse.

## SLICE11 <wiring + interactions>

Files: stores ↔ services glue inside components/stores; src/lib/hooks if needed.

- Replace fixture hydration with live service calls behind env flag.
- Hotkeys module: global keydown map (Space/F/arrows/Shift+G/Shift+Click), hold-mouse 2x on video wrapper.
- Drag & drop: PORT legacy engine (draggable attrs + dragover zones + insert-after logic) into Svelte events; svelte-dnd-action only if parity fails — decision logged here.
- Wire: autoplay queue (onended → mark complete → playNext), unsaved-changes dirty flag to Save button highlight, folderStatus text, annotation autosave, error handling path `:3058-3064`.

## SLICE12 <tauri config + cleanup>

Files: src-tauri/tauri.conf.json, package.json, deletions.

- conf: productName MediaStation, identifier com.mediastation.app, 1280×720 (+min 940×560), icons from public/icons, CSP allowlist: `cdn.jsdelivr.net fonts.googleapis.com fonts.gstatic.com huggingface.co youtube.com googlevideo.com img.youtube.com` + self. Reserve `additionalBrowserArguments` (windows) for WebGPU/dual-GPU nudges — add ONLY if VERIFY 6/7 fail.
- Delete NW.js layer (list under ARCH). Remove `main`/`window`/`chromium-args`/`build`/`postinstall` from package.json.
- Keep legacy `VideoStationVisualizer2.html` until VERIFY passes, then delete.

## CROSS-REF

- FS Access pickers may misbehave on non-https origin → SLICE12 conf origin is `http://tauri.localhost` (Chromium secure-context exempt) → verify VERIFY 1; contingency: @tauri-apps/plugin-dialog shim in SLICE8 (NOT planned unless broken).
- Handle permissions revoked after restart → SLICE8 batch flow + VERIFY 8; worst case WebView2 PermissionRequested auto-grant via Rust (out of scope unless needed).
- H.264/AAC previously solved by ffmpeg.dll hack → gone in SLICE12 → VERIFY 2 proves dead.
- Dual-GPU laptops route WebGPU to iGPU → SLICE12 arg reserve → VERIFY 6.
- Drag-drop regression risk (rewritten in Svelte) → SLICE11 → VERIFY 9-10.
- Save compat risk → SLICE9 → VERIFY 5 loads a pre-migration `media_station_save.json`.
- CDN outage breaks first AI run/fonts → accepted by user decision; pinned versions only.

## ALREADY CHECKED

- Zero `nw.*`/Node API usage in legacy HTML — do NOT re-audit.
- Legacy CSS values copied into mockup verified against `:12-1298` — do NOT re-diff.
- credits.html/temp_annotation_func.js DO NOT exist (stale build.mjs whitelist) — do NOT recreate.
- MODELS.distilled is empty — do NOT invent entries.

## N/A

- Auto-updater, multi-window, tray, macOS/Linux targets — out of scope this pass.
- Vendoring transformers/fonts — rejected by user; do NOT revisit.

## ASSET CHECK

- Icons: mediastation_icon.ico/png exist at root → move to public/icons + src-tauri icon config. Resolve: yes both present.
- No new remotes beyond existing CDNs (see PRESERVED). CSP list is complete set.
- svelte-dnd-action = OPTIONAL new dep, only on SLICE11 fallback branch.

## VERIFY (numbered; test the risk)

1. Add Videos → folder picker → recursive import matches legacy scan counts; individual files; Embed Link adds link item.
2. Play `H.264+AAC .mp4`: video AND audio (codec-hack removal proof). Also .mkv VP9 and a Code-4 unsupported file → error title path.
3. Subtitles: folder pair auto-match (prefix/suffix cases from `getSubtitle` tiers), SYNC modal manual assign, CC toggle, track renders.
4. AI: CPU transcription on tiny.en; enable GPU → fp32/fp16/q4/hybrid switch mid-session without leak (resetTranscriber); Clear Cache wipes only transformers/onnx caches.
5. Save round-trip: quickSave overwrite, Save As new path, Load pre-migration legacy JSON byte-format, Close File clears, dirty indicator toggles on every mutation type.
6. Restart app → handles restore from IndexedDB → batch permission dialog grants each → playback resumes. GPU toggle persists; navigator.gpu adapter = discrete GPU on hybrid laptop (check via adapter info log).
7. YouTube link item: embed plays, custom controls drive it, duration tracked into stats, captions fetch path.
8. Revoke folder (rename dir) → missing-file red state + alert path → repair prompt recovers.
9. Drag video across groups (insert-before/after both sides), reorder within group, drag group into master, ungroup master, move up/down ctx menu, Sort A→Z on 20+ items.
10. Multi-select Shift+Click videos + groups → batch delete videos/subtitles/groups confirm flow.
11. Empty cases: fresh install empty state; empty group render; group with all completed; library progress hides at 0 videos.
12. `npm run tauri build`: NSIS installer ≤15MB, portable exe launches on clean machine w/o dev deps; icons correct.
13. Full hotkey pass incl. hold-mouse 2x during playback + F fullscreen controls-hide cursor.

## LOG ENTRIES

### 2026-08-20 — Full port completed (NW.js → Tauri v2 + Svelte 5 + TS)

- Scaffold: package.json, vite.config.ts, svelte.config.js, tsconfig.json, index.html (fonts + transformers inline module kept verbatim), src-tauri/ (Cargo.toml, tauri.conf.json, capabilities, icons).
- src/lib/: types.ts, constants.ts (MASTER_COLORS/MODELS/PRECISIONS/SPEEDS), utils.ts, dnd.ts, hotkeys.ts, contextMenus.ts.
- src/lib/stores/: groups, player, settings, save, ui (Svelte 5 runes classes).
- src/lib/services/: db, fsAccess, savefile, subtitles, ai, youtube. No feature omissions vs legacy.
- src/lib/components/: Header, playlist/(Playlist, ProgressBar, GroupCard recursive, VideoRow), player/(Player, VideoInfo), modals/(SettingsModal v2 per ui-mockup, SyncModal, AddLinkModal, ColorPickerModal, ConfirmModal), PermissionDialog, ContextMenu, AiLoadingOverlay.
- src/lib/fixtures/sampleSave.ts (VITE_USE_FIXTURES=true hydrates mockup data).
- npm run check: 0 errors. npm run build: OK.
- Rust 1.98 MSVC + VS2019 BuildTools used. `npm run tauri build` OK.
- OUTPUT: src-tauri/target/release/bundle/nsis/MediaStation_1.1.0_x64-setup.exe (1.3 MB installer). Portable raw exe: src-tauri/target/release/mediastation.exe. Installer smoke-tested (launches, stays alive).
- Cleanup done: deleted build.mjs, setup-dev-ffmpeg.mjs, lib/, build/, cache/, MediaStation_V1.1.zip. Kept for reference: VideoStationVisualizer2.html, ui-mockup.html, media_station_save.json, root icons.
- DEV: `npm run tauri dev`. PROD BUILD: `npm run tauri build` (requires ~/.cargo/bin on PATH).

- S1 config+shell … S12 cleanup: append one-liner per slice completion here (for future LOGS.md split).
