import * as React from "react"
import { cn } from "../../lib/utils"

// Sourced from https://ui.eindev.ir/r/glass-morph-card.json (@einui/glass-morph-card),
// adapted for this project: relative `cn` import instead of the `@/` alias
// (no path-alias/shadcn config here), and `bg-gradient-to-*` instead of the
// registry's Tailwind v4 `bg-linear-to-*` (this project is on Tailwind v3).
interface GlassMorphCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  intensity?: number
  disabled?: boolean
  // "light" (default) is a translucent white pane. "dark" is a more heavily
  // tinted translucent surface so whatever's behind the card reads through
  // more strongly. "silver" is a soft gradient glass surface (login card).
  // "raised" is an opaque WHITE surface against the grey panel it sits on,
  // for cards that need to stand off their container (kanban board).
  //
  // All four were authored for the dark theme, where "raised" meant a step
  // lighter and highlights were white. Under the light theme the direction
  // flips: raised means white-on-grey, and depth comes from a soft dark
  // shadow rather than a white edge highlight.
  tone?: "light" | "dark" | "silver" | "raised"
  // Kept for API compatibility only - the monochrome theme is squared off, so
  // both values render with no corner radius.
  radius?: "xl" | "md"
}

const radiusClasses = {
  xl: "rounded-none",
  md: "rounded-none",
}

const GlassMorphCard = React.forwardRef<HTMLDivElement, GlassMorphCardProps>(
  (
    {
      className,
      children,
      intensity = 15,
      disabled = false,
      tone = "light",
      radius = "xl",
      ...props
    },
    ref,
  ) => {
    const radiusClass = radiusClasses[radius]
    const cardRef = React.useRef<HTMLDivElement>(null)
    const [transform, setTransform] = React.useState({ rotateX: 0, rotateY: 0 })

    const handleMouseMove = React.useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (disabled || !cardRef.current) return

        const rect = cardRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const centerX = rect.width / 2
        const centerY = rect.height / 2

        const rotateX = ((y - centerY) / centerY) * -intensity
        const rotateY = ((x - centerX) / centerX) * intensity

        setTransform({ rotateX, rotateY })
      },
      [intensity, disabled],
    )

    const handleMouseLeave = React.useCallback(() => {
      setTransform({ rotateX: 0, rotateY: 0 })
    }, [])

    return (
      <div ref={ref} className={cn("relative", className)} style={{ perspective: "1000px" }} {...props}>
        {/* Card container */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className={cn(
            "relative border",
            radiusClass,
            "backdrop-blur-xl",
            "shadow-[0_2px_8px_rgba(24,24,27,0.06)]",
            "overflow-hidden transition-transform duration-200 ease-out",
            tone === "dark" && "bg-zinc-950/70 border-zinc-700",
            tone === "silver" && "bg-gradient-to-br from-zinc-900/80 via-zinc-950/70 to-zinc-800/80 border-zinc-700",
            tone === "light" && "bg-zinc-900/70 border-zinc-700",
            // Opaque white so it reads as a solid object lifted off its grey
            // panel rather than a translucent pane the panel shows through.
            tone === "raised" && "bg-zinc-900 border-zinc-700 hover:bg-zinc-950 hover:border-zinc-600",
            !disabled && "cursor-pointer",
          )}
          style={{
            transform: `rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg)`,
            transformStyle: "preserve-3d",
          }}
        >
          {/* Glass sheen. On a light surface a white gradient is invisible, so
              this runs the other way: a faint dark wash at the bottom edge. */}
          <div
            className={cn(
              "absolute inset-0 bg-gradient-to-t to-transparent pointer-events-none",
              radiusClass,
              tone === "dark" || tone === "raised" ? "from-zinc-50/[0.02]" : "from-zinc-50/[0.04]",
            )}
          />

          {/* Edge highlight — likewise a soft dark inset rather than the white
              inset the dark theme used. */}
          <div
            className={cn("absolute inset-0 pointer-events-none", radiusClass)}
            style={{
              boxShadow: `inset 0 -1px 2px rgba(24,24,27,${tone === "dark" || tone === "raised" ? 0.03 : 0.05})`,
            }}
          />

          {/* Content */}
          <div className="relative z-10" style={{ transform: "translateZ(20px)" }}>
            {children}
          </div>
        </div>
      </div>
    )
  },
)
GlassMorphCard.displayName = "GlassMorphCard"

export { GlassMorphCard }
