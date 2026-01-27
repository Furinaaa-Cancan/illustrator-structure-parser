import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    io: {
      ensureDir: (dir: string) => Promise<void>;
      writeFile: (path: string, data: Buffer | string) => Promise<void>;
      readFile: (path: string, encoding?: BufferEncoding) => Promise<string>;
      matchFiles: (pattern: string) => string[];
    };
  }

  interface FastifyReply {
    sendFile: (path: string) => FastifyReply;
  }
}
