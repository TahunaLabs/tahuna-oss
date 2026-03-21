import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const gaugeVariants = cva(
  "rounded transition-all relative overflow-hidden",
  {
    variants: {
      variant: {
        accent: "bg-accent text-accent-foreground",
        warning: "bg-warning text-white",
        destructive: "bg-destructive text-white",
      },
      size: {
        xs: "h-2 w-8",
        sm: "h-3 w-12",
        md: "h-4 w-16",
        lg: "h-6 w-24",
      },
    },
    defaultVariants: {
      variant: "accent",
      size: "sm",
    },
  },
)

interface GaugeProps extends React.ComponentProps<"div">, VariantProps<typeof gaugeVariants> {
  percentage: number
}

function Gauge({ percentage, size, className, ...props }: GaugeProps) {
  return (
    <div
      className={cn(
        gaugeVariants({ size, className }),
        "bg-muted"
      )}
      {...props}
    >
      <div
        className="h-full rounded transition-all duration-300"
        style={{
          width: `${percentage}%`,
          backgroundColor: "var(--accent)",
        }}
      />
    </div>
  )
}

export { Gauge, gaugeVariants }
