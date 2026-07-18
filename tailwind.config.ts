import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        ink: {
          DEFAULT: "#111A2E",
          soft: "#334059",
        },
        paper: "#F6F7F9",
        line: "#E1E4EA",
        accent: {
          DEFAULT: "#2452B0",
          deep: "#15316A",
          soft: "#EAF1FB",
        },
        status: {
          critical: "#B3261E",
          criticalBg: "#FBE9E7",
          warning: "#8A5300",
          warningBg: "#FBF0DC",
          info: "#1D4E89",
          infoBg: "#E9F0FB",
          success: "#1E7A46",
          successBg: "#E6F4EA",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
