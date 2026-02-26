import { cn } from "@/lib/utils"

type SpinnerProps = {
  className?: string
  size?: "sm" | "md" | "lg"
}

const sizeClasses = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
}

export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <span
      className={cn(
        "inline-block animate-spin font-serif text-primary select-none",
        sizeClasses[size],
        className,
      )}
      aria-hidden="true"
    >
      {"✻"}
    </span>
  )
}

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

