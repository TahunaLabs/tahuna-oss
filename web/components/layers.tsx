import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { IconBox } from "@/components/ui/icon-box"
import { Section, SectionContainer } from "@/components/ui/section"
import { SectionHeading } from "@/components/ui/section-heading"
import { BookOpen, Box, Cpu, Scale, Shield } from "lucide-react"

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
    <Section variant="blurred" id="layers">
      <SectionContainer size="md">
        <SectionHeading variant="medium" className="mb-4">The Stack</SectionHeading>

        <p className="text-lg text-muted-foreground leading-relaxed mb-16 max-w-3xl">
          Everything you need to go from idea to specific intelligence — no PhD required.
        </p>

        <div className="space-y-8">
          {layers.map((layer, index) => (
            <Card key={layer.title} className="relative">
              <div className="absolute inset-0 bg-background/50 backdrop-blur-sm -z-10" />
              <CardContent className="p-8">
                <div className="flex items-start gap-4 mb-4 relative z-10">
                  <IconBox>
                    <layer.icon className="h-5 w-5" />
                  </IconBox>
                  <div>
                    <Badge variant="ghost" className="mb-1 block">
                      Layer {index + 1}
                    </Badge>
                    <h3 className="text-xl font-medium">
                      {layer.title}: <span className="text-muted-foreground font-normal">{layer.subtitle}</span>
                    </h3>
                  </div>
                </div>

                <p className="text-muted-foreground mb-4 relative z-10">{layer.description}</p>

                <p className="text-sm font-medium italic relative z-10">{layer.tagline}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SectionContainer>
    </Section>
  )
}
