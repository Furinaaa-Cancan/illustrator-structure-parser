import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Paths (resolve from server directory)
  uploadDir: resolve(__dirname, '../../uploads'),
  outputDir: resolve(__dirname, '../../../output'),  // 项目根目录的 output
  scriptPath: resolve(__dirname, '../../../AI_Template_Parser_v3.jsx'),
  staticDir: resolve(__dirname, '../../client/dist'),

  // Upload settings
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600', 10),
  allowedExtensions: ['.ai'] as const,
};
