import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type PageLoaderProps = {
  message?: string
  className?: string
}

export function PageLoader({ message, className }: PageLoaderProps) {
  return (
    <div className={cn("min-h-screen flex flex-col items-center justify-center gap-3", className)}>
      <Spinner size="lg" />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}
