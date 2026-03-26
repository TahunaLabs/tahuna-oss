import { Logo } from '@/components/logo'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/* PipelineNode — internal decorative element built on Card */
function PipelineNode({
  highlighted = false,
  className,
}: {
  highlighted?: boolean
  className?: string
}) {
  return (
    <Card
      variant="surface"
      className={cn('flex items-center gap-1.5 px-4 py-2.5 shadow-sm', className)}
    >
      <div className="size-2 rounded-full bg-border" />
      <div className="h-px w-6 bg-border" />
      <div className="size-2 rounded-full bg-border" />
      <div className="h-px w-6 bg-border" />
      <div
        className={cn(
          'size-3.5 rounded-full border-2 transition-colors',
          highlighted ? 'border-primary bg-primary/20' : 'border-border bg-background',
        )}
      />
    </Card>
  )
}

export function HeroDecoration() {
  return (
    <div className="relative h-full w-full min-h-96 select-none" aria-hidden>
      {/* Workspace boundary */}
      <div className="absolute left-[30%] top-[14%] h-[55%] w-[42%] rounded-lg border border-border/50" />

      {/* Floating pipeline nodes */}
      <PipelineNode className="absolute left-[10%] top-[5%]" />
      <PipelineNode className="absolute right-[2%] top-[22%]" />
      <PipelineNode highlighted className="absolute left-[22%] top-[38%]" />
      <PipelineNode highlighted className="absolute bottom-[28%] left-[2%]" />
      <PipelineNode className="absolute right-[0%] top-[52%]" />

      {/* Center logo mark */}
      <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 opacity-25">
        <Logo className="h-10 w-auto" />
      </div>

      {/* Code preview card */}
      <Card variant="surface" className="absolute bottom-[4%] right-[0%] w-56 shadow-md">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <div className="size-1.5 rounded-full bg-border" />
          <div className="size-1.5 rounded-full bg-border" />
          <div className="size-1.5 rounded-full bg-border" />
          <span className="ml-1 font-mono text-ui-caption text-muted-foreground tracking-ui-label">
            train-loop-config
          </span>
        </div>
        <CardContent className="p-3">
          <pre className="font-mono text-ui-micro leading-relaxed text-muted-foreground whitespace-pre">
{`model.fit(
  .data,
  .x_axis,
  .y_axis,
  .plot.title = NULL,
  .plot.subtitle = NULL,`}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
