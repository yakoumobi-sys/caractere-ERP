import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6fe", 500: "#7c3aed", 600: "#6d28d9", 700: "#5b21b6", 900: "#2e1065" },
        night: { 800: "#1c1838", 900: "#15122b", 950: "#0f0c22" },
      },
    },
  },
  plugins: [],
} satisfies Config;
