<script lang="ts">
  import { Card, CardContent } from '$lib/components/ui/card';

  export let eyebrow: string;
  export let title: string;
  export let subtitle: string;
</script>

<div class="min-h-screen flex flex-col">
  <header class="border-b border-border bg-background/90 backdrop-blur-md">
    <div class="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
      <a href="/" class="text-2xl font-serif font-semibold tracking-tight text-foreground">Tahuna</a>
      <div class="flex items-center gap-6 text-sm">
        <a href="/auth" class="text-muted-foreground hover:text-foreground transition-colors">Sign In</a>
        <a href="/api-key" class="text-foreground border border-foreground/30 rounded-full px-4 py-1.5 hover:bg-foreground/5 transition-colors">API Key</a>
      </div>
    </div>
  </header>

  <main class="flex-1 px-6 py-16 md:py-24">
    <div class="mx-auto max-w-3xl">
      <p class="text-xs tracking-[0.22em] uppercase text-primary mb-4">{eyebrow}</p>
      <h1 class="font-serif text-4xl md:text-6xl tracking-tight leading-[0.95] text-foreground mb-6">{title}</h1>
      <p class="text-lg text-foreground/80 max-w-2xl">{subtitle}</p>

      <Card className="mt-10 bg-card/80 backdrop-blur-sm">
        <CardContent className="p-6 md:p-8">
          <slot />
        </CardContent>
      </Card>
    </div>
  </main>
</div>
