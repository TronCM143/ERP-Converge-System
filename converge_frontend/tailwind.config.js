/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ── Monochrome theme ────────────────────────────────────────────────
      // The whole UI is remapped onto a single neutral grey ramp (zinc), so
      // every existing `slate-*` / `blue-*` / `cyan-*` class in the codebase
      // renders as grey without touching hundreds of call sites:
      //
      //   * slate → zinc: kills the blue tint the old "dark blue" theme had.
      //     Surfaces now read as dark GREY, matching the login page, which
      //     was authored directly in zinc.
      //   * blue / cyan / indigo / purple → zinc: former accent colors
      //     (gradient titles, focus rings, filled buttons, stage headers,
      //     selection highlights, notification badge) collapse into the same
      //     grey ramp. Full 50→950 ramps are declared, not just the shades
      //     in use, so a stray `blue-900` added later can't leak color back.
      //
      // Semantic green / red / amber / rose (approve, delete, reject, warn)
      // are deliberately NOT remapped — they're functional state cues, not
      // decoration, and are the only saturated colors left in the UI.
      colors: {
        slate: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
        // Accent families all point at the same greys. Mid shades land a
        // little lighter than their slate counterparts so an "accent" still
        // reads as emphasis (lighter grey) against a dark grey surface.
        blue: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#e4e4e7",
          400: "#d4d4d8",
          500: "#a1a1aa",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
        cyan: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
        indigo: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
        purple: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
        sky: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
        violet: {
          50: "#fafafa",
          100: "#f4f4f5",
          200: "#e4e4e7",
          300: "#d4d4d8",
          400: "#a1a1aa",
          500: "#71717a",
          600: "#52525b",
          700: "#3f3f46",
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
      },
      // Squared-off everywhere: every `rounded-*` utility (including
      // `rounded-full` on dots, pills, progress bars and avatars) resolves
      // to 0 so nothing in the UI keeps a soft corner. Every key of the
      // default scale is listed on purpose — an unlisted key would fall
      // back to Tailwind's rounded default and reintroduce a stray radius.
      borderRadius: {
        none: "0",
        sm: "0",
        DEFAULT: "0",
        md: "0",
        lg: "0",
        xl: "0",
        "2xl": "0",
        "3xl": "0",
        full: "0",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
