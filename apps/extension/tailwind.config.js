/** @type {import('tailwindcss').Config} */
export default {
  presets: [
    require('../../packages/app/tailwind.config.cjs')
  ],
  content: [
    "./entrypoints/**/*.{html,js,ts,jsx,tsx}",
    "../../packages/app/src/**/*.{js,ts,jsx,tsx}"
  ],
  plugins: [],
}
