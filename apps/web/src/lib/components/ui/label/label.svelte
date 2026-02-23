<script lang="ts">
  export let className = '';

  const base = 'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70';
</script>

<label class={`${base} ${className}`} {...$$restProps}>
  <slot />
</label>
