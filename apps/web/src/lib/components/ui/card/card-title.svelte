<script lang="ts">
  export let className = '';
</script>

<h3 class={`font-semibold leading-none tracking-tight ${className}`} {...$$restProps}>
  <slot />
</h3>
