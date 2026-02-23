<script lang="ts">
  export let title = 'Tahuna';
  export let className = '';
  export let contentClassName = '';
</script>

<div class={`bg-card border border-border rounded-lg overflow-hidden ${className}`}>
  <div class="flex items-center gap-2 border-b border-border px-4 py-3">
    <div class="flex gap-1.5">
      <div class="h-3 w-3 rounded-full bg-muted-foreground/30"></div>
      <div class="h-3 w-3 rounded-full bg-muted-foreground/30"></div>
      <div class="h-3 w-3 rounded-full bg-muted-foreground/30"></div>
    </div>
    <span class="ml-2 font-mono text-xs text-muted-foreground">{title}</span>
  </div>
  <div class={`p-5 ${contentClassName}`}>
    <slot />
  </div>
</div>
