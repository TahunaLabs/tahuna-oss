import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const gaugeVariants = cva(
  "w-full rounded font-medium transition-all relative overflow-hidden flex items-center justify-between",
  {
    variants: {
      variant: {
        accent: "bg-accent text-accent-foreground",
        warning: "bg-warning text-white",
        destructive: "bg-destructive text-white",
      },
      size: {
        sm: "px-2 py-1 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-6 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "accent",
      size: "md",
    },
  },
)

interface GaugeProps extends React.ComponentProps<"div">, VariantProps<typeof gaugeVariants> {
  percentage: number
  label: string
  gradient?: boolean
}

function Gauge({ percentage, label, variant, size, className, gradient = false, ...props }: GaugeProps) {
  let bgColor = "bg-accent"
  let textColor = "text-accent-foreground"

  if (gradient) {
    const ratio = percentage / 100
    const hue = ratio * 240
    bgColor = `hsl(${hue}, 100%, 50%)`
  }

  return (
    <div
      className={cn(
        "w-full rounded font-medium transition-all relative overflow-hidden flex items-center justify-between",
        !gradient && gaugeVariants({ variant, size }),
        className
      )}
      style={gradient ? {
        backgroundColor: `hsl(${(percentage / 100) * 240}, 100%, 50%)`,
        color: "white",
        padding: size === "sm" ? "4px 8px" : size === "lg" ? "12px 24px" : "8px 16px",
        fontSize: size === "sm" ? "12px" : size === "lg" ? "16px" : "14px",
      } : {}}
      {...props}
    >
      <span className="relative z-10">{label}</span>
      <span className="relative z-10">{Math.round(percentage)}%</span>
      <div
        className="absolute inset-0 rounded opacity-20 transition-all duration-300"
        style={{
          width: `${100 - percentage}%`,
          backgroundColor: "rgba(0, 0, 0, 0.3)",
          marginLeft: `${percentage}%`,
        }}
      />
    </div>
  )
}

export { Gauge, gaugeVariants }
