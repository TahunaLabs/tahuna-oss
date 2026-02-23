<script lang="ts">
  export let className = '';
</script>

<div class={`flex flex-col space-y-1.5 p-6 ${className}`} {...$$restProps}>
  <slot />
</div>
