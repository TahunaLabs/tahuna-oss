<script lang="ts">
  export let className = '';
</script>

<tbody class={`${className}`} {...$$restProps}>
  <slot />
</tbody>
