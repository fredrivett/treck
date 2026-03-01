import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	site: "https://treck.dev",
	vite: {
		plugins: [tailwindcss()],
	},
});
