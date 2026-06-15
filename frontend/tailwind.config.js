// Palette used by the Learner Result Tickets page.
// Plain hex values (no oklch / CSS-var indirection) so colors render identically
// across all browsers and never fall back to gray.
const palette = {
  background: { 50: "#ffffff", 100: "#f6f6fa", 200: "#e6e7ef", 300: "#d5d7e2", 400: "#b4b6c4", 500: "#8f91a2", 600: "#65677a", 700: "#44465b", 800: "#2a2c42", 900: "#17182f", 950: "#08071f" },
  foreground: { 50: "#f4f5f9", 100: "#e2e4eb", 200: "#c7cad5", 300: "#9a9eab", 400: "#6f7485", 500: "#52576c", 600: "#3b415b", 700: "#262b49", 800: "#151939", 900: "#0d0b2f", 950: "#050122" },
  primary: { 50: "#f4f1ff", 100: "#e8e3ff", 200: "#d1c8ff", 300: "#b0a2fe", 400: "#8d73f0", 500: "#704fd9", 600: "#5a38b8", 700: "#492797", 800: "#371b73", 900: "#281253", 950: "#180537" },
  accent: { 50: "#fff3df", 100: "#ffe2bc", 200: "#ffc98b", 300: "#f5ac5b", 400: "#e8902c", 500: "#d27908", 600: "#b46200", 700: "#944e00", 800: "#723901", 900: "#542802", 950: "#2f1100" },
  secondary: { 50: "#def9f1", 100: "#bcf2e1", 200: "#85e3c6", 300: "#51caa7", 400: "#1ab28c", 500: "#009873", 600: "#007e5d", 700: "#006349", 800: "#004a36", 900: "#003526", 950: "#001c12" },
};

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: palette,
    },
  },
  plugins: [],
}
