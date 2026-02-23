<script lang="ts">
  export let className = '';
</script>

<div class={`p-6 pt-0 ${className}`} {...$$restProps}>
  <slot />
</div>
