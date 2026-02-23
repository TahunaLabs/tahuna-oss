<script lang="ts">
  import { ArrowRight, BookOpen, Box, Check, CheckCircle2, Copy, Cpu, Menu, Scale, Shield, X } from 'lucide-svelte';

  export let data: { isAuthenticated?: boolean };

  let mobileMenuOpen = false;
  let copiedCommand = false;
  let activeTab: 'mac' | 'windows' = 'mac';

  let isSubmitting = false;
  let isSuccess = false;

  const commands = {
    mac: 'curl -fsSL https://Tahuna.dev/install | sh',
    windows: 'irm https://Tahuna.dev/install | iex'
  };

  const layers = [
    {
      icon: Box,
      title: 'The Gym',
      subtitle: 'Sandbox Environments',
      description:
        'Realistic sandboxes where your agents practice — customer support simulators, enterprise software environments, industrial digital twins. Plug in your own scenarios or use ours.',
      tagline: 'Where your agents learn by doing.'
    },
    {
      icon: Scale,
      title: 'The Judge',
      subtitle: 'Rewards & Evaluation',
      description:
        "Define what 'good' looks like with multi-metric scoring, reward design tools, and leaderboards. Turn your business goals into learnable signals.",
      tagline: 'Rewards are the new prompts.'
    },
    {
      icon: BookOpen,
      title: 'The Curriculum',
      subtitle: 'Tasks & Data',
      description:
        'Pre-built workflow libraries, human-in-the-loop demonstrations, and synthetic data generators. Rich, structured experience for agents to learn from — no manual labeling required.',
      tagline: 'Millions of interactions, ready to go.'
    },
    {
      icon: Cpu,
      title: 'The Runtime',
      subtitle: 'One-Click Training',
      description:
        'Distributed RL training that just works. Rollouts, replay buffers, policy updates, experiment tracking, and hyperparameter sweeps — all out of the box.',
      tagline: 'You define the goal. The runtime handles the rest.'
    },
    {
      icon: Shield,
      title: 'The Bridge',
      subtitle: 'Deploy & Monitor',
      description:
        'Ship trained agents into your products with shadow deployments, canary rollouts, drift monitoring, and one-click rollbacks.',
      tagline: 'From training to production, safely.'
    }
  ];

  async function handleCopy() {
    await navigator.clipboard.writeText(commands[activeTab]);
    copiedCommand = true;
    setTimeout(() => {
      copiedCommand = false;
    }, 2000);
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    isSubmitting = true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    isSubmitting = false;
    isSuccess = true;
  }
</script>

<svelte:head>
  <title>Tahuna | The RL Training Substrate</title>
  <meta
    name="description"
    content="The RL training substrate. Where AI agents practice, adapt, and improve through experience — no research lab required."
  />
</svelte:head>

<div class="min-h-screen landing-page-bg">
  <header class="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
    <nav class="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
      <a href="/" class="text-2xl font-serif font-semibold tracking-tight text-foreground">Tahuna</a>

      <div class="hidden md:flex items-center gap-8">
        <a href="/#manifesto" class="text-sm text-muted-foreground hover:text-foreground transition-colors">Manifesto</a>
        <a href="/#layers" class="text-sm text-muted-foreground hover:text-foreground transition-colors">The Stack</a>
        {#if data?.isAuthenticated}
          <a href="/dashboard" class="text-sm text-muted-foreground hover:text-foreground transition-colors">Dashboard</a>
        {/if}
        <a
          href="/auth"
          class="text-sm font-medium text-foreground border border-foreground/30 rounded-full px-5 py-2 hover:bg-foreground/5 transition-colors"
        >
          Get started
        </a>
      </div>

      <button class="md:hidden p-2 text-foreground" on:click={() => (mobileMenuOpen = !mobileMenuOpen)} aria-label="Toggle menu">
        {#if mobileMenuOpen}<X class="h-5 w-5" />{:else}<Menu class="h-5 w-5" />{/if}
      </button>
    </nav>

    {#if mobileMenuOpen}
      <div class="md:hidden border-t border-border bg-background px-6 py-4 space-y-4">
        <a href="/#manifesto" class="block text-sm text-muted-foreground hover:text-foreground" on:click={() => (mobileMenuOpen = false)}>Manifesto</a>
        <a href="/#layers" class="block text-sm text-muted-foreground hover:text-foreground" on:click={() => (mobileMenuOpen = false)}>The Stack</a>
        {#if data?.isAuthenticated}
          <a href="/dashboard" class="block text-sm text-muted-foreground hover:text-foreground" on:click={() => (mobileMenuOpen = false)}>Dashboard</a>
        {/if}
        <a
          href="/auth"
          class="block text-sm font-medium text-foreground border border-foreground/30 rounded-full px-5 py-2 text-center hover:bg-foreground/5 transition-colors"
          on:click={() => (mobileMenuOpen = false)}
        >
          Get started
        </a>
      </div>
    {/if}
  </header>

  <main>
    <section class="relative py-20 md:py-32 px-6 overflow-hidden">
      <div class="absolute top-8 right-8 text-primary text-5xl font-serif select-none hidden lg:block" aria-hidden="true">*</div>

      <div class="mx-auto max-w-7xl">
        <div class="max-w-4xl">
          <h1 class="font-serif text-5xl md:text-7xl lg:text-[5.5rem] leading-[0.95] tracking-tight mb-10 text-foreground">
            <span class="italic">Engineered</span><br />
            <span>For The Frontier</span>
          </h1>

          <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-10">
            <div class="max-w-md">
              <p class="text-lg md:text-xl text-foreground/80 leading-relaxed mb-3">
                Tahuna is the frontier training substrate that lets you wield the full power of leading models.
              </p>
              <p class="text-base text-muted-foreground">Pay as you go, with no markup for individuals.</p>
            </div>

            <a
              href="#waitlist"
              class="inline-flex items-center gap-2 text-base font-medium text-foreground border border-foreground/30 rounded-full px-8 py-3.5 hover:bg-foreground/5 transition-colors self-start"
            >
              Get in Touch
              <ArrowRight class="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>

    <section class="py-20 md:py-28 px-6 border-t border-border">
      <div class="mx-auto max-w-7xl">
        <div class="flex flex-col lg:flex-row gap-12 lg:gap-20">
          <div class="lg:w-1/3 shrink-0">
            <div class="flex items-center gap-2 mb-4">
              <span class="text-xs font-mono uppercase tracking-widest text-foreground bg-secondary px-2 py-1">Install</span>
              <span class="text-xs font-mono uppercase tracking-widest text-muted-foreground">Tahuna</span>
            </div>
            <h2 class="text-3xl md:text-4xl font-serif tracking-tight text-foreground">Available in the terminal</h2>
          </div>

          <div class="lg:w-2/3">
            <div class="bg-card border border-border rounded-lg overflow-hidden mb-8">
              <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
                <div class="flex gap-1.5">
                  <div class="w-3 h-3 rounded-full bg-muted-foreground/30"></div>
                  <div class="w-3 h-3 rounded-full bg-muted-foreground/30"></div>
                  <div class="w-3 h-3 rounded-full bg-muted-foreground/30"></div>
                </div>
                <span class="text-xs font-mono text-muted-foreground ml-2">Tahuna</span>
              </div>

              <div class="p-5 font-mono text-sm space-y-3 min-h-[280px]">
                <div class="flex items-start gap-2">
                  <span class="text-primary shrink-0">&gt;</span>
                  <span class="text-foreground/80">Tahuna train</span>
                  <span class="text-muted-foreground">--config reward-shaping.yaml</span>
                </div>
                <p class="text-muted-foreground pl-5 text-xs leading-relaxed">Setting up post-training pipeline for agentic reasoner...</p>
                <div class="space-y-1.5 pl-5">
                  <div class="flex items-center gap-2 text-xs"><span class="text-green-400">✓</span><span class="text-muted-foreground">Loading base model</span><span class="text-primary/70">MiniMax-M2.5</span></div>
                  <div class="flex items-center gap-2 text-xs"><span class="text-green-400">✓</span><span class="text-muted-foreground">Initializing reward signals</span><span class="text-primary/70">quality, safety, cost</span></div>
                  <div class="flex items-center gap-2 text-xs"><span class="text-green-400">✓</span><span class="text-muted-foreground">Spinning up sandbox environment</span><span class="text-primary/70">customer-support-sim</span></div>
                </div>
                <p class="text-muted-foreground pl-5 text-xs leading-relaxed">Running RL training loop — episode 1/500</p>
                <div class="space-y-1.5 pl-5">
                  <div class="flex items-center gap-2 text-xs"><span class="text-green-400">&gt;</span><span class="text-muted-foreground">Reward</span><span class="text-primary/60">+0.82</span><span class="text-muted-foreground">| Steps</span><span class="text-primary/60">14</span><span class="text-muted-foreground">| Policy loss</span><span class="text-primary/60">0.031</span></div>
                  <div class="flex items-center gap-2 text-xs"><span class="text-green-400">&gt;</span><span class="text-muted-foreground">Eval pass rate</span><span class="text-primary/60">73.2%</span><span class="text-muted-foreground">→</span><span class="text-green-400">89.1%</span><span class="text-muted-foreground">(+15.9%)</span></div>
                </div>

                <div class="flex items-center justify-between pt-4 border-t border-border mt-4">
                  <div class="bg-muted px-3 py-1 rounded text-xs text-muted-foreground">training</div>
                  <div class="flex items-center gap-4 text-xs text-muted-foreground"><span>episode 1/500</span><span>ETA 2h 14m</span></div>
                </div>
              </div>
            </div>

            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <span class="text-xs font-mono uppercase tracking-widest text-muted-foreground">Install</span>
              <div class="flex items-center gap-1 bg-card border border-border rounded-full overflow-hidden">
                <button
                  on:click={() => (activeTab = 'mac')}
                  class={`text-xs font-mono px-4 py-2 transition-colors ${activeTab === 'mac' ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Mac/Linux
                </button>
                <button
                  on:click={() => (activeTab = 'windows')}
                  class={`text-xs font-mono px-4 py-2 transition-colors ${activeTab === 'windows' ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Windows
                </button>
              </div>
              <div class="flex items-center gap-2 bg-card border border-border rounded-full px-5 py-2.5 flex-1 min-w-0">
                <code class="text-sm font-mono text-foreground/80 truncate">{commands[activeTab]}</code>
                <button on:click={handleCopy} class="text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-auto" aria-label="Copy command">
                  {#if copiedCommand}<Check class="h-4 w-4 text-green-400" />{:else}<Copy class="h-4 w-4" />{/if}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="manifesto" class="py-24 md:py-32 px-6 bg-background/30 backdrop-blur-sm">
      <div class="mx-auto max-w-4xl">
        <h2 class="text-4xl md:text-5xl lg:text-6xl font-serif italic tracking-tight mb-12 text-foreground">Vibe Research.</h2>

        <div class="space-y-6 text-lg text-muted-foreground leading-relaxed max-w-3xl">
          <p>You can't prompt your way into high-quality agentic behavior. And you can't brute-force it with scale alone. The last decade was defined by throwing larger volumes of compute at larger monolithic systems — but intelligence shouldn't be frozen in training data or updated in slow, expensive cycles.</p>
          <p>We're betting against brute-force scaling. Where others chase size, we're building adaptability-first systems — efficient AI that continually learns.</p>
          <p>Post-training the mechanism that makes this possible. It takes something that works "okay" in simple settings and makes it robust enough to handle long-horizon, multi-step tasks reliably. This is exactly how the frontier labs are building their next generation of models — and the results speak for themselves.</p>
          <p class="text-foreground font-medium">Tahuna brings this capability to everyone. Train, evaluate, and iterate on agentic reasoners — with clean reward signals, rigorous evaluation, and continuous improvement loops — without needing a research lab to do it.</p>
          <p>The recipe is becoming clear: RL, evaluators, synthetic data, and iterative refinement. We're making it accessible, fun, and scalable.</p>
        </div>

        <div class="mt-16 pt-8 border-t border-border">
          <p class="text-lg italic text-muted-foreground leading-relaxed">Two Senior ML Engineers. One mission: make the frontier accessible.</p>
        </div>
      </div>
    </section>

    <section id="layers" class="py-24 md:py-32 px-6 bg-background/15 backdrop-blur-sm">
      <div class="mx-auto max-w-4xl">
        <h2 class="text-3xl md:text-4xl font-medium tracking-tight mb-4">The Stack</h2>
        <p class="text-lg text-muted-foreground leading-relaxed mb-16 max-w-3xl">Everything you need to go from idea to specific intelligence — no PhD required.</p>

        <div class="space-y-8">
          {#each layers as layer, index}
            <div class="relative rounded-lg p-8 border border-border overflow-hidden">
              <div class="absolute inset-0 bg-background/50 backdrop-blur-sm -z-10"></div>
              <div class="flex items-start gap-4 mb-4 relative z-10">
                <div class="p-2 bg-secondary rounded-md"><svelte:component this={layer.icon} class="h-5 w-5" /></div>
                <div>
                  <p class="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Layer {index + 1}</p>
                  <h3 class="text-xl font-medium">{layer.title}: <span class="text-muted-foreground font-normal">{layer.subtitle}</span></h3>
                </div>
              </div>
              <p class="text-muted-foreground mb-4 relative z-10">{layer.description}</p>
              <p class="text-sm font-medium italic relative z-10">{layer.tagline}</p>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <section id="waitlist" class="py-24 md:py-32 px-6 bg-background/10 backdrop-blur-sm">
      <div class="mx-auto max-w-xl">
        <h2 class="text-3xl md:text-4xl font-medium tracking-tight mb-4 text-center">Get in Touch</h2>
        <p class="text-muted-foreground text-center mb-10 leading-relaxed">We are a service for fine-tuning agents. We work with AI labs, infra teams, and ambitious startups to build specific, high-performance agentic workflows.</p>

        <div class="bg-background rounded-xl p-6 sm:p-8 border border-border">
          {#if isSuccess}
            <div class="text-center py-8">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-6"><CheckCircle2 class="h-8 w-8 text-foreground" /></div>
              <h3 class="text-2xl font-medium mb-4">You're in.</h3>
              <p class="text-muted-foreground leading-relaxed max-w-md mx-auto mb-4">Thanks for joining the Tahuna waitlist. As we open up early access, we'll prioritize people with concrete agent use-cases and share behind-the-scenes updates on the platform, the environments we're launching first, and opportunities to help shape The Layers.</p>
              <p class="text-sm text-muted-foreground italic">In the meantime, keep an eye on your inbox—and start thinking about what you want your agents to actually learn.</p>
            </div>
          {:else}
            <form on:submit={handleSubmit} class="space-y-5">
              <div class="grid sm:grid-cols-2 gap-5">
                <div class="space-y-2"><label for="email" class="text-sm font-medium">Work email</label><input id="email" type="email" placeholder="you@company.com" required class="w-full bg-background border border-border rounded-md px-3 py-2" /></div>
                <div class="space-y-2"><label for="name" class="text-sm font-medium">Name</label><input id="name" type="text" placeholder="Ada Lovelace" required class="w-full bg-background border border-border rounded-md px-3 py-2" /></div>
              </div>
              <div class="grid sm:grid-cols-2 gap-5">
                <div class="space-y-2"><label for="organization" class="text-sm font-medium">Organization</label><input id="organization" type="text" placeholder="Company, lab, or project name" class="w-full bg-background border border-border rounded-md px-3 py-2" /></div>
                <div class="space-y-2"><label for="role" class="text-sm font-medium">Role</label><input id="role" type="text" placeholder="e.g. ML engineer, founder, head of ops" class="w-full bg-background border border-border rounded-md px-3 py-2" /></div>
              </div>
              <div class="space-y-2">
                <label for="usecase" class="text-sm font-medium">What do you want to teach your agents to do?</label>
                <textarea id="usecase" placeholder="Tell us about the workflows, tools, or domains where you want agents to learn and improve over time." rows="4" class="w-full bg-background border border-border rounded-md px-3 py-2 resize-none"></textarea>
              </div>
              <label for="updates" class="flex items-start gap-3 cursor-pointer">
                <input id="updates" type="checkbox" class="mt-0.5" />
                <span class="text-sm text-muted-foreground font-normal">I'd like early access and occasional product updates from Tahuna.</span>
              </label>
              <button type="submit" class="w-full rounded-full px-4 py-2.5 bg-primary text-primary-foreground" disabled={isSubmitting}>{isSubmitting ? 'Submitting…' : 'Get in Touch'}</button>
            </form>
          {/if}
        </div>
      </div>
    </section>
  </main>

  <footer class="py-12 px-6 border-t border-border">
    <div class="mx-auto max-w-7xl">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div class="flex items-center gap-6">
          <a href="/" class="text-2xl font-serif font-semibold tracking-tight text-foreground">Tahuna</a>
          <div class="flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-green-400"></div><span class="text-xs text-muted-foreground">All Systems Operational</span></div>
        </div>
        <div class="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="/docs" class="hover:text-foreground transition-colors">Documentation</a>
          <a href="https://x.com" class="hover:text-foreground transition-colors">X @Tahuna</a>
          <a href="/terms" class="hover:text-foreground transition-colors">Terms</a>
        </div>
      </div>
    </div>
  </footer>
</div>
