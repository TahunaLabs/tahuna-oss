import { Eyebrow } from '@/components/ui/eyebrow'
import { ScrollRail } from '@/components/ui/scroll-rail'

const FRAMEWORKS = [
  'PyTorch',
  'HuggingFace',
  'Unsloth',
  'TRL',
  'Verifiers',
  'W&B',
] as const

export function FrameworksBar() {
  return (
    <section className="shrink-0 border-t border-border px-8 py-5">
      <div className="flex items-center gap-8">
        <Eyebrow variant="cancelling" className="shrink-0">
          Works with your stack
        </Eyebrow>

        <ScrollRail className="ml-auto max-w-lg">
          <div className="flex items-center gap-10">
            {FRAMEWORKS.map((name) => (
              <span
                key={name}
                className="shrink-0 text-base font-semibold text-muted-foreground/40"
              >
                {name}
              </span>
            ))}
          </div>
        </ScrollRail>
      </div>
    </section>
  )
}
