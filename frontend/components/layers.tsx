import { Box, Scale, BookOpen, Cpu, Shield } from "lucide-react"

export function Layers() {
  const layers = [
    {
      icon: Box,
      title: "The Gym",
      subtitle: "Simulated Work Environments",
      description: "Digital sandboxes where agents actually practice.",
      features: [
        "Customer Support Simulators for multi-turn conversations, escalations, and sentiment shifts.",
        "Enterprise Software Environments that mimic tools like Jira, ServiceNow, CRMs, and internal dashboards.",
        "Industrial Digital Twins for supply chains, manufacturing, energy, and other high-stakes systems.",
      ],
      tagline: "We build the environments where your agents practice.",
    },
    {
      icon: Scale,
      title: "The Judge",
      subtitle: "Evaluation & Reward Engine",
      description: "Autograders and reward functions that define what good looks like.",
      features: [
        "Multi-metric scoring (quality, speed, cost, safety, policy adherence).",
        "Reward design tools to encode your business goals as learnable signals.",
        "Benchmark suites and leaderboards to compare agents, reward functions, and training strategies.",
      ],
      tagline: "If prompts are how you talk to a model, rewards are how you teach it.",
    },
    {
      icon: BookOpen,
      title: "The Curriculum",
      subtitle: "Task Distributions & Interaction Traces",
      description: "Massive, structured experience for agents to learn from.",
      features: [
        "Libraries of common workflows: triage tickets, resolve incidents, update records, orchestrate tools.",
        "Human-in-the-loop data: demonstrations, corrections, and preferences.",
        "Synthetic data generators to create rich, diverse scenarios at scale.",
      ],
      tagline: "The goal: give agents the millions of interactions they need to learn robust behavior.",
    },
    {
      icon: Cpu,
      title: "The Runtime",
      subtitle: "Training & Orchestration",
      description: "The infrastructure that actually runs RL at scale.",
      features: [
        "Distributed rollouts, replay buffers, and policy updates.",
        "Support for RL, imitation learning, offline RL, and RLHF/RLAIF.",
        "Experiment tracking, hyperparameter sweeps, and reproducible training runs.",
      ],
      tagline: "You define the agents and environments. The runtime handles the rest.",
    },
    {
      icon: Shield,
      title: "The Bridge",
      subtitle: "Deployment, Monitoring & Safety",
      description: "Where trained policies meet the real world.",
      features: [
        "Serve agents into your products, tools, and internal workflows.",
        "Shadow deployments and canary rollouts before full production.",
        "Monitoring for drift, regressions, and safety violations, with one-click rollbacks.",
      ],
      tagline: "Agents don't just train somewhere else—they keep learning, safely, in your stack.",
    },
  ]

  return (
    <section id="layers" className="py-24 md:py-32 px-6 bg-background/50 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-4">The Layers</h2>

        <p className="text-lg text-muted-foreground leading-relaxed mb-16 max-w-3xl">
          We provide a stack: environments, evaluators, data, training infrastructure, and deployment tooling - wired
          together so agents can safely and iteratively learn from interactions.
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
