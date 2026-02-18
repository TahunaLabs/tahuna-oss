import { Box, Scale, BookOpen, Cpu, Shield } from "lucide-react"

export function Layers() {
  const layers = [
    {
      icon: Box,
      title: "The Gym",
      subtitle: "Sandbox Environments",
      description: "Plug in your own scenarios or use ours — your agents practice in realistic sandboxes before they ever touch production.",
      features: [
        "Customer support simulators with multi-turn conversations and escalations.",
        "Enterprise software environments that mimic Jira, ServiceNow, CRMs, and dashboards.",
        "Industrial digital twins for supply chains, manufacturing, and high-stakes systems.",
      ],
      tagline: "Where your agents learn by doing.",
    },
    {
      icon: Scale,
      title: "The Judge",
      subtitle: "Rewards & Evaluation",
      description: "Define what 'good' looks like — then let the system score, rank, and compare.",
      features: [
        "Multi-metric scoring: quality, speed, cost, safety, and policy adherence.",
        "Reward design tools that turn your business goals into learnable signals.",
        "Leaderboards to compare agents, reward functions, and training strategies.",
      ],
      tagline: "Rewards are the new prompts.",
    },
    {
      icon: BookOpen,
      title: "The Curriculum",
      subtitle: "Tasks & Data",
      description: "Rich, structured experience for agents to learn from — no manual labeling required.",
      features: [
        "Pre-built workflow libraries: triage tickets, resolve incidents, orchestrate tools.",
        "Human-in-the-loop data: demonstrations, corrections, and preferences.",
        "Synthetic data generators that create diverse scenarios at scale.",
      ],
      tagline: "Millions of interactions, ready to go.",
    },
    {
      icon: Cpu,
      title: "The Runtime",
      subtitle: "One-Click Training",
      description: "Distributed RL training that just works — configure, launch, iterate.",
      features: [
        "Distributed rollouts, replay buffers, and policy updates out of the box.",
        "RL, imitation learning, offline RL, and RLHF/RLAIF — all supported.",
        "Experiment tracking, hyperparameter sweeps, and reproducible runs.",
      ],
      tagline: "You define the goal. The runtime handles the rest.",
    },
    {
      icon: Shield,
      title: "The Bridge",
      subtitle: "Deploy & Monitor",
      description: "Ship trained agents safely — shadow deployments, canary rollouts, one-click rollbacks.",
      features: [
        "Serve agents into your products, tools, and internal workflows.",
        "Shadow deployments and canary rollouts before going live.",
        "Monitoring for drift, regressions, and safety violations.",
      ],
      tagline: "From training to production, safely.",
    },
  ]

  return (
    <section id="layers" className="py-24 md:py-32 px-6 bg-background/50 backdrop-blur-sm">
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

              <ul className="space-y-2 mb-4 relative z-10">
                {layer.features.map((feature, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-foreground mt-1.5">•</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <p className="text-sm font-medium italic relative z-10">{layer.tagline}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
