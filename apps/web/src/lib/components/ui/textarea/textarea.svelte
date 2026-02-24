<script lang="ts">
  export let className = "";
  export let value = "";

  const base =
    "flex min-h-[60px] w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50";
</script>

<textarea class={`${base} ${className}`} bind:value {...$$restProps}></textarea>
