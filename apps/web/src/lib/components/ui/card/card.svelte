<script lang="ts">
  export let className = "";
</script>

<div
  class={`rounded-lg border border-border bg-card text-card-foreground ${className}`}
  {...$$restProps}
>
  <slot />
</div>
