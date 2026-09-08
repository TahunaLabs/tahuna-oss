import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const gaugeVariants = cva(
  "rounded-sm transition-all relative overflow-hidden",
  {
    variants: {
      size: {
        xs: "h-1.5 w-5",
        sm: "h-2 w-8",
        md: "h-2 w-10",
        lg: "h-3 w-16",
      },
    },
    defaultVariants: {
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
        "bg-muted shrink-0"
      )}
      {...props}
    >
      <div
        className="w-full rounded bg-accent transition-all duration-300"
        style={{
          height: `${percentage}%`,
          marginTop: `${100 - percentage}%`,
        }}
      />
    </div>
  )
}

export { Gauge, gaugeVariants }
