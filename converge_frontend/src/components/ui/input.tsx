import * as React from "react"

import { cn } from "../../lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        // Square field on a white surface. Focus is the one place a colored
        // ring earns its keep, so it takes the brand blue - same treatment as
        // the login inputs. Placeholders are italic so they read as a prompt,
        // not as content. The fill is solid rather than the old translucent
        // zinc-900/40, which over a light canvas muddied to grey. Weight is
        // `normal` rather than `light`: hairline text on white looked washed
        // out next to the heavier body copy.
        "flex h-10 w-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-normal text-zinc-100 transition-all duration-300 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:italic placeholder:text-zinc-600 hover:border-zinc-600 focus-visible:outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20 focus-visible:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = "Input"

export { Input }
