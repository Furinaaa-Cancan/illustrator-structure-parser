/**
 * AI 模板结构解析器 v3.0 - 主入口
 * SOTA 级别 - 全面解析 + 留一法分析
 * 
 * 功能特性：
 * 1. 稳定UUID生成（基于内容哈希）
 * 2. 坐标系统标准化
 * 3. 完整变换矩阵解析
 * 4. 多样式文本支持
 * 5. 完整颜色信息（含CMYK转RGB）
 * 6. 语义分析与智能分类
 * 7. 留一法(LOO)视觉影响分析
 * 8. 流式JSON写入
 * 
 * 兼容性：Adobe Illustrator CS6 (v16) 及以上版本
 * 测试版本：CC 2019-2025 (Mac/Win)
 * 
 * @author AI Template Parser Team
 * @version 3.0.0
 * @license MIT
 */

//@target illustrator
app.preferences.setBooleanPreference('ShowExternalJSXWarning', false);

// ===== 环境检测 =====
var ENV = {
    isMac: /mac/i.test($.os),
    isWin: /windows/i.test($.os),
    aiVersion: parseInt(app.version, 10),
    aiFullVersion: app.version,
    pathSep: /mac/i.test($.os) ? "/" : "\\",
    minVersion: 16  // CS6
};

// ===== 预估元素数量 =====
function estimateElementCount(doc) {
    var count = 0;
    try {
        for (var i = 0; i < doc.layers.length; i++) {
            count += doc.layers[i].pageItems.length;
        }
    } catch (e) {
        count = 100; // 默认估计
    }
    return Math.max(count, 10);
}

// ===== 版本兼容性检查 =====
function checkEnvironment() {
    if (ENV.aiVersion < ENV.minVersion) {
        alert("错误：需要 Adobe Illustrator CS6 (v16) 或更高版本\n" +
              "当前版本：" + ENV.aiFullVersion);
        return false;
    }
    if (app.documents.length === 0) {
        alert("请先打开一个 AI 文档！");
        return false;
    }
    return true;
}

// ===== 加载模块 =====
#include "lib/config.jsx"
#include "lib/utils.jsx"
#include "lib/error_handler.jsx"
#include "lib/parsers.jsx"
#include "lib/loo_analyzer.jsx"
#include "lib/html_generator.jsx"
#include "lib/progress_ui.jsx"
#include "lib/test_framework.jsx"
#include "lib/variable_detector_v2.jsx"
#include "lib/pattern_matcher.jsx"
#include "lib/batch_replacer.jsx"
#include "lib/data_validator.jsx"

// ===== 全局状态 =====
var STATE = {
    counters: {},
    errors: [],
    warnings: [],
    startTime: null,
    totalProcessed: 0
};

// ===== 主函数 =====
function main() {
    // 环境检查
    if (!checkEnvironment()) return;
    
    // 显示配置对话框（可选）
    // if (ConfigDialog.show() !== 1) return;
    
    STATE.startTime = new Date();
    var doc = app.activeDocument;
    
    // 初始化错误处理器
    ErrorHandler.init();
    
    // 初始化超时控制器
    TimeoutController.start(CONFIG.performance.maxDuration || 300000);
    
    // 预估元素数量并初始化进度
    var estimatedTotal = estimateElementCount(doc);
    ProgressTracker.init(estimatedTotal);
    
    // 显示进度对话框
    ProgressDialog.create("AI 模板解析器 v3.0", estimatedTotal);
    ProgressDialog.setPhase("初始化");
    
    // 初始化
    IdGenerator.reset();
    CoordinateSystem.init(doc, CONFIG);
    
    // 确保输出目录存在
    var outputResult = ErrorHandler.safeExecute(
        function() { return FileUtils.ensureDir(CONFIG.projectPath + CONFIG.outputDir); },
        ErrorCodes.E102_NO_WRITE_PERMISSION,
        { path: CONFIG.projectPath + CONFIG.outputDir }
    );
    if (!outputResult.success) {
        ProgressDialog.showError("无法创建输出目录");
        return;
    }
    
    ProgressDialog.setPhase("提取文档信息");
    
    // 构建结构对象
    var structure = {
        meta: {
            version: "3.0.0",
            generator: "AI Template Parser SOTA",
            exportTime: new Date().toISOString(),
            environment: {
                aiVersion: ENV.aiFullVersion,
                platform: ENV.isMac ? "macOS" : "Windows",
                scriptPath: $.fileName
            },
            config: {
                coordinates: CONFIG.coordinates,
                parseOptions: CONFIG.parse,
                prefixes: PrefixParser.getAllPrefixes()
            }
        },
        
        document: extractDocumentInfo(doc),
        layers: [],
        elements: [],
        tree: [],
        statistics: null,
        looAnalysis: null
    };
    
    ProgressDialog.setPhase("遍历图层");
    
    // 遍历图层
    for (var l = 0; l < doc.layers.length; l++) {
        // 检查取消和超时
        if (ProgressDialog.isCancelled()) {
            ProgressDialog.close();
            alert("用户取消操作");
            return;
        }
        if (TimeoutController.check()) {
            ErrorHandler.handle(ErrorCodes.E500_TIMEOUT, { phase: "图层遍历" });
            break;
        }
        
        var layer = doc.layers[l];
        
        // 图层信息
        var layerInfo = {
            index: l,
            name: layer.name,
            visible: layer.visible,
            locked: layer.locked,
            printable: layer.printable,
            preview: layer.preview,
            dimPlacedImages: layer.dimPlacedImages,
            color: getLayerColor(layer),
            hasSubLayers: layer.layers.length > 0,
            subLayerCount: layer.layers.length,
            itemCount: layer.pageItems.length
        };
        structure.layers.push(layerInfo);
        
        // 图层树节点
        var layerTree = {
            type: "layer",
            name: layer.name,
            index: l,
            children: []
        };
        
        // 递归遍历元素
        ProgressDialog.setPhase("解析图层: " + layer.name);
        
        traverseItems(layer.pageItems, structure.elements, layerTree.children, {
            layerName: layer.name,
            layerIndex: l,
            parentPath: "",
            parentId: null,
            depth: 0
        });
        
        structure.tree.push(layerTree);
        
        // 定期GC
        if (l % 5 === 0) $.gc();
    }
    
    ProgressDialog.setPhase("生成统计");
    
    // 生成统计
    structure.statistics = generateStatistics(structure);
    
    // 添加错误处理器统计
    var errorSummary = ErrorHandler.getSummary();
    structure.statistics.errorDetails = errorSummary;
    
    // 留一法分析
    if (CONFIG.loo.enabled) {
        ProgressDialog.setPhase("LOO 分析");
        structure.looAnalysis = LOOAnalyzer.init(doc, CONFIG).analyze(structure.elements);
    }
    
    // 变量检测（自动识别可替换元素）
    ProgressDialog.setPhase("变量检测");
    AuditLogger.startTimer("变量检测");
    
    try {
        structure.variableAnalysis = VariableDetectorV2.processElements(structure.elements);
        structure.variableTemplate = VariableDetectorV2.generateTemplate(structure.variableAnalysis.variables);
        AuditLogger.info("variable", "检测到 " + structure.variableAnalysis.totalVariables + " 个变量");
    } catch (e) {
        AuditLogger.warn("variable", "变量检测失败: " + e.message);
        structure.variableAnalysis = { variables: [], totalVariables: 0 };
    }
    
    AuditLogger.endTimer("变量检测");
    
    // 模式匹配（识别复合模式）
    ProgressDialog.setPhase("模式匹配");
    AuditLogger.startTimer("模式匹配");
    
    try {
        structure.patternAnalysis = PatternMatcher.matchAll(structure.elements);
        if (structure.patternAnalysis.patterns.length > 0) {
            structure.patternVariables = PatternMatcher.generatePatternVariableIds(structure.patternAnalysis.patterns);
            AuditLogger.info("pattern", "识别到 " + structure.patternAnalysis.patterns.length + " 个复合模式");
        }
    } catch (e) {
        AuditLogger.warn("pattern", "模式匹配失败: " + e.message);
        structure.patternAnalysis = { patterns: [], summary: { totalPatterns: 0, byType: {}, byCategory: {} } };
    }
    
    AuditLogger.endTimer("模式匹配");
    
    // 数据完整性检查
    ProgressDialog.setPhase("完整性检查");
    AuditLogger.startTimer("完整性检查");
    structure.integrityCheck = IntegrityChecker.runAll(structure);
    structure.validationReport = DataValidator.validateStructure(structure);
    AuditLogger.endTimer("完整性检查");
    
    if (!structure.validationReport.valid) {
        AuditLogger.error("validation", "结构验证失败", structure.validationReport.errors);
    }
    
    // HTML/CSS 生成
    if (CONFIG.html && CONFIG.html.enabled) {
        ProgressDialog.setPhase("HTML/CSS 生成");
        structure.htmlOutput = HtmlGenerator.init(doc).generate(structure.elements, CONFIG.html);
    }
    
    // 导出预览图 (PNG + SVG)
    ProgressDialog.setPhase("导出预览图");
    try {
        var previewPath = exportPreviewImage(doc);
        if (previewPath) {
            structure.previewImage = previewPath;
            AuditLogger.info("preview", "PNG预览图已导出: " + previewPath);
        }
        
        var svgPath = exportPreviewSVG(doc);
        if (svgPath) {
            structure.previewSVG = svgPath;
            AuditLogger.info("preview", "SVG预览图已导出: " + svgPath);
        }
    } catch (e) {
        AuditLogger.warn("preview", "预览图导出失败: " + e.message);
    }
    
    ProgressDialog.setPhase("保存结果");
    
    // 保存结果
    saveResults(structure);
    
    // 关闭进度对话框
    ProgressDialog.showComplete("解析完成！", 1000);
    ProgressDialog.close();
    
    // 显示结果对话框
    ResultDialog.showResults(structure);
    
    // 如果有错误，显示错误报告
    if (ErrorHandler.errors.length > 0 || ErrorHandler.warnings.length > 0) {
        ResultDialog.showErrors(ErrorHandler.errors, ErrorHandler.warnings);
    }
}

// ===== 提取文档信息 =====
function extractDocumentInfo(doc) {
    var info = {
        name: doc.name,
        path: doc.path ? doc.path.fsName : "",
        width: Math.round(doc.width * 100) / 100,
        height: Math.round(doc.height * 100) / 100,
        colorSpace: doc.documentColorSpace.toString().replace("DocumentColorSpace.", ""),
        rulerUnits: doc.rulerUnits.toString().replace("RulerUnits.", ""),
        rulerOrigin: [doc.rulerOrigin[0], doc.rulerOrigin[1]],
        artboards: [],
        swatches: [],
        symbols: [],
        fonts: []
    };
    
    // 画板
    for (var i = 0; i < doc.artboards.length; i++) {
        var ab = doc.artboards[i];
        var rect = ab.artboardRect;
        info.artboards.push({
            index: i,
            name: ab.name,
            bounds: CoordinateSystem.transformBounds(rect),
            isDefault: i === doc.artboards.getActiveArtboardIndex()
        });
    }
    
    // 色板（限制数量）
    var maxSwatches = Math.min(doc.swatches.length, 50);
    for (var s = 0; s < maxSwatches; s++) {
        try {
            var swatch = doc.swatches[s];
            info.swatches.push({
                name: swatch.name,
                color: ColorProcessor.extract(swatch.color)
            });
        } catch (e) {}
    }
    
    // 符号
    for (var sym = 0; sym < doc.symbols.length; sym++) {
        try {
            info.symbols.push({
                index: sym,
                name: doc.symbols[sym].name
            });
        } catch (e) {}
    }
    
    // 使用的字体
    for (var f = 0; f < doc.textFrames.length && info.fonts.length < 20; f++) {
        try {
            var font = doc.textFrames[f].textRange.characterAttributes.textFont;
            if (font) {
                var fontName = font.name;
                var exists = false;
                for (var fi = 0; fi < info.fonts.length; fi++) {
                    if (info.fonts[fi].name === fontName) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    info.fonts.push({
                        name: fontName,
                        family: font.family,
                        style: font.style
                    });
                }
            }
        } catch (e) {}
    }
    
    return info;
}

// ===== 递归遍历元素 =====
function traverseItems(items, flatList, treeList, context) {
    if (context.depth > CONFIG.parse.maxDepth) {
        STATE.warnings.push("达到最大递归深度: " + context.parentPath);
        return;
    }
    
    var len = items.length;  // 缓存长度
    for (var i = 0; i < len; i++) {
        var item = items[i];
        var itemPath = context.parentPath ? context.parentPath + "/" + i : String(i);
        
        // 过滤条件
        if (!CONFIG.parse.includeHidden && item.hidden) continue;
        if (!CONFIG.parse.includeLocked && item.locked) continue;
        
        try {
            var elemData = processItem(item, {
                layerName: context.layerName,
                layerIndex: context.layerIndex,
                path: itemPath,
                parentId: context.parentId,
                depth: context.depth
            });
            
            if (elemData) {
                flatList.push(elemData);
                STATE.totalProcessed++;
                
                // 更新进度（每10个元素更新一次，避免UI卡顿）
                if (STATE.totalProcessed % 10 === 0) {
                    ProgressTracker.update(10);
                    ProgressDialog.update(
                        STATE.totalProcessed, 
                        ProgressTracker.total,
                        elemData.type + ": " + (elemData.name || elemData.id)
                    );
                    
                    // 检查取消
                    if (ProgressDialog.isCancelled()) {
                        return; // 提前退出遍历
                    }
                }
                
                var treeNode = {
                    id: elemData.id,
                    type: elemData.type,
                    name: elemData.name || "",
                    children: []
                };
                treeList.push(treeNode);
                
                // 递归处理组
                if (item.typename === "GroupItem" && item.pageItems) {
                    traverseItems(item.pageItems, flatList, treeNode.children, {
                        layerName: context.layerName,
                        layerIndex: context.layerIndex,
                        parentPath: itemPath,
                        parentId: elemData.id,
                        depth: context.depth + 1
                    });
                }
            }
            
            // 计数
            STATE.counters[item.typename] = (STATE.counters[item.typename] || 0) + 1;
            
        } catch (e) {
            STATE.errors.push({
                path: itemPath,
                typename: item.typename,
                error: e.message
            });
        }
        
        // 定期GC
        if (STATE.totalProcessed % CONFIG.performance.gcInterval === 0) {
            $.gc();
        }
    }
}

// ===== 处理单个元素 =====
function processItem(item, ctx) {
    var typename = item.typename;
    
    switch (typename) {
        case "TextFrame":
            return TextParser.parse(item, ctx, CONFIG);
            
        case "RasterItem":
            return ImageParser.parseRaster(item, ctx);
            
        case "PlacedItem":
            return ImageParser.parsePlaced(item, ctx);
            
        case "GroupItem":
            return GroupParser.parse(item, ctx);
            
        case "PathItem":
            return PathParser.parse(item, ctx, CONFIG);
            
        case "CompoundPathItem":
            return PathParser.parseCompound(item, ctx);
            
        case "SymbolItem":
            return SymbolParser.parse(item, ctx);
            
        case "MeshItem":
            return ElementFactory.createBase("mesh", item, ctx);
            
        case "PluginItem":
            var elem = ElementFactory.createBase("plugin", item, ctx);
            elem.isTracing = item.isTracing || false;
            return elem;
            
        case "GraphItem":
            return ElementFactory.createBase("graph", item, ctx);
            
        case "LegacyTextItem":
            var elem = ElementFactory.createBase("legacy_text", item, ctx);
            elem.converted = item.converted || false;
            return elem;
            
        case "NonNativeItem":
            return ElementFactory.createBase("non_native", item, ctx);
            
        default:
            STATE.warnings.push("未知元素类型: " + typename + " @ " + ctx.path);
            return null;
    }
}

// ===== 获取图层颜色 =====
function getLayerColor(layer) {
    try {
        var c = layer.color;
        return { r: c.red, g: c.green, b: c.blue };
    } catch (e) {
        return null;
    }
}

// ===== 生成统计 =====
function generateStatistics(structure) {
    var stats = {
        totalElements: structure.elements.length,
        byType: {},
        byCategory: {},
        byLayer: {},
        byImportance: { high: 0, medium: 0, low: 0 },
        replaceableCount: 0,
        prefixMarkedCount: 0,
        maxDepth: 0,
        processingTime: (new Date() - STATE.startTime) + "ms",
        errors: STATE.errors.length,
        warnings: STATE.warnings.length,
        logs: Logger.getLogs()
    };
    
    for (var i = 0; i < structure.elements.length; i++) {
        var elem = structure.elements[i];
        
        // 按类型
        stats.byType[elem.type] = (stats.byType[elem.type] || 0) + 1;
        
        // 按分类
        stats.byCategory[elem.category] = (stats.byCategory[elem.category] || 0) + 1;
        
        // 按图层
        stats.byLayer[elem.layer] = (stats.byLayer[elem.layer] || 0) + 1;
        
        // 按重要性
        if (elem.importance) {
            stats.byImportance[elem.importance] = (stats.byImportance[elem.importance] || 0) + 1;
        }
        
        // 可替换元素
        if (elem.semantics && elem.semantics.replaceable) {
            stats.replaceableCount++;
        }
        if (elem.imageAnalysis && elem.imageAnalysis.replaceable) {
            stats.replaceableCount++;
        }
        
        // 前缀标记元素
        if (elem.prefixMark) {
            stats.prefixMarkedCount++;
        }
        
        // 最大深度
        if (elem.depth > stats.maxDepth) {
            stats.maxDepth = elem.depth;
        }
    }
    
    return stats;
}

// ===== 保存结果 =====
function saveResults(structure) {
    var outputDir = CONFIG.projectPath + CONFIG.outputDir;
    
    // 完整结构
    FileUtils.writeJson(outputDir + CONFIG.files.structure, structure);
    
    // 单独保存元素列表（便于大文件处理）
    FileUtils.writeJson(outputDir + CONFIG.files.elements, {
        meta: structure.meta,
        document: { name: structure.document.name },
        elements: structure.elements
    });
    
    // 单独保存树结构
    FileUtils.writeJson(outputDir + CONFIG.files.tree, {
        meta: structure.meta,
        document: { name: structure.document.name },
        tree: structure.tree
    });
    
    // 保存错误和警告日志
    if (STATE.errors.length > 0 || STATE.warnings.length > 0) {
        FileUtils.writeJson(outputDir + "debug_log.json", {
            exportTime: new Date().toISOString(),
            errors: STATE.errors,
            warnings: STATE.warnings
        });
    }
    
    // 保存 HTML/CSS 文件
    if (structure.htmlOutput) {
        // 完整 HTML 文件
        HtmlGenerator.saveHtml(outputDir + "template.html", structure.htmlOutput.combined);
        
        // 分离的文件
        if (CONFIG.html.exportSeparateFiles) {
            HtmlGenerator.saveHtml(outputDir + "template_body.html", structure.htmlOutput.html);
            HtmlGenerator.saveCss(outputDir + "template.css", structure.htmlOutput.css);
        }
    }
    
    // 保存变量分析结果
    if (structure.variableAnalysis) {
        FileUtils.writeJson(outputDir + "variables.json", structure.variableAnalysis);
        FileUtils.writeJson(outputDir + "variable_template.json", structure.variableTemplate);
    }
    
    // 保存模式匹配结果
    if (structure.patternAnalysis) {
        FileUtils.writeJson(outputDir + "patterns.json", {
            patterns: structure.patternAnalysis.patterns,
            summary: structure.patternAnalysis.summary,
            patternVariables: structure.patternVariables || []
        });
    }
    
    // 保存完整性检查报告
    if (structure.integrityCheck || structure.validationReport) {
        FileUtils.writeJson(outputDir + "integrity_report.json", {
            integrityCheck: structure.integrityCheck,
            validationReport: structure.validationReport,
            timestamp: new Date().toISOString()
        });
    }
    
    // 保存审计日志
    FileUtils.writeJson(outputDir + "audit_log.json", AuditLogger.exportLogs());
}

// ===== 导出预览图 (PNG) =====
function exportPreviewImage(doc) {
    var outputDir = CONFIG.projectPath + CONFIG.outputDir;
    var previewFile = new File(outputDir + "preview.png");
    
    try {
        var options = new ExportOptionsPNG24();
        options.antiAliasing = true;
        options.transparency = false;
        options.artBoardClipping = true;
        options.horizontalScale = 100;
        options.verticalScale = 100;
        
        doc.exportFile(previewFile, ExportType.PNG24, options);
        return previewFile.name;
    } catch (e) {
        AuditLogger.warn("preview", "导出PNG预览图失败: " + e.message);
        return null;
    }
}

// ===== 导出彩色 SVG 预览 =====
function exportPreviewSVG(doc) {
    var outputDir = CONFIG.projectPath + CONFIG.outputDir;
    var svgFile = new File(outputDir + "preview.svg");
    
    try {
        var options = new ExportOptionsSVG();
        options.embedRasterImages = true;
        options.embedAllFonts = false;
        options.fontSubsetting = SVGFontSubsetting.None;
        options.documentEncoding = SVGDocumentEncoding.UTF8;
        options.DTD = SVGDTDVersion.SVG1_1;
        options.preserveEditability = false;
        options.coordinatePrecision = 2;
        options.cssProperties = SVGCSSPropertyLocation.STYLEATTRIBUTES;
        
        // 导出 SVG
        doc.exportFile(svgFile, ExportType.SVG, options);
        
        return svgFile.name;
    } catch (e) {
        AuditLogger.warn("preview", "导出SVG预览图失败: " + e.message);
        return null;
    }
}

// ===== 显示摘要 =====
function showSummary(structure) {
    var stats = structure.statistics;
    
    var msg = "=== AI 模板解析完成 (v3.0 SOTA) ===\n\n";
    msg += "文档: " + structure.document.name + "\n";
    msg += "尺寸: " + structure.document.width + " x " + structure.document.height + "\n";
    msg += "图层: " + structure.layers.length + " 个\n";
    msg += "画板: " + structure.document.artboards.length + " 个\n\n";
    
    msg += "=== 元素统计 ===\n";
    for (var type in stats.byType) {
        msg += "  " + type + ": " + stats.byType[type] + "\n";
    }
    
    msg += "\n总计: " + stats.totalElements + " 个元素\n";
    msg += "最大深度: " + stats.maxDepth + " 层\n";
    msg += "可替换: " + stats.replaceableCount + " 个\n";
    msg += "前缀标记: " + stats.prefixMarkedCount + " 个\n";
    msg += "处理时间: " + stats.processingTime + "\n";
    msg += "\n平台: " + (ENV.isMac ? "macOS" : "Windows") + "\n";
    msg += "AI版本: " + ENV.aiFullVersion + "\n";
    
    if (CONFIG.loo.enabled && structure.looAnalysis) {
        msg += "\n=== LOO分析 ===\n";
        msg += "分析元素: " + structure.looAnalysis.analyzedCount + " 个\n";
        if (structure.looAnalysis.summary) {
            msg += "高影响: " + structure.looAnalysis.summary.highImpact.length + " 个\n";
        }
    }
    
    // HTML 生成信息
    if (structure.htmlOutput) {
        msg += "\n=== HTML/CSS 生成 ===\n";
        msg += "已生成 template.html\n";
        if (CONFIG.html.exportSeparateFiles) {
            msg += "已生成 template.css\n";
        }
    }
    
    if (STATE.errors.length > 0) {
        msg += "\n错误: " + STATE.errors.length + " 个\n";
    }
    if (STATE.warnings.length > 0) {
        msg += "警告: " + STATE.warnings.length + " 个\n";
    }
    
    msg += "\n已导出到: " + CONFIG.projectPath + CONFIG.outputDir;
    
    alert(msg);
}

// ===== 运行 =====
main();
