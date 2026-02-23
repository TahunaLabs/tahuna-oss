<script lang="ts">
  type AlertVariant = 'default' | 'destructive' | 'success';

  export let variant: AlertVariant = 'default';
  export let className = '';

  const base = 'relative w-full rounded-lg border p-4 text-sm';
  const variants: Record<AlertVariant, string> = {
    default: 'border-border bg-card text-card-foreground',
    destructive: 'border-destructive/60 bg-destructive/10 text-destructive',
    success: 'border-primary/50 bg-primary/10 text-primary'
  };
</script>

<div role="alert" class={`${base} ${variants[variant]} ${className}`} {...$$restProps}>
  <slot />
</div>
