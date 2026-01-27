import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createReadStream, existsSync, readdirSync } from 'fs';
import { join, extname, basename } from 'path';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import { config } from '../config.js';
import { runIllustratorScript } from '../services/illustrator.js';

interface UploadBody {
  file: unknown;
}

interface Variable {
  elementId: string;
  elementPath: string;
  variableKey: string;
  variableType: string;
  variableLabel: string;
  suggestedName: string;
  confidence: number;
  currentValue: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

// 从 elements 中提取变量（当 JSX 脚本没有生成 variable 字段时的后备方案）
function extractVariablesFromElements(elements: any[]): { variables: Variable[]; variableMap: Record<string, string>; totalVariables: number; byType: Record<string, Variable[]> } {
  const variables: Variable[] = [];
  const variableMap: Record<string, string> = {};
  const counters: Record<string, number> = {};

  for (const elem of elements) {
    if (!elem) continue;

    // 如果元素已有 variable 字段
    if (elem.variable && (elem.variable.isVariable || elem.variable.variableKey)) {
      const v = elem.variable;
      const varType = v.variableType || {};
      const varKey = v.variableKey || `${varType.key || 'unknown'}_${counters[varType.key] || 0}`;
      
      variables.push({
        elementId: elem.id,
        elementPath: elem.path || '',
        variableKey: varKey,
        variableType: varType.key || 'text',
        variableLabel: varType.label || '文本',
        suggestedName: v.suggestedName || '',
        confidence: v.confidence || 0.5,
        currentValue: v.originalContent || elem.content || elem.name || '',
        position: elem.position,
        size: elem.size
      });
      variableMap[varKey] = elem.id;
      continue;
    }

    // 检测文本元素
    if (elem.type === 'text' && elem.content) {
      const typeKey = detectTextType(elem.content);
      counters[typeKey] = (counters[typeKey] || 0) + 1;
      const varKey = `${typeKey}_${counters[typeKey]}`;
      
      variables.push({
        elementId: elem.id,
        elementPath: elem.path || '',
        variableKey: varKey,
        variableType: typeKey,
        variableLabel: getTypeLabel(typeKey),
        suggestedName: generateSuggestedName(typeKey, elem.content),
        confidence: 0.6,
        currentValue: elem.content,
        position: elem.position,
        size: elem.size
      });
      variableMap[varKey] = elem.id;
    }
    // 检测图片元素
    else if (elem.type === 'image_embedded' || elem.type === 'image_linked') {
      const typeKey = detectImageType(elem.size?.width || 0, elem.size?.height || 0);
      counters[typeKey] = (counters[typeKey] || 0) + 1;
      const varKey = `${typeKey}_${counters[typeKey]}`;
      
      variables.push({
        elementId: elem.id,
        elementPath: elem.path || '',
        variableKey: varKey,
        variableType: typeKey,
        variableLabel: getTypeLabel(typeKey),
        suggestedName: elem.name || `${typeKey}_${counters[typeKey]}`,
        confidence: 0.6,
        currentValue: elem.name || '',
        position: elem.position,
        size: elem.size
      });
      variableMap[varKey] = elem.id;
    }
    // 注意：不再为普通 path/compound_path 创建变量，因为它们通常不是可替换内容
    // 只有当形状有特定命名模式时才识别为变量
    else if ((elem.type === 'path' || elem.type === 'compound_path') && elem.name && /^(bg|背景|logo|图标|icon)/i.test(elem.name)) {
      const typeKey = detectShapeType(elem.size?.width || 0, elem.size?.height || 0, elem.name || '');
      counters[typeKey] = (counters[typeKey] || 0) + 1;
      const varKey = `${typeKey}_${counters[typeKey]}`;
      
      variables.push({
        elementId: elem.id,
        elementPath: elem.path || '',
        variableKey: varKey,
        variableType: typeKey,
        variableLabel: getTypeLabel(typeKey),
        suggestedName: elem.name || `${typeKey}_${counters[typeKey]}`,
        confidence: 0.5,
        currentValue: elem.name || '',
        position: elem.position,
        size: elem.size
      });
      variableMap[varKey] = elem.id;
    }
  }

  // 按类型分组
  const byType: Record<string, Variable[]> = {};
  for (const v of variables) {
    if (!byType[v.variableType]) byType[v.variableType] = [];
    byType[v.variableType].push(v);
  }

  return { variables, variableMap, totalVariables: variables.length, byType };
}

// 检测文本类型
function detectTextType(content: string): string {
  const trimmed = content.trim();
  
  // 日期检测
  if (/\d{4}[.\-\/年]\d{1,2}[.\-\/月]\d{1,2}/.test(trimmed)) return 'date';
  // 时间检测
  if (/\d{1,2}:\d{2}/.test(trimmed) && trimmed.length < 20) return 'time';
  // 电话检测
  if (/1[3-9]\d{9}/.test(trimmed)) return 'phone';
  // 活动标题（包含日程、流程相关词汇）
  if (/年会|大会|峰会|论坛|发布会|颁奖|典礼|晚宴|庆典|盛典|签到|参观|答疑|分享/.test(trimmed)) return 'event_title';
  // 口号
  if (/周年|之夜|荣耀|同行|共赢|携手|共创|第.*届/.test(trimmed) && trimmed.length <= 30) return 'slogan';
  // 职位（包含职位关键词）
  if (/创始人|CEO|CTO|总裁|董事|总监|经理|主任|教授|博士|会长|导师|校长/.test(trimmed)) return 'person_title';
  // 常见标题词汇（不是人名）
  const titleKeywords = /^(活动|流程|亮点|主持人|嘉宾|导师|主题|议程|日程|环节|单位|支持|承办|主办|赞助|协办)$/;
  if (titleKeywords.test(trimmed)) return 'text';
  // 人名（2-3个中文字符，且不包含常见非人名词汇）
  const notNamePatterns = /团队|联盟|系列|单位|导师|流程|亮点|主持|嘉宾|总部|活动|游学|增长|组织/;
  if (/^[\u4e00-\u9fa5]{2,3}$/.test(trimmed) && !notNamePatterns.test(trimmed)) return 'person_name';
  
  return 'text';
}

// 检测图片类型
function detectImageType(width: number, height: number): string {
  const ratio = width / (height || 1);
  
  // 头像（正方形，50-500px）
  if (ratio > 0.8 && ratio < 1.2 && width >= 50 && width <= 500) return 'avatar';
  // 二维码
  if (ratio > 0.95 && ratio < 1.05 && width >= 80 && width <= 300) return 'qrcode';
  // 横幅
  if (ratio > 2.5 && width > 400) return 'banner';
  // Logo
  if (width < 300 && height < 150) return 'logo';
  
  return 'image';
}

// 检测形状类型
function detectShapeType(width: number, height: number, name: string): string {
  const ratio = width / (height || 1);
  
  // 根据名称判断
  if (name && /bg|背景|background/i.test(name)) return 'bg_shape';
  if (name && /circle|圆|圈/i.test(name)) return 'circle';
  if (name && /line|线|分割/i.test(name)) return 'line';
  
  // 根据尺寸判断
  // 圆形（正方形）
  if (ratio > 0.9 && ratio < 1.1 && width < 200) return 'circle';
  // 分割线（极端比例）
  if (ratio > 10 || ratio < 0.1) return 'line';
  // 大面积背景
  if (width > 500 && height > 500) return 'bg_shape';
  
  return 'shape';
}

// 获取类型标签
function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    text: '文本', date: '日期', time: '时间', phone: '电话',
    event_title: '活动标题', slogan: '口号', person_title: '职位', person_name: '人名',
    avatar: '头像', qrcode: '二维码', banner: '横幅', logo: 'Logo', image: '图片',
    shape: '形状', bg_shape: '背景形状', circle: '圆形', line: '线条'
  };
  return labels[type] || type;
}

// 生成建议名称
function generateSuggestedName(type: string, content: string): string {
  const prefix = type === 'text' ? 'desc' : type;
  const shortContent = content.replace(/[\s\r\n]+/g, '').slice(0, 10);
  return `${prefix}_${shortContent}`;
}

export async function uploadRoutes(fastify: FastifyInstance): Promise<void> {
  // Upload file
  fastify.post('/api/upload', async (request: FastifyRequest<{ Body: UploadBody }>, reply: FastifyReply) => {
    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const filename = data.filename;
      const ext = extname(filename).toLowerCase();

      if (!(config.allowedExtensions as readonly string[]).includes(ext)) {
        return reply.status(400).send({ error: 'Only .ai files are allowed' });
      }

      const taskId = uuidv4().slice(0, 8);
      const taskDir = join(config.uploadDir, taskId);
      const outputDir = join(taskDir, 'output');

      // Ensure directories exist
      await fastify.io.ensureDir(taskDir);
      await fastify.io.ensureDir(outputDir);

      // Save file
      const filePath = join(taskDir, filename);
      const chunks: Buffer[] = [];

      for await (const chunk of data.file!) {
        chunks.push(chunk);
      }

      await fastify.io.writeFile(filePath, Buffer.concat(chunks));

      return reply.send({
        taskId,
        filename,
        status: 'uploaded',
        message: 'File uploaded successfully. Call /api/process to start parsing.'
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Upload failed' });
    }
  });

  // Process file
  fastify.post('/api/process/:taskId', async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    const { taskId } = request.params;
    const taskDir = join(config.uploadDir, taskId);

    if (!existsSync(taskDir)) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    // Find AI files
    const aiFiles = config.allowedExtensions.flatMap(ext =>
      fastify.io.matchFiles(`${taskDir}/*${ext}`)
    );

    if (aiFiles.length === 0) {
      return reply.status(404).send({ error: 'No AI file found' });
    }

    const aiFile = aiFiles[0];
    const outputDir = join(taskDir, 'output');

    try {
      const result = await runIllustratorScript(aiFile, outputDir);

      if (result.success) {
        return reply.send({
          taskId,
          status: 'completed',
          message: 'Parsing completed'
        });
      } else {
        fastify.log.error({ error: result.error }, 'Illustrator script failed');
        return reply.status(500).send({
          taskId,
          status: 'failed',
          error: result.error || 'Unknown error'
        });
      }
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        taskId,
        status: 'failed',
        error: String(error)
      });
    }
  });

  // Get result
  fastify.get('/api/result/:taskId', async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    const { taskId } = request.params;
    const outputDir = join(config.uploadDir, taskId, 'output');

    if (!existsSync(outputDir)) {
      return reply.status(404).send({ error: 'Result not found' });
    }

    const files = fastify.io.matchFiles(`${outputDir}/*.json`);
    const resultFiles: Record<string, unknown> = {};
    const result = { taskId, files: resultFiles };

    for (const file of files) {
      try {
        const content = await fastify.io.readFile(file, 'utf-8');
        const fileName = file.split('/').pop() || file;
        resultFiles[fileName.replace('.json', '')] = JSON.parse(content);
      } catch {
        // Skip unreadable files
      }
    }

    // 后处理：如果 variables 为空或过滤后为空（全是形状），从 structure.elements 中提取变量
    const variables = resultFiles.variables as any;
    const structure = resultFiles.structure as any;
    const excludeTypes = new Set(['shape', 'bg_shape', 'circle', 'line', 'path', 'compound_path']);
    const usableVars = variables?.variables?.filter((v: any) => !excludeTypes.has(v.variableType)) || [];
    
    if (usableVars.length === 0 && structure?.elements) {
      const extractedVars = extractVariablesFromElements(structure.elements);
      resultFiles.variables = extractedVars;
    }

    return reply.send(result);
  });

  // Get specific result file
  fastify.get('/api/result/:taskId/:filename', async (request: FastifyRequest<{ Params: { taskId: string; filename: string } }>, reply: FastifyReply) => {
    const { taskId, filename } = request.params;
    const outputDir = join(config.uploadDir, taskId, 'output');
    const filePath = join(outputDir, filename);

    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    // 根据文件扩展名设置Content-Type
    const ext = extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.html': 'text/html',
      '.css': 'text/css',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    reply.header('Content-Type', contentType);
    return reply.send(createReadStream(filePath));
  });

  // Download all as ZIP
  fastify.get('/api/download/:taskId', async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    const { taskId } = request.params;
    const outputDir = join(config.uploadDir, taskId, 'output');

    if (!existsSync(outputDir)) {
      return reply.status(404).send({ error: 'Result not found' });
    }

    // 设置响应头
    reply.raw.setHeader('Content-Type', 'application/zip');
    reply.raw.setHeader('Content-Disposition', `attachment; filename="parsing_result_${taskId}.zip"`);

    // 创建 ZIP 归档
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', (err) => {
      fastify.log.error(err);
      reply.raw.end();
    });

    // 将归档流导入响应
    archive.pipe(reply.raw);

    // 添加 output 目录中的所有文件
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

    // 完成归档
    await archive.finalize();
    return reply;
  });

  // Get status
  fastify.get('/api/status/:taskId', async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    const { taskId } = request.params;
    const outputDir = join(config.uploadDir, taskId, 'output');
    const structureFile = join(outputDir, 'structure.json');

    if (existsSync(structureFile)) {
      return reply.send({ status: 'completed' });
    }

    return reply.send({ status: 'processing' });
  });

  // Batch generate - 批量生成
  fastify.post('/api/batch-generate', async (request: FastifyRequest<{
    Body: {
      taskId: string;
      mapping: Record<string, string>;
      data: Array<Record<string, string>>;
    }
  }>, reply: FastifyReply) => {
    const { taskId, mapping, data } = request.body;
    
    // 本地模式使用 output 目录
    const isLocal = taskId === 'local';
    const taskDir = isLocal ? config.outputDir : join(config.uploadDir, taskId);

    if (!existsSync(taskDir)) {
      return reply.status(404).send({ error: 'Task not found' });
    }

    // 找到原始 AI 文件
    let aiFile: string = '';
    if (isLocal) {
      // 本地模式：从 structure.json 读取源文件路径
      const structurePath = join(taskDir, 'structure.json');
      if (existsSync(structurePath)) {
        const structure = JSON.parse(await fastify.io.readFile(structurePath));
        // 优先使用 sourceFile，否则从 document.path + document.name 构造
        if (structure.sourceFile && existsSync(structure.sourceFile)) {
          aiFile = structure.sourceFile;
        } else if (structure.document?.path && structure.document?.name) {
          // document.path 可能是目录，尝试拼接文件名
          const possiblePath = join(structure.document.path, structure.document.name);
          if (existsSync(possiblePath)) {
            aiFile = possiblePath;
          } else {
            // 直接在 document.path 目录下查找 AI 文件
            const searchDir = structure.document.path;
            if (existsSync(searchDir)) {
              const aiFiles = config.allowedExtensions.flatMap(ext =>
                fastify.io.matchFiles(`${searchDir}/*${ext}`)
              );
              if (aiFiles.length > 0) {
                aiFile = aiFiles[0];
              }
            }
          }
        }
      } else {
        return reply.status(404).send({ error: 'No structure.json found' });
      }
    } else {
      const aiFiles = config.allowedExtensions.flatMap(ext =>
        fastify.io.matchFiles(`${taskDir}/*${ext}`)
      );
      if (aiFiles.length === 0) {
        return reply.status(404).send({ error: 'No AI file found' });
      }
      aiFile = aiFiles[0];
    }

    if (!aiFile || !existsSync(aiFile)) {
      return reply.status(404).send({ error: 'AI file not found. Please ensure the original .ai file is accessible.' });
    }

    const batchDir = join(taskDir, 'batch_output');
    await fastify.io.ensureDir(batchDir);

    // 生成批量替换配置文件
    const batchConfig = {
      sourceFile: aiFile,
      outputDir: batchDir,
      mapping,
      data,
      timestamp: new Date().toISOString()
    };

    const configPath = join(taskDir, 'batch_config.json');
    await fastify.io.writeFile(configPath, JSON.stringify(batchConfig, null, 2));

    // 调用批量替换脚本
    try {
      const result = await runBatchReplace(aiFile, batchDir, mapping, data);
      
      return reply.send({
        success: result.success,
        failed: result.failed,
        files: result.files,
        message: `成功生成 ${result.success} 份文件`
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: 0,
        failed: data.length,
        files: [],
        error: String(error)
      });
    }
  });

  // 下载批量生成结果
  fastify.get('/api/batch-download/:taskId', async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    const { taskId } = request.params;
    // 本地模式使用 output 目录
    const isLocal = taskId === 'local';
    const batchDir = isLocal 
      ? join(config.outputDir, 'batch_output')
      : join(config.uploadDir, taskId, 'batch_output');

    if (!existsSync(batchDir)) {
      return reply.status(404).send({ error: 'Batch result not found' });
    }

    reply.raw.setHeader('Content-Type', 'application/zip');
    reply.raw.setHeader('Content-Disposition', `attachment; filename="batch_result_${taskId}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      fastify.log.error(err);
      reply.raw.end();
    });

    archive.pipe(reply.raw);

    try {
      const files = readdirSync(batchDir);
      for (const file of files) {
        const filePath = join(batchDir, file);
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
}

// 批量替换函数
async function runBatchReplace(
  sourceFile: string,
  outputDir: string,
  mapping: Record<string, string>,
  data: Array<Record<string, string>>
): Promise<{ success: number; failed: number; files: string[] }> {
  const { execSync } = await import('child_process');
  const { writeFileSync, readFileSync, existsSync: fsExistsSync, readdirSync: fsReaddirSync } = await import('fs');
  const { join: pathJoin, dirname } = await import('path');
  
  const files: string[] = [];
  let success = 0;
  let failed = 0;

  // 获取项目根目录（从 config.scriptPath 推导）
  const projectRoot = dirname(config.scriptPath);
  const batchReplacerScript = pathJoin(projectRoot, 'lib', 'batch_replacer.jsx');

  // 读取 variables.json 获取完整变量信息
  const variablesPath = pathJoin(config.outputDir, 'variables.json');
  let variableMap: Record<string, {elementPath: string; currentValue: string}> = {};
  if (fsExistsSync(variablesPath)) {
    try {
      const variablesData = JSON.parse(readFileSync(variablesPath, 'utf-8'));
      if (variablesData.variables) {
        for (const v of variablesData.variables) {
          if (v.variableKey) {
            variableMap[v.variableKey] = {
              elementPath: v.elementPath || '',
              currentValue: v.currentValue || ''
            };
          }
        }
      }
      console.log('[DEBUG] variableMap keys:', Object.keys(variableMap).slice(0, 10));
    } catch (e) {
      console.error('Failed to parse variables.json:', e);
    }
  } else {
    console.error('[DEBUG] variables.json not found at:', variablesPath);
  }

  console.log('[DEBUG] Received mapping:', JSON.stringify(mapping));

  // 为每行数据生成替换配置并调用 Illustrator
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const outputName = `output_${String(i + 1).padStart(3, '0')}`;
    
    // 构建替换数据，包含 elementPath 和 currentValue（用于匹配）
    const replacements: Array<{varKey: string; elementPath: string; currentValue: string; newValue: string}> = [];
    for (const [varKey, csvColumn] of Object.entries(mapping)) {
      if (csvColumn && row[csvColumn] !== undefined) {
        const varInfo = variableMap[varKey] || {elementPath: '', currentValue: ''};
        console.log(`[DEBUG] varKey=${varKey}, currentValue=${varInfo.currentValue.substring(0,20)}, newValue=${row[csvColumn]}`);
        replacements.push({
          varKey,
          elementPath: varInfo.elementPath,
          currentValue: varInfo.currentValue,
          newValue: row[csvColumn]
        });
      }
    }

    // 创建临时替换配置文件
    const replaceConfig = {
      sourceFile,
      outputDir,
      outputName,
      replacements,
      exportFormats: ['ai']  // 导出为 AI 格式
    };

    const configFile = pathJoin(outputDir, `config_${i}.json`);
    writeFileSync(configFile, JSON.stringify(replaceConfig, null, 2));

    try {
      // 创建临时 JSX 脚本文件，避免 AppleScript 引号嵌套问题
      const tempJsxPath = pathJoin(outputDir, `runner_${i}.jsx`);
      const jsxContent = `#include "${batchReplacerScript}"\nBatchReplacer.runFromConfig("${configFile}");`;
      writeFileSync(tempJsxPath, jsxContent);
      
      // 使用 do javascript file 方式调用
      const appleScript = `tell application "Adobe Illustrator" to do javascript file "${tempJsxPath}"`;
      
      execSync(`osascript -e '${appleScript}'`, { timeout: 120000 });
      
      // 检查输出文件是否生成
      const expectedAi = pathJoin(outputDir, `${outputName}.ai`);
      if (fsExistsSync(expectedAi)) {
        files.push(`${outputName}.ai`);
        success++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`Failed to process row ${i + 1}:`, err);
      failed++;
    }
  }

  return { success, failed, files };
}
