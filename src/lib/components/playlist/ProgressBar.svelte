<script lang="ts">
  import { groupsState } from '../../stores/groups.svelte';

  const g = groupsState;
</script>

{#if g.libraryStats().totalVideos > 0}
  {@const stats = g.libraryStats()}
  {@const pct = Math.round((stats.completedVideos / stats.totalVideos) * 100)}
  {@const remainingSecs = stats.totalDuration - stats.completedDuration}
  {@const hrs = Math.floor(remainingSecs / 3600)}
  {@const mins = Math.floor((remainingSecs % 3600) / 60)}
  {@const timeString = hrs > 0 ? `${hrs}h ${mins}m remaining` : `${mins}m remaining`}
  <div class="total-progress">
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
      <span>Library Progress</span>
      <span style="font-weight:600;color:var(--primary);">{pct}%</span>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:{pct}%"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:6px;">
      <span>{stats.completedVideos} / {stats.totalVideos} watched</span>
      <span>{remainingSecs > 0 ? timeString : 'Complete'}</span>
    </div>
  </div>
{/if}
