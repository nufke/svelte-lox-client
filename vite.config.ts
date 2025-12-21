import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
		sveltekit(),
		nodePolyfills({
      include: [
        'buffer',
        'crypto',
        'stream',
        'util',
        'vm'
      ],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      }
    })
	]
});
