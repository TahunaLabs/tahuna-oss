import { Section, SectionContainer } from "@/components/ui/section"
import { SectionHeading } from "@/components/ui/section-heading"

export function Manifesto() {
  return (
    <Section variant="blurred" id="manifesto">
      <SectionContainer size="md">
        <SectionHeading variant="display" className="mb-12">
          Vibe Research.
        </SectionHeading>

        <div className="space-y-6 text-lg text-muted-foreground leading-relaxed max-w-3xl">
          <p>
            You can&apos;t prompt your way into high-quality agentic behavior. And you can&apos;t
            brute-force it with scale alone. The last decade was defined by throwing larger volumes
            of compute at larger monolithic systems — but intelligence shouldn&apos;t be frozen in
            training data or updated in slow, expensive cycles.
          </p>

          <p>
            We&apos;re betting against brute-force scaling. Where others chase size, we&apos;re
            building adaptability-first systems — efficient AI that continually learns.
          </p>

          <p>
            Post-training the mechanism that makes this possible. It takes something that
            works &ldquo;okay&rdquo; in simple settings and makes it robust enough to handle
            long-horizon, multi-step tasks reliably. This is exactly how the frontier labs are
            building their next generation of models — and the results speak for themselves.
          </p>

          <p className="text-foreground font-medium">
            Tahuna brings this capability to everyone. Train, evaluate, and iterate on agentic
            reasoners — with clean reward signals, rigorous evaluation, and continuous improvement
            loops — without needing a research lab to do it.
          </p>

          <p>
            The recipe is becoming clear: RL, evaluators, synthetic data, and iterative refinement.
            We&apos;re making it accessible, fun, and scalable.
          </p>
        </div>

        <div className="mt-16 pt-8 border-t border-border">
          <p className="text-lg italic text-muted-foreground leading-relaxed">
            Two Senior ML Engineers. One mission: make the frontier accessible.
          </p>
        </div>
      </SectionContainer>
    </Section>
  )
}
