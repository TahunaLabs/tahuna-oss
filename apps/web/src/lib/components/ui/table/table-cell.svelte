<script lang="ts">
  export let className = '';
</script>

<td class={`p-2 align-middle ${className}`} {...$$restProps}>
  <slot />
</td>
