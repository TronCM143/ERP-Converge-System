import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

// Square tags (no pill), with the neutral variants differentiated by grey
// luminance and uppercase tracking. destructive/success keep their hue -
// those two communicate state, so flattening them would lose information.
const badgeVariants = cva(
  "inline-flex items-center border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-zinc-950",
  {
    variants: {
      variant: {
        default:
          "border-zinc-600 bg-zinc-700/60 text-zinc-100 hover:bg-zinc-700",
        secondary:
          "border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800",
        // Semantic tints are flipped for a light surface: a pale wash with a
        // dark label, rather than the dark theme's deep-900 wash with a
        // light-300 label (which would be unreadable on white).
        destructive:
          "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
        outline: "border-zinc-700 text-zinc-300",
        success:
          "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
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
