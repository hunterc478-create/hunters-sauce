import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        // Hunter's Sportsbook: light "sports page" palette. Deep red is the brand (header, active links, buttons);
        // green marks good numbers (value, wins); losses use a darker red with a minus sign.
        // v1 token names are kept so shared components follow: obsidian = page background, neon = positive/value.
        obsidian: "#F6F5F2",
        ink: "#111111",
        brand: { DEFAULT: "#C8102E", dim: "#A30D25", soft: "#FBE9EC" },
        neon: { DEFAULT: "#13804A", dim: "#0E6A3D" },
        slate: { card: "#FFFFFF", raised: "#F1EFEB", line: "#E3E0DA", hover: "#EAE7E1" },
        info: "#1D5FBF",
        warn: "#B45309",
        loss: "#B42318",
      },
      boxShadow: { card: "0 1px 2px rgba(17,17,17,0.04), 0 1px 1px rgba(17,17,17,0.03)" },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: { "accordion-down": "accordion-down 0.2s ease-out", "accordion-up": "accordion-up 0.2s ease-out" },
    },
  },
  plugins: [animate],
};
export default config;
