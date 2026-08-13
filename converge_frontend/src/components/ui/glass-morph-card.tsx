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
  // "light" (default) is the bright bg-white/10 surface used on the login
  // card. "dark" is a near-black, more transparent surface so whatever's
  // behind the card (page gradient) reads through more strongly instead of
  // being washed out white. "silver" is a metallic gray-toned glass surface
  // (login card). "raised" is an opaque grey a step LIGHTER than the panel it
  // sits on, for cards that need to stand off their container (kanban board).
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
            "shadow-[0_8px_32px_rgba(0,0,0,0.37)]",
            "overflow-hidden transition-transform duration-200 ease-out",
            tone === "dark" && "bg-zinc-950/40 border-white/10",
            tone === "silver" && "bg-gradient-to-br from-zinc-100/40 via-zinc-300/25 to-zinc-400/40 border-zinc-200/40",
            tone === "light" && "bg-white/10 border-white/20",
            // Opaque so it reads as a solid object lifted off its panel rather
            // than a translucent pane the panel shows through.
            tone === "raised" && "bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600",
            !disabled && "cursor-pointer",
          )}
          style={{
            transform: `rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg)`,
            transformStyle: "preserve-3d",
          }}
        >
          {/* Glass highlight */}
          <div
            className={cn(
              "absolute inset-0 bg-gradient-to-b to-transparent pointer-events-none",
              radiusClass,
              tone === "dark" || tone === "raised" ? "from-white/5" : "from-white/20",
            )}
          />

          {/* Edge highlight */}
          <div
            className={cn("absolute inset-0 pointer-events-none", radiusClass)}
            style={{
              boxShadow: `inset 1px 1px 2px rgba(255,255,255,${tone === "dark" || tone === "raised" ? 0.05 : 0.1})`,
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
