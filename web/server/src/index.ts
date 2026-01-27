import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fg from 'fast-glob';
import archiver from 'archiver';
import { readdirSync } from 'fs';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { config } from './config.js';
import { uploadRoutes } from './routes/upload.js';

async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === 'development' ? 'info' : 'warn'
    }
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: config.maxFileSize
    }
  });

  // Add file system helpers
  fastify.decorate('io', {
    ensureDir: async (dir: string) => {
      const { mkdir } = await import('fs/promises');
      await mkdir(dir, { recursive: true });
    },
    writeFile: async (path: string, data: Buffer | string) => {
      const { writeFile } = await import('fs/promises');
      await writeFile(path, data);
    },
    readFile: async (path: string, encoding?: BufferEncoding) => {
      const { readFile } = await import('fs/promises');
      return readFile(path, encoding || 'utf-8');
    },
    matchFiles: (pattern: string): string[] => {
      return fg.sync(pattern);
    }
  });

  // Register routes
  await fastify.register(uploadRoutes);

  // Health check
  fastify.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // 提供本地 output 目录的文件（用于直接在 Illustrator 中运行脚本的情况）
  const localOutputDir = join(dirname(config.scriptPath), 'output');
  if (existsSync(localOutputDir)) {
    await fastify.register(fastifyStatic, {
      root: localOutputDir,
      prefix: '/api/local-output/',
      decorateReply: false, // 避免重复装饰
    });
  }

  // 获取历史任务列表
  fastify.get('/api/history', async (request, reply) => {
    const uploadsDir = config.uploadDir;
    if (!existsSync(uploadsDir)) {
      return reply.send({ tasks: [] });
    }

    const tasks: Array<{
      taskId: string;
      fileName: string;
      parsedAt: string;
      variableCount: number;
      elementCount: number;
    }> = [];

    const dirs = readdirSync(uploadsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('temp_'));

    for (const dir of dirs) {
      const taskDir = join(uploadsDir, dir.name);
      const outputDir = join(taskDir, 'output');
      const structureFile = join(outputDir, 'structure.json');
      const variablesFile = join(outputDir, 'variables.json');

      if (!existsSync(structureFile)) continue;

      try {
        const { statSync, readFileSync } = await import('fs');
        const stat = statSync(structureFile);
        const structure = JSON.parse(readFileSync(structureFile, 'utf-8'));
        
        // 从任务目录查找原始 .ai 文件名
        let fileName = 'Unknown';
        const taskFiles = readdirSync(taskDir);
        const aiFile = taskFiles.find(f => f.endsWith('.ai'));
        if (aiFile) {
          fileName = aiFile;
        } else if (structure?.document?.fileName) {
          fileName = structure.document.fileName;
        }
        
        // 计算可用变量数量（排除形状类型）
        const excludeTypes = new Set(['shape', 'bg_shape', 'circle', 'line', 'path', 'compound_path']);
        let variableCount = 0;
        
        if (existsSync(variablesFile)) {
          const variables = JSON.parse(readFileSync(variablesFile, 'utf-8'));
          const varsArr = variables?.variables || [];
          // 过滤掉形状类型
          const usableVars = varsArr.filter((v: any) => !excludeTypes.has(v.variableType));
          
          if (usableVars.length > 0) {
            variableCount = usableVars.length;
          } else if (structure?.elements) {
            // 如果过滤后为空，从 elements 计算文本和图片数量
            const textCount = structure.elements.filter((e: any) => e.type === 'text' && e.content).length;
            const imgCount = structure.elements.filter((e: any) => e.type === 'image_embedded' || e.type === 'image_linked').length;
            variableCount = textCount + imgCount;
          }
        }

        tasks.push({
          taskId: dir.name,
          fileName,
          parsedAt: stat.mtime.toISOString(),
          variableCount,
          elementCount: structure?.elements?.length || 0
        });
      } catch { /* skip */ }
    }

    // 按解析时间降序排序
    tasks.sort((a, b) => new Date(b.parsedAt).getTime() - new Date(a.parsedAt).getTime());

    return reply.send({ tasks: tasks.slice(0, 20) }); // 只返回最近20条
  });

  // 获取本地 output 目录的解析结果
  fastify.get('/api/local-result', async (request, reply) => {
    const outputDir = join(dirname(config.scriptPath), 'output');
    const structureFile = join(outputDir, 'structure.json');
    
    if (!existsSync(structureFile)) {
      return reply.status(404).send({ error: 'No local result found' });
    }

    const files: Record<string, unknown> = {};
    const jsonFiles = fg.sync(`${outputDir}/*.json`);
    
    for (const file of jsonFiles) {
      try {
        const content = await fastify.io.readFile(file, 'utf-8');
        const fileName = file.split('/').pop() || file;
        files[fileName.replace('.json', '')] = JSON.parse(content);
      } catch { /* skip */ }
    }

    return reply.send({ taskId: 'local', files });
  });

  // 本地预览图
  fastify.get('/api/local-preview', async (request, reply) => {
    const outputDir = join(dirname(config.scriptPath), 'output');
    const previewPath = join(outputDir, 'preview.png');
    
    if (!existsSync(previewPath)) {
      return reply.status(404).send({ error: 'Preview not found' });
    }
    
    const { readFileSync } = await import('fs');
    const content = readFileSync(previewPath);
    reply.type('image/png').send(content);
  });

  // 本地 output 文件访问
  fastify.get('/api/local-output/:filename', async (request: any, reply) => {
    const { filename } = request.params;
    const outputDir = join(dirname(config.scriptPath), 'output');
    const filePath = join(outputDir, filename);
    
    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: 'File not found' });
    }
    
    const { readFileSync } = await import('fs');
    const content = readFileSync(filePath);
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'svg': 'image/svg+xml',
      'json': 'application/json',
      'html': 'text/html',
      'css': 'text/css'
    };
    reply.type(mimeTypes[ext || ''] || 'application/octet-stream').send(content);
  });

  // 上传任务预览图
  fastify.get('/api/preview/:taskId', async (request: any, reply) => {
    const { taskId } = request.params;
    const taskDir = join(config.uploadDir, taskId, 'output');
    const previewPath = join(taskDir, 'preview.png');
    
    if (!existsSync(previewPath)) {
      return reply.status(404).send({ error: 'Preview not found' });
    }
    
    const { readFileSync } = await import('fs');
    const content = readFileSync(previewPath);
    reply.type('image/png').send(content);
  });

  // 下载本地 output 目录的 ZIP
  fastify.get('/api/download/local', async (request, reply) => {
    const outputDir = join(dirname(config.scriptPath), 'output');
    
    if (!existsSync(outputDir)) {
      return reply.status(404).send({ error: 'No local result found' });
    }

    reply.raw.setHeader('Content-Type', 'application/zip');
    reply.raw.setHeader('Content-Disposition', 'attachment; filename="parsing_result_local.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      fastify.log.error(err);
      reply.raw.end();
    });

    archive.pipe(reply.raw);

    try {
      const files = readdirSync(outputDir);
      for (const file of files) {
        const filePath = join(outputDir, file);
        if (existsSync(filePath)) {
          archive.file(filePath, { name: file });
        }
      }
    } catch (err) {
      fastify.log.error(err);
    }

    await archive.finalize();
    return reply;
  });

  // Serve static files (client build)
  const clientDistPath = join(config.staticDir);
  if (existsSync(clientDistPath)) {
    await fastify.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
    });

    // SPA fallback: serve index.html for non-API routes
    fastify.setNotFoundHandler((request, reply) => {
      if (!request.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'Not Found' });
    });
  }

  return fastify;
}

async function start() {
  try {
    const fastify = await buildApp();

    await fastify.listen({
      port: config.port,
      host: config.host
    });

    console.log('='.repeat(60));
    console.log('  AI Template Parser Server');
    console.log('='.repeat(60));
    console.log(`  Environment: ${config.nodeEnv}`);
    console.log(`  Upload Dir: ${config.uploadDir}`);
    console.log(`  Script Path: ${config.scriptPath}`);
    console.log(`  Server: http://${config.host}:${config.port}`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
