import { Box, Scale, BookOpen, Cpu, Shield } from "lucide-react"

export function Layers() {
  const layers = [
    {
      icon: Box,
      title: "The Gym",
      subtitle: "Sandbox Environments",
      description:
        "Realistic sandboxes where your agents practice — customer support simulators, enterprise software environments, industrial digital twins. Plug in your own scenarios or use ours.",
      tagline: "Where your agents learn by doing.",
    },
    {
      icon: Scale,
      title: "The Judge",
      subtitle: "Rewards & Evaluation",
      description:
        "Define what 'good' looks like with multi-metric scoring, reward design tools, and leaderboards. Turn your business goals into learnable signals.",
      tagline: "Rewards are the new prompts.",
    },
    {
      icon: BookOpen,
      title: "The Curriculum",
      subtitle: "Tasks & Data",
      description:
        "Pre-built workflow libraries, human-in-the-loop demonstrations, and synthetic data generators. Rich, structured experience for agents to learn from — no manual labeling required.",
      tagline: "Millions of interactions, ready to go.",
    },
    {
      icon: Cpu,
      title: "The Runtime",
      subtitle: "One-Click Training",
      description:
        "Distributed RL training that just works. Rollouts, replay buffers, policy updates, experiment tracking, and hyperparameter sweeps — all out of the box.",
      tagline: "You define the goal. The runtime handles the rest.",
    },
    {
      icon: Shield,
      title: "The Bridge",
      subtitle: "Deploy & Monitor",
      description:
        "Ship trained agents into your products with shadow deployments, canary rollouts, drift monitoring, and one-click rollbacks.",
      tagline: "From training to production, safely.",
    },
  ]

  return (
    <section id="layers" className="py-24 md:py-32 px-6 bg-background/15 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-4">The Stack</h2>

        <p className="text-lg text-muted-foreground leading-relaxed mb-16 max-w-3xl">
          Everything you need to go from idea to specific intelligence — no PhD required.
        </p>

        <div className="space-y-8">
          {layers.map((layer, index) => (
            <div key={layer.title} className="relative rounded-lg p-8 border border-border overflow-hidden">
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm -z-10" />
              <div className="flex items-start gap-4 mb-4 relative z-10">
                <div className="p-2 bg-secondary rounded-md">
                  <layer.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    Layer {index + 1}
                  </p>
                  <h3 className="text-xl font-medium">
                    {layer.title}: <span className="text-muted-foreground font-normal">{layer.subtitle}</span>
                  </h3>
                </div>
              </div>

              <p className="text-muted-foreground mb-4 relative z-10">{layer.description}</p>

              <p className="text-sm font-medium italic relative z-10">{layer.tagline}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
