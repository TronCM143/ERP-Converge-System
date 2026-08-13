import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

// Monochrome, square-cornered buttons matching the login screen: the primary
// action is a light-on-dark inversion (zinc-100 on zinc-950) instead of a
// colored fill, and labels are small uppercase with wide tracking. Gradients
// and colored glows are gone. `destructive` keeps red - it's a functional
// warning cue, not decoration.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap border text-[12px] font-bold uppercase tracking-[0.12em] ring-offset-zinc-950 transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-zinc-100 text-zinc-950 border-zinc-100 hover:bg-white hover:shadow-[0_0_20px_rgba(255,255,255,0.15)]",
        destructive:
          "bg-red-700 text-white border-red-700 hover:bg-red-600 hover:border-red-600",
        outline:
          "border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-800 hover:border-zinc-500",
        secondary:
          "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 hover:border-zinc-600",
        ghost: "border-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50",
        // Inline links read as prose, so they opt out of the uppercase
        // treatment and lean on italic emphasis instead.
        link: "border-transparent text-sm font-medium normal-case italic tracking-normal text-zinc-300 underline-offset-4 hover:underline hover:text-zinc-50",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-[11px]",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
