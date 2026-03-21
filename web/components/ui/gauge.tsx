import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const gaugeVariants = cva(
  "rounded-sm transition-all relative overflow-hidden",
  {
    variants: {
      size: {
        xs: "h-1.5 w-2",
        sm: "h-2 w-3",
        md: "h-2 w-4",
        lg: "h-3 w-6",
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
        className="w-full rounded transition-all duration-300"
        style={{
          height: `${percentage}%`,
          backgroundColor: "var(--accent)",
          marginTop: `${100 - percentage}%`,
        }}
      />
    </div>
  )
}

export { Gauge, gaugeVariants }
