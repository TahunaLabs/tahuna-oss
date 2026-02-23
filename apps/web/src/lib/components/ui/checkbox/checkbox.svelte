<script lang="ts">
  export let className = '';
  export let checked = false;
</script>

<input
  type="checkbox"
  class={`h-4 w-4 rounded border-input bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
  bind:checked
  {...$$restProps}
/>
