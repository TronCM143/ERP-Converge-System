import * as React from "react"

import { cn } from "../../lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        // Square field, grey surface, and a border that brightens on focus
        // instead of a colored ring - same treatment as the login inputs.
        // Placeholders are italic so they read as a prompt, not as content.
        "flex h-10 w-full border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm font-light text-zinc-100 transition-all duration-300 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:italic placeholder:text-zinc-600 hover:border-zinc-600 focus-visible:outline-none focus-visible:border-zinc-300 focus-visible:bg-zinc-900/80 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
