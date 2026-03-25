import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"

type SpinnerProps = {
  className?: string
  size?: "sm" | "md" | "lg"
}

const sizeClasses = {
  sm: "h-8",
  md: "h-12",
  lg: "h-16",
}

export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <Logo
      className={cn(
        "w-auto animate-spin select-none",
        sizeClasses[size],
        className,
      )}
      aria-hidden="true"
    />
  )
}
