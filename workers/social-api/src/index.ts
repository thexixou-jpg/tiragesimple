import { providerStatus } from './providers';
import type { Env } from './types';
import { getYouTubePublication } from './youtube';

const json = (body: unknown, status = 200, origin = 'https://tiragesimple.fr'): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': origin, 'vary': 'Origin' } });

function allowOrigin(request: Request, env: Env): string {
  const origin = request.headers.get('Origin');
  return origin === (env.ALLOWED_ORIGIN ?? 'https://tiragesimple.fr') ? origin : (env.ALLOWED_ORIGIN ?? 'https://tiragesimple.fr');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowOrigin(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/v1/providers') return json({ providers: providerStatus(env) }, 200, origin);
    if (request.method === 'POST' && url.pathname === '/v1/youtube/publication') {
      try {
        const input = await request.json() as { url?: string };
        if (!input.url) return json({ error: 'A YouTube URL is required' }, 400, origin);
        return json({ publication: await getYouTubePublication(input.url, env) }, 200, origin);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Unable to load the YouTube publication' }, 400, origin);
      }
    }
    return json({ error: 'Not found' }, 404, origin);
  },
} satisfies ExportedHandler<Env>;
