import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync, readdirSync, lstatSync } from 'fs';
import { join, basename, dirname } from 'path';
import { config } from '../config.js';
import { v4 as uuidv4 } from 'uuid';

const execPromise = promisify(exec);

// 使用 ImageMagick 生成 AI 文件预览图
async function generatePreviewImage(aiFilePath: string, outputPath: string): Promise<boolean> {
  try {
    // 使用 magick 命令（ImageMagick 7）将 AI 文件转换为 PNG
    // 不缩放，保持原始尺寸以确保坐标系统一致
    // 使用 -density 72 确保正确的 DPI
    const cmd = `magick -density 72 "${aiFilePath}[0]" -background white -flatten "${outputPath}"`;
    await execPromise(cmd, { timeout: 60000 });
    return existsSync(outputPath);
  } catch (error) {
    console.error('Failed to generate preview image:', error);
    return false;
  }
}

export interface IllustratorResult {
  success: boolean;
  output?: string;
  error?: string;
}

export async function runIllustratorScript(
  aiFilePath: string,
  outputDir: string
): Promise<IllustratorResult> {
  const taskId = uuidv4();
  const tempDir = join(config.uploadDir, `temp_${taskId}`);

  try {
    // Create temp directory
    mkdirSync(tempDir, { recursive: true });

    // Copy lib folder to temp directory
    const libSource = join(dirname(config.scriptPath), 'lib');
    if (existsSync(libSource)) {
      copyDirRecursive(libSource, join(tempDir, 'lib'));
    }

    // Copy main script
    const scriptName = basename(config.scriptPath);
    const originalScript = readFileSync(config.scriptPath, 'utf-8');
    writeFileSync(join(tempDir, scriptName), originalScript, 'utf-8');

    // Prepare paths
    const aiFileAbs = aiFilePath.replace(/\\/g, '/');
    const outputDirAbs = outputDir.replace(/\\/g, '/');

    // Create runner script - 需要先include主脚本
    const tempScriptPath = join(tempDir, scriptName).replace(/\\/g, '/');
    const runnerCode = `
// Auto-runner script - Web service call
#target illustrator
#include "${tempScriptPath}"

(function() {
    var targetFile = new File("${aiFileAbs}");
    var outputDir = "${outputDirAbs}/";

    // 先修改CONFIG
    if (typeof CONFIG !== "undefined") {
        CONFIG.projectPath = outputDir;
        CONFIG.outputDir = "";
    }

    if (targetFile.exists) {
        app.open(targetFile);
        $.sleep(500);

        if (typeof main === "function") {
            main();
        }

        if (app.documents.length > 0) {
            app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
        }
    } else {
        alert("File not found: " + targetFile.fsName);
    }
})();
`;

    const runnerScriptName = scriptName.replace('.jsx', '_runner.jsx');
    writeFileSync(join(tempDir, runnerScriptName), runnerCode, 'utf-8');

    if (process.platform === 'darwin') {
      const runnerPath = join(tempDir, runnerScriptName).replace(/\\/g, '/');
      const applescript = `
        tell application "Adobe Illustrator"
          activate
          do javascript file "${runnerPath}"
        end tell
      `;

      const { stderr, stdout } = await execPromise(
        `osascript -e '${applescript}'`,
        { timeout: 300000 }
      );

      if (stderr && !stdout) {
        // 检测 Illustrator 是否未安装或未运行
        if (stderr.includes('Adobe Illustrator') && (stderr.includes('not found') || stderr.includes('找不到'))) {
          return { success: false, error: 'Adobe Illustrator 未安装或无法启动，请确保已安装 Adobe Illustrator' };
        }
        if (stderr.includes('execution error') || stderr.includes('AppleEvent timed out')) {
          return { success: false, error: 'Adobe Illustrator 未响应，请确保 Illustrator 已启动并可正常运行' };
        }
        return { success: false, error: stderr };
      }
    } else if (process.platform === 'win32') {
      return { success: false, error: 'Windows not yet implemented' };
    } else {
      return { success: false, error: `Unsupported platform: ${process.platform}` };
    }

    // Check if output was generated
    const structureFile = join(outputDir, 'structure.json');
    if (existsSync(structureFile)) {
      // 自动生成预览图（如果脚本没有生成）
      const previewFile = join(outputDir, 'preview.png');
      if (!existsSync(previewFile)) {
        await generatePreviewImage(aiFilePath, previewFile);
      }
      return { success: true, output: outputDir };
    } else {
      return { success: false, error: 'Parse completed but no output files generated' };
    }
  } catch (error) {
    return { success: false, error: String(error) };
  } finally {
    // Cleanup temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

function copyDirRecursive(source: string, target: string) {
  if (!existsSync(source)) return;

  mkdirSync(target, { recursive: true });

  const entries = readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath);
    } else if (entry.isFile()) {
      try {
        copyFileSync(sourcePath, targetPath);
      } catch (e) {
        // Skip problematic files
      }
    }
  }
}
