// ╔═══════════════════════════════╗
// ║   prose-ai — vite config      ║
// ╚═══════════════════════════════╝

import { existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

let originalCssSize = 0;

const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const blue   = (s) => `\x1b[34m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const purple = (s) => `\x1b[35m${s}\x1b[0m`;

export default {
	server: {
		port: 5173,
		open: true,
	},
	build: {
		outDir: 'dist',
		sourcemap: true,
	},
	plugins: [
		{
			// vite runs the postcss pipeline silently unless it errors —
			// announce it in dev and report the build result like any
			// other build step. size lives in module scope: rolldown gives
			// each hook a fresh `this` context, unlike rollup
			name: 'log-postcss',
			configureServer() {
				console.log(`${cyan('[PostCSS]')} ${green('✓')} ${blue('tailwindcss')} ${green('✓')} ${blue('cssnano')} ${purple('(preset: advanced)')} watching ${green('src/css/style.css')}`);
			},
			buildStart() {
				const srcCssPath = path.resolve('./src/css', 'style.css');
				if (existsSync(srcCssPath)) {
					originalCssSize = statSync(srcCssPath).size;
				}
			},
			closeBundle() {
				const distAssets = path.resolve('./dist/assets');
				if (!existsSync(distAssets)) return;
				const cssFile = readdirSync(distAssets).find(f => f.endsWith('.css'));
				if (!cssFile) return;
				const minified = statSync(path.join(distAssets, cssFile)).size;
				const savings = ((1 - minified / originalCssSize) * 100).toFixed(1);
				console.log(`\n${cyan('[PostCSS]')} Building stylesheet\n${green('✓')} ${blue('tailwindcss')}\n${green('✓')} ${blue('cssnano')} ${purple('(preset: advanced)')}`);
				console.log(`dist/assets/${green(cssFile)}: ${yellow((originalCssSize / 1024).toFixed(2) + 'kb')} → ${green((minified / 1024).toFixed(2) + 'kb')} (${cyan(savings + '% reduction')})\n`);
			},
		},
	],
};
