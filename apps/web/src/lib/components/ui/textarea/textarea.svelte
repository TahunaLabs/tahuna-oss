<script lang="ts">
  export let className = '';
  export let value = '';

  const base =
    'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
</script>

<textarea class={`${base} ${className}`} bind:value {...$$restProps} />
