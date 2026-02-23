<script lang="ts">
  type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

  export let variant: BadgeVariant = 'default';
  export let className = '';

  const base =
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';
  const variants: Record<BadgeVariant, string> = {
    default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
    secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'border-border text-foreground',
    destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80'
  };
</script>

<span class={`${base} ${variants[variant]} ${className}`} {...$$restProps}>
  <slot />
</span>
