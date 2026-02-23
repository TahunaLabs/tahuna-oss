<script lang="ts">
  export let className = '';
</script>

<div class={`relative w-full overflow-auto ${className}`} {...$$restProps}>
  <table class="w-full caption-bottom text-sm">
    <slot />
  </table>
</div>
