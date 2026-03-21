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
}

function Gauge({ percentage, label, variant, size, className, ...props }: GaugeProps) {
  return (
    <div
      className={cn(gaugeVariants({ variant, size, className }))}
      {...props}
    >
      <span className="relative z-10">{label}</span>
      <span className="relative z-10">{Math.round(percentage)}%</span>
      <div
        className="absolute inset-0 rounded opacity-30 transition-all duration-300"
        style={{
          width: `${percentage}%`,
          backgroundColor: "rgba(255, 255, 255, 0.2)",
        }}
      />
    </div>
  )
}

export { Gauge, gaugeVariants }
