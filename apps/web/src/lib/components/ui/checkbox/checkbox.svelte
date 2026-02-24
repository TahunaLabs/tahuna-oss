<script lang="ts">
  export let className = "";
  export let checked = false;
</script>

<input
  type="checkbox"
  class={`h-4 w-4 rounded-sm border border-input bg-background/50 text-primary shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
  bind:checked
  {...$$restProps}
/>
