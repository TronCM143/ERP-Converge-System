import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950",
  {
    variants: {
      variant: {
        default:
          "border-blue-700/50 bg-blue-900/30 text-blue-300 hover:bg-blue-900/50",
        secondary:
          "border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800",
        destructive:
          "border-red-700/50 bg-red-900/30 text-red-300 hover:bg-red-900/50",
        outline: "border-slate-700 text-slate-300",
        success:
          "border-emerald-700/50 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
