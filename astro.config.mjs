// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Muda para o domínio final quando existir (usado na imagem de partilha).
  site: 'https://casamento-aminah-luis.virtusprompt.workers.dev',
  // As imagens já estão otimizadas em public/img; não precisamos de Cloudflare Images.
  // O login do dashboard usa um cookie próprio; não precisamos de sessões em KV.
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
});
