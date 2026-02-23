<script lang="ts">
  export let className = '';
</script>

<th class={`h-10 px-2 text-left align-middle font-medium text-muted-foreground ${className}`} {...$$restProps}>
  <slot />
</th>
