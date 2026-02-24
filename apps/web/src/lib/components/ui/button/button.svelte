<script lang="ts">
  type ButtonVariant =
    | "default"
    | "outline"
    | "secondary"
    | "destructive"
    | "ghost";
  type ButtonSize = "default" | "sm" | "lg" | "icon";

  export let variant: ButtonVariant = "default";
  export let size: ButtonSize = "default";
  export let className = "";

  const base =
    "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

  const variants: Record<ButtonVariant, string> = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
    outline:
      "border border-input bg-background/50 hover:bg-accent hover:text-accent-foreground shadow-sm",
    secondary:
      "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm",
    destructive:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
    ghost: "hover:bg-accent hover:text-accent-foreground",
  };

  const sizes: Record<ButtonSize, string> = {
    default: "h-9 px-4 py-2",
    sm: "h-8 px-3 text-xs",
    lg: "h-10 px-8",
    icon: "h-9 w-9",
  };
</script>

<button
  class={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
  on:click
  {...$$restProps}
>
  <slot />
</button>
