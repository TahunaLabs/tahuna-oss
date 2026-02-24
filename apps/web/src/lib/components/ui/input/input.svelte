<script lang="ts">
  export let className = "";
  export let value: string | number = "";

  const base =
    "flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50";
</script>

<input class={`${base} ${className}`} bind:value {...$$restProps} />
