<script lang="ts">
  import { playerState as p } from '../../stores/player.svelte';
  import { groupsState } from '../../stores/groups.svelte';

  let annotationValue = $state('');
  let lastKey = '';

  $effect(() => {
    const key = `${p.currentGroup}-${p.currentVideo}-${p.loadSerial}-${p.annotation}`;
    if (key !== lastKey) {
      lastKey = key;
      annotationValue = p.annotation;
    }
  });

  function onAnnotationInput(value: string) {
    annotationValue = value;
    if (p.currentGroup !== null && p.currentVideo !== null) {
      groupsState.updateAnnotation(p.currentGroup, p.currentVideo, value);
    }
  }
</script>

<div class="video-info">
  <div class="video-title">{p.errorTitle ?? p.title}</div>
  <div class="sub-status">{p.subtitleStatus === 'loaded' ? 'Subtitle Loaded' : 'No Subtitle'}</div>
  <textarea class="video-annotation" placeholder="Add notes for this video..."
    value={annotationValue}
    oninput={(e) => onAnnotationInput((e.target as HTMLTextAreaElement).value)}></textarea>
</div>
