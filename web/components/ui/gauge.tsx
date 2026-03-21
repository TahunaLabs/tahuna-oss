import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const gaugeVariants = cva(
  "rounded transition-all relative overflow-hidden",
  {
    variants: {
      size: {
        xs: "h-3 w-3",
        sm: "h-4 w-4",
        md: "h-5 w-5",
        lg: "h-6 w-6",
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
