import type { SupportedLocale } from './locale.js';

declare module 'fastify' {
  interface FastifyRequest {
    locale: SupportedLocale;
  }
}
export {};