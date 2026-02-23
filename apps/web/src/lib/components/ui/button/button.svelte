<script lang="ts">
  type ButtonVariant = 'default' | 'outline' | 'secondary' | 'destructive' | 'ghost';
  type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

  export let variant: ButtonVariant = 'default';
  export let size: ButtonSize = 'default';
  export let className = '';

  const base =
    'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';

  const variants: Record<ButtonVariant, string> = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    ghost: 'hover:bg-accent hover:text-accent-foreground'
  };

  const sizes: Record<ButtonSize, string> = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 rounded-md px-3',
    lg: 'h-11 rounded-md px-8',
    icon: 'h-10 w-10'
  };
</script>

<button class={`${base} ${variants[variant]} ${sizes[size]} ${className}`} on:click {...$$restProps}>
  <slot />
</button>
