import * as React from "react"
import { cn } from "../../lib/utils"

// Sourced from https://ui.eindev.ir/r/glass-morph-card.json (@einui/glass-morph-card),
// adapted for this project: relative `cn` import instead of the `@/` alias
// (no path-alias/shadcn config here), and `bg-gradient-to-*` instead of the
// registry's Tailwind v4 `bg-linear-to-*` (this project is on Tailwind v3).
interface GlassMorphCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  intensity?: number
  glowColor?: "cyan" | "purple" | "blue" | "pink" | "green"
  disabled?: boolean
  // "light" (default) is the bright bg-white/10 surface used on the login
  // card. "dark" is a near-black, more transparent surface so whatever's
  // behind the card (page gradient, the colored glow itself) reads through
  // more strongly instead of being washed out white.
  tone?: "light" | "dark"
  // "xl" (default, 16px) matches the login card. "md" (8px) is a tighter,
  // less bubble-like corner for compact UI like Kanban cards.
  radius?: "xl" | "md"
  // Whether to render the blurred colored aura outside the card edges.
  // Default true (login card). Off reads as a cleaner, contained panel —
  // used for the Kanban cards, which sit close together in a grid.
  glow?: boolean
}

const glowColors = {
  cyan: "from-cyan-500/40 to-blue-500/40",
  purple: "from-purple-500/40 to-pink-500/40",
  blue: "from-blue-500/40 to-indigo-500/40",
  pink: "from-pink-500/40 to-rose-500/40",
  green: "from-emerald-500/40 to-teal-500/40",
}

const radiusClasses = {
  xl: "rounded-2xl",
  md: "rounded-lg",
}

const GlassMorphCard = React.forwardRef<HTMLDivElement, GlassMorphCardProps>(
  (
    {
      className,
      children,
      intensity = 15,
      glowColor = "cyan",
      disabled = false,
      tone = "light",
      radius = "xl",
      glow = true,
      ...props
    },
    ref,
  ) => {
    const radiusClass = radiusClasses[radius]
    const cardRef = React.useRef<HTMLDivElement>(null)
    const [transform, setTransform] = React.useState({ rotateX: 0, rotateY: 0 })
    const [lightPosition, setLightPosition] = React.useState({ x: 50, y: 50 })
    const [isHovered, setIsHovered] = React.useState(false)

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
        setLightPosition({
          x: (x / rect.width) * 100,
          y: (y / rect.height) * 100,
        })
      },
      [intensity, disabled],
    )

    const handleMouseLeave = React.useCallback(() => {
      setTransform({ rotateX: 0, rotateY: 0 })
      setLightPosition({ x: 50, y: 50 })
      setIsHovered(false)
    }, [])

    const handleMouseEnter = React.useCallback(() => {
      setIsHovered(true)
    }, [])

    return (
      <div ref={ref} className={cn("relative", className)} style={{ perspective: "1000px" }} {...props}>
        {/* Glow effect */}
        {glow && (
          <div
            className={cn(
              "absolute -inset-2 bg-gradient-to-r blur-xl transition-opacity duration-300",
              radiusClass,
              glowColors[glowColor],
              isHovered ? "opacity-80" : "opacity-40",
            )}
          />
        )}

        {/* Card container */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseEnter={handleMouseEnter}
          className={cn(
            "relative border",
            radiusClass,
            "backdrop-blur-xl",
            "shadow-[0_8px_32px_rgba(0,0,0,0.37)]",
            "overflow-hidden transition-transform duration-200 ease-out",
            tone === "dark" ? "bg-slate-950/40 border-white/10" : "bg-white/10 border-white/20",
            !disabled && "cursor-pointer",
          )}
          style={{
            transform: `rotateX(${transform.rotateX}deg) rotateY(${transform.rotateY}deg)`,
            transformStyle: "preserve-3d",
          }}
        >
          {/* Dynamic light reflection */}
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300"
            style={{
              background: `radial-gradient(circle at ${lightPosition.x}% ${lightPosition.y}%, rgba(255,255,255,${tone === "dark" ? 0.15 : 0.3}) 0%, transparent 50%)`,
              opacity: isHovered ? 1 : 0,
            }}
          />

          {/* Glass highlight */}
          <div
            className={cn(
              "absolute inset-0 bg-gradient-to-b to-transparent pointer-events-none",
              radiusClass,
              tone === "dark" ? "from-white/5" : "from-white/20",
            )}
          />

          {/* Edge highlight */}
          <div
            className={cn("absolute inset-0 pointer-events-none transition-opacity duration-300", radiusClass)}
            style={{
              boxShadow: isHovered
                ? `inset 2px 2px 10px rgba(255,255,255,${tone === "dark" ? 0.1 : 0.2}), inset -2px -2px 10px rgba(0,0,0,0.1)`
                : `inset 1px 1px 2px rgba(255,255,255,${tone === "dark" ? 0.05 : 0.1})`,
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
