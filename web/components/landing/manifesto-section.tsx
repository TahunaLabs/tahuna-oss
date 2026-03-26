import { Card, CardContent } from '@/components/ui/card'
import { Eyebrow } from '@/components/ui/eyebrow'

export function ManifestoSection() {
  return (
    <section id="manifesto" className="shrink-0 border-t border-border px-8 py-20">
      <div className="mx-auto max-w-2xl">
        <Eyebrow variant="queued" className="mb-8">
          Philosophy
        </Eyebrow>

        <h2 className="mb-8 font-serif text-5xl font-semibold leading-display-tight text-foreground">
          A gentle control plane.
        </h2>

        <p className="font-mono text-sm text-muted-foreground leading-relaxed">
          Not another infrastructure hell. Not a wall of knobs. More like a
          quiet field where models learn to move with you. You point, it
          listens. You shift, it follows. Push code, the training follows. The
          heavy machinery stays out of sight — no headaches, no config
          spirals. Just progress arriving in small, inevitable waves. Fast
          starts. Calm loops. A little room for whims.
        </p>

        <Card variant="surface" className="mt-10">
          <CardContent className="py-3">
            <p className="font-mono text-sm text-muted-foreground">
              <span className="text-foreground">init</span>
              {' → '}
              <span className="text-foreground">align</span>
              {' → '}
              <span className="text-foreground">converge</span>
              {' → '}
              <span className="text-foreground">emerge</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
