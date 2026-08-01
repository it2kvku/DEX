import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: "#191b1f",
        accent1: "#ff007a",
        accent2: "#b478ff",
        accent3: "#4c82fb",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-grotesk)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(255, 0, 122, 0.28)",
        "glow-sm": "0 0 12px rgba(255, 0, 122, 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
