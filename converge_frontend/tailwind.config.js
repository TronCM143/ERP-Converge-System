/** @type {import('tailwindcss').Config} */

// ── Light theme: navy text, brand blue + orange accents ─────────────────────
// The UI was authored dark-first: surfaces are `bg-zinc-900/800/700`, text is
// `text-zinc-50…600`, borders are `border-zinc-800/700`. Rather than rewrite
// ~1000 call sites, the neutral ramp itself is INVERTED here — index 50 is now
// the darkest value and 950 the lightest — so every existing class keeps its
// meaning ("900 is a surface", "50 is primary text") while rendering light.
//
// Read the table by role, not by lightness:
//
//   950  page canvas          — the soft cool grey the app shell sits on
//   900  card / panel         — white, so panels lift off the canvas
//   800  hairline / hover     — subtle divider, hover fill, dropdown body
//   700  border / chip        — the standard visible border, badge fill
//   600  placeholder          — faintest text tier, strongest border
//   500  muted text           — 4.6:1 on white (AA)
//   400  secondary text       — 5.7:1 on white (AA)
//   300  body text
//   200  strong text
//   100  primary button fill  — pairs with `text-zinc-950` for a dark button
//   50   primary text         — dark NAVY, not black
//
// The dark end carries a blue cast on purpose: plain #18181b body copy reads
// flat, so the text tiers are hue-shifted toward the brand navy. It still
// scans as "near-black" at a glance but has depth up close.
//
// 950 (canvas) is deliberately DARKER than 900 (card): that is the one break
// in monotonicity, and it is what produces "grey page, white cards". From 900
// downward the ramp darkens normally, which is correct elevation *within* a
// card (white card → grey hover → darker chip).
//
// `bg-zinc-100` + `text-zinc-950` was a light-on-dark primary button in the
// dark theme; inverted it becomes dark-on-light, which is exactly the
// convention light mode wants — the pairing survives untouched.
// Enterprise ERP palette. Each spec colour lands on the slot that already
// carries that role, so the whole app picks it up without touching call sites:
//
//   50  #1B2F4C  main text / headings   (login: deep navy)
//   200 #2B446B  strong text            (login: photo overlay tint)
//   300 #3A598F  body / emphasis        (login: outer angled shapes)
//   400 #5B7196  secondary text         - 4.95:1 on white
//   500 #64788F  muted text             - 4.54:1 on white
//   700 #CCD6E6  borders                (blue-tinted)
//   900 #FFFFFF  cards / panels
//   950 #F0F4FA  page background
//
// The intermediate steps are interpolated along the same navy→slate line so
// the tiers stay distinguishable. 400 is 4.8:1 on white and 500 is 4.3:1 —
// both hold up as body-adjacent text; 600 is placeholder-weight only.
const mono = {
  50: "#1b2f4c",
  100: "#24395c",
  200: "#2b446b",
  300: "#3a598f",
  400: "#5b7196",
  500: "#64788f",
  600: "#9aabc4",
  700: "#ccd6e6",
  800: "#e4eaf3",
  900: "#ffffff",
  950: "#f0f4fa",
}

/* Corporate blue, taken from the login page's geometry.

     600  #3a598f  the outer angled shapes — links, focus, active states
     400  #6b8ec0  the inner angled shapes — hovers, lighter fills
     800  #2b446b  the photo's overlay tint
     950  #1b2f4c  the photo's bottom anchoring gradient

   The neutral ramp above resolves to the same family at its dark end, so text
   and chrome sit in the login screen's palette rather than a separate navy. */
const brandBlue = {
  50: "#f2f6fb",
  100: "#e3ebf5",
  200: "#c8d7e9",
  300: "#9db8d7",
  400: "#6b8ec0",
  500: "#4d72a5",
  600: "#3a598f",
  700: "#314b77",
  800: "#2b446b",
  900: "#243a5c",
  950: "#1b2f4c",
}

// Corporate orange. 500 is the spec's #E87516 — primary action buttons, the
// active navigation indicator, and the Quote pipeline stage. Deliberately
// scarce: orange here means "act on this", so spreading it across ordinary
// controls would drain it of meaning.
const brandOrange = {
  50: "#fef4ec",
  100: "#fde6d3",
  200: "#fac9a4",
  300: "#f5a76f",
  400: "#ef8b3f",
  500: "#e87516",
  600: "#ce6410",
  700: "#a94e10",
  800: "#883f13",
  900: "#6f3413",
  950: "#3c1907",
}

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // `zinc`/`slate` carry the neutral ramp. `blue` and `orange` are real
      // brand accents. The remaining former-accent families (cyan/indigo/
      // purple/sky/violet) still collapse into the neutral ramp so a stray
      // `purple-600` added later can't leak an unplanned hue into the UI.
      //
      // Semantic green / red / amber / rose (approve, delete, reject, warn)
      // are left as Tailwind defaults — they're functional state cues.
      colors: {
        zinc: mono,
        slate: mono,
        cyan: mono,
        indigo: mono,
        purple: mono,
        sky: mono,
        violet: mono,
        blue: brandBlue,
        orange: brandOrange,
        brand: brandBlue,
        accent: brandOrange,
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
