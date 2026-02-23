<script lang="ts">
  export let className = '';
</script>

<p class={`text-sm text-muted-foreground ${className}`} {...$$restProps}>
  <slot />
</p>
