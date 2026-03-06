import { Section, SectionContainer } from "@/components/section"
import { SectionHeading } from "@/components/section-heading"

export function Manifesto() {
  return (
    <Section variant="blurred" id="manifesto">
      <SectionContainer size="md">
        <div className="space-y-6 text-lg text-muted-foreground leading-relaxed">
          <SectionHeading variant="display" className="max-w-4xl">
            A gentler control plane.
          </SectionHeading>
          <p>
            Not another infrastructure hell. Not a wall of knobs. More like a quiet field where models learn to move with you. You point, it listens. You shift, it follows. Push code, the training follows. The heavy machinery stays out of sight, no headaches, no config spirals. Just progress arriving in small, inevitable waves. Fast starts. Calm loops. A little room for whims.
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-border bg-background px-4 py-3">
          <p className="font-mono text-xs text-muted-foreground">
            init {" > "} align {" > "} converge {" > "} emerge
          </p>
        </div>
      </SectionContainer>
    </Section>
  )
}
