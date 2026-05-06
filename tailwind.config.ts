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
        beige: "var(--beige)",
        coral: "var(--coral)",
        lilac: "var(--lilac)",
        salmon: "var(--salmon)",
        heavy: "var(--heavy)",
        emphasis: "var(--emphasis)",
        active: "var(--active)",
        medium: "var(--medium)",
        light: "var(--light)",
        "faint-lilac": "var(--faint-lilac)",
        offwhite: "var(--offwhite)",
        highlight: "var(--highlight)",
        tinted: "var(--tinted)",
      },
      fontFamily: {
        figtree: ["var(--font-figtree)", "sans-serif"],
        dico: ["var(--font-dico)", "serif"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "goose-spin": "url('/tenor1.gif')",
        "hw-radial-gradient":
          "radial-gradient(circle at 88% 8%, var(--salmon) 0%, transparent 28%), radial-gradient(circle at 0% 0%, var(--lilac) 0%, transparent 34%), linear-gradient(145deg, var(--beige) 0%, var(--faint-lilac) 100%)",
      },
      boxShadow: {
        "hw-card": "0 16px 40px rgba(60, 32, 76, 0.10)",
        "hw-button": "0 2px 4px rgba(60, 32, 76, 0.20)",
      },
      screens: {
        xs: "475px",
        sm: "640px",
        md: "1024px",
        lg: "1440px",
        xl: "1920px",
        "2xl": "2560px",
        "3xl": "3440px",
      },
    },
  },
  plugins: [],
};
export default config;
