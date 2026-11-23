<script lang="ts">
  import { groupsState } from '../../stores/groups.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import GroupCard from './GroupCard.svelte';

  const g = groupsState;
</script>

<div class="playlist">
  <div class="playlist-content">
    <ProgressBar />
    {#each g.rootGroups() as group (group.id)}
      <GroupCard {group} />
    {/each}
  </div>
</div>
