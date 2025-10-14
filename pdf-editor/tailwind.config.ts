import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: "class",
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    plugin(function ({ addBase }) {
      addBase({
        ":root": {
          "--background": "220 25% 98%",
          "--foreground": "230 25% 15%",
          "--card": "0 0% 100%",
          "--card-foreground": "230 25% 15%",
          "--popover": "0 0% 100%",
          "--popover-foreground": "230 25% 15%",
          "--primary": "250 85% 60%",
          "--primary-foreground": "0 0% 100%",
          "--primary-glow": "250 90% 70%",
          "--secondary": "220 15% 94%",
          "--secondary-foreground": "230 25% 15%",
          "--muted": "220 15% 94%",
          "--muted-foreground": "230 15% 45%",
          "--accent": "265 75% 65%",
          "--accent-foreground": "0 0% 100%",
          "--destructive": "0 75% 60%",
          "--destructive-foreground": "0 0% 100%",
          "--border": "220 20% 88%",
          "--input": "220 20% 88%",
          "--ring": "250 85% 60%",
          "--radius": "0.75rem",
          "--gradient-primary": "linear-gradient(135deg, hsl(250 85% 60%), hsl(265 75% 65%))",
          "--gradient-subtle": "linear-gradient(180deg, hsl(220 25% 98%), hsl(220 20% 96%))",
          "--shadow-elegant": "0 10px 30px -10px hsl(250 85% 60% / 0.2)",
          "--shadow-card": "0 4px 12px hsl(230 15% 15% / 0.08)",
          "--transition-smooth": "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          "--sidebar-background": "0 0% 98%",
          "--sidebar-foreground": "240 5.3% 26.1%",
          "--sidebar-primary": "240 5.9% 10%",
          "--sidebar-primary-foreground": "0 0% 98%",
          "--sidebar-accent": "240 4.8% 95.9%",
          "--sidebar-accent-foreground": "240 5.9% 10%",
          "--sidebar-border": "220 13% 91%",
          "--sidebar-ring": "217.2 91.2% 59.8%",
        },
        ".dark": {
          "--background": "230 25% 10%",
          "--foreground": "220 20% 95%",
          "--card": "230 20% 12%",
          "--card-foreground": "220 20% 95%",
          "--popover": "230 20% 12%",
          "--popover-foreground": "220 20% 95%",
          "--primary": "250 85% 65%",
          "--primary-foreground": "0 0% 100%",
          "--primary-glow": "250 90% 75%",
          "--secondary": "230 15% 18%",
          "--secondary-foreground": "220 20% 95%",
          "--muted": "230 15% 18%",
          "--muted-foreground": "220 15% 60%",
          "--accent": "265 75% 68%",
          "--accent-foreground": "0 0% 100%",
          "--destructive": "0 70% 55%",
          "--destructive-foreground": "0 0% 100%",
          "--border": "230 15% 22%",
          "--input": "230 15% 22%",
          "--ring": "250 85% 65%",
          "--gradient-primary": "linear-gradient(135deg, hsl(250 85% 65%), hsl(265 75% 68%))",
          "--gradient-subtle": "linear-gradient(180deg, hsl(230 25% 10%), hsl(230 20% 12%))",
          "--shadow-elegant": "0 10px 30px -10px hsl(250 85% 65% / 0.3)",
          "--shadow-card": "0 4px 12px hsl(0 0% 0% / 0.3)",
          "--sidebar-background": "240 5.9% 10%",
          "--sidebar-foreground": "240 4.8% 95.9%",
          "--sidebar-primary": "224.3 76.3% 48%",
          "--sidebar-primary-foreground": "0 0% 100%",
          "--sidebar-accent": "240 3.7% 15.9%",
          "--sidebar-accent-foreground": "240 4.8% 95.9%",
          "--sidebar-border": "240 3.7% 15.9%",
          "--sidebar-ring": "217.2 91.2% 59.8%",
        },
      });
    }),
  ],
} satisfies Config;
