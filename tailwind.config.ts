import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f4f6fb",
          100: "#e6eaf5",
          200: "#c3cfe7",
          300: "#9fb3d8",
          400: "#5a7dbb",
          500: "#1f4e9e", // couleur principale Caractère
          600: "#1c4690",
          700: "#173a77",
          800: "#132e5f",
          900: "#0f244c",
        },
      },
    },
  },
  plugins: [],
};
export default config;
