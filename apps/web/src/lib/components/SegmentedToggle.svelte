<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value = '';
  export let options: Array<{ value: string; label: string }> = [];
  export let className = '';

  const dispatch = createEventDispatcher<{ change: string }>();

  function select(next: string) {
    value = next;
    dispatch('change', next);
  }
</script>

<div class={`flex items-center gap-1 bg-card border border-border rounded-full overflow-hidden ${className}`}>
  {#each options as option}
    <button
      type="button"
      on:click={() => select(option.value)}
      class={`text-xs font-mono px-4 py-2 transition-colors ${value === option.value ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {option.label}
    </button>
  {/each}
</div>
