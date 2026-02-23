<script lang="ts">
  export let className = '';
</script>

<tr class={`border-b border-border/40 transition-colors ${className}`} {...$$restProps}>
  <slot />
</tr>
