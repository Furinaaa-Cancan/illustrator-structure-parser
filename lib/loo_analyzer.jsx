/**
 * AI 模板结构解析器 v3.0 - 留一法(LOO)分析模块
 * 通过隐藏元素并对比渲染结果，精准确定元素的视觉作用
 */

var LOOAnalyzer = {
    doc: null,
    config: null,
    baselineImage: null,
    results: [],
    exportFolder: null,
    
    // 初始化
    init: function(doc, config) {
        this.doc = doc;
        this.config = config.loo;
        this.results = [];
        
        // 创建导出目录
        var exportPath = CONFIG.projectPath + CONFIG.outputDir + "loo_exports/";
        FileUtils.ensureDir(exportPath);
        this.exportFolder = new Folder(exportPath);
        
        return this;
    },
    
    // 执行完整LOO分析
    analyze: function(elements) {
        if (!this.config.enabled) {
            return { enabled: false, message: "LOO分析未启用" };
        }
        
        var startTime = new Date();
        
        // 1. 导出基准图像
        this.baselineImage = this.exportBaseline();
        
        // 2. 确定要分析的元素
        var targets = this.selectTargets(elements);
        
        // 3. 对每个目标执行LOO
        for (var i = 0; i < targets.length; i++) {
            var elem = targets[i];
            var result = this.analyzeElement(elem, i, targets.length);
            if (result) {
                this.results.push(result);
            }
            
            // 定期GC
            if (i % 10 === 0) {
                $.gc();
            }
        }
        
        // 4. 分析结果
        var analysis = this.summarizeResults();
        
        return {
            enabled: true,
            baseline: this.baselineImage,
            totalElements: elements.length,
            analyzedCount: targets.length,
            results: this.results,
            summary: analysis,
            processingTime: (new Date() - startTime) + "ms"
        };
    },
    
    // 导出基准图像
    exportBaseline: function() {
        var filename = "baseline.png";
        var file = new File(this.exportFolder.fsName + "/" + filename);
        
        try {
            var options = new ExportOptionsPNG24();
            options.antiAliasing = true;
            options.transparency = true;
            options.artBoardClipping = true;
            
            if (this.config.exportScale !== 1) {
                options.horizontalScale = this.config.exportScale * 100;
                options.verticalScale = this.config.exportScale * 100;
            }
            
            this.doc.exportFile(file, ExportType.PNG24, options);
            
            return {
                path: file.fsName,
                exists: file.exists
            };
        } catch (e) {
            return { error: e.message };
        }
    },
    
    // 选择分析目标
    selectTargets: function(elements) {
        var targets = [];
        
        switch (this.config.sampleMode) {
            case "all":
                targets = elements.slice();
                break;
                
            case "random":
                targets = this.randomSample(elements, this.config.sampleSize);
                break;
                
            case "important":
                // 只选择高重要性元素
                for (var i = 0; i < elements.length; i++) {
                    if (elements[i].importance === "high") {
                        targets.push(elements[i]);
                    }
                }
                break;
        }
        
        // 如果启用分组优先，先按组分析
        if (this.config.groupFirst) {
            targets = this.prioritizeGroups(targets);
        }
        
        return targets;
    },
    
    // 随机采样
    randomSample: function(arr, size) {
        var copy = arr.slice();
        var result = [];
        size = Math.min(size, copy.length);
        
        for (var i = 0; i < size; i++) {
            var idx = Math.floor(Math.random() * copy.length);
            result.push(copy[idx]);
            copy.splice(idx, 1);
        }
        
        return result;
    },
    
    // 优先分析组
    prioritizeGroups: function(elements) {
        var groups = [];
        var others = [];
        
        for (var i = 0; i < elements.length; i++) {
            if (elements[i].type === "group" || elements[i].type === "clip_group") {
                groups.push(elements[i]);
            } else {
                others.push(elements[i]);
            }
        }
        
        return groups.concat(others);
    },
    
    // 分析单个元素
    analyzeElement: function(elemData, index, total) {
        try {
            // 查找实际的AI对象
            var item = this.findItemByPath(elemData.path, elemData.layerIndex);
            if (!item) {
                return {
                    id: elemData.id,
                    status: "not_found",
                    error: "无法定位元素"
                };
            }
            
            // 记录原始状态
            var wasHidden = item.hidden;
            
            // 隐藏元素
            item.hidden = true;
            app.redraw();
            
            // 导出当前状态
            var filename = "loo_" + index + "_" + elemData.id + ".png";
            var file = new File(this.exportFolder.fsName + "/" + filename);
            
            var options = new ExportOptionsPNG24();
            options.antiAliasing = true;
            options.transparency = true;
            options.artBoardClipping = true;
            
            this.doc.exportFile(file, ExportType.PNG24, options);
            
            // 恢复元素
            item.hidden = wasHidden;
            app.redraw();
            
            // 分析差异（简化版 - 只记录文件大小差异）
            var baselineSize = new File(this.baselineImage.path).length;
            var looSize = file.length;
            var sizeDiff = Math.abs(baselineSize - looSize);
            
            return {
                id: elemData.id,
                type: elemData.type,
                name: elemData.name,
                path: elemData.path,
                status: "analyzed",
                looImage: file.fsName,
                analysis: {
                    baselineSize: baselineSize,
                    looSize: looSize,
                    sizeDifference: sizeDiff,
                    sizeDiffPercent: baselineSize > 0 ? Math.round(sizeDiff / baselineSize * 10000) / 100 : 0,
                    // 差异越大，元素越重要
                    impactScore: this.calculateImpactScore(sizeDiff, baselineSize, elemData)
                }
            };
            
        } catch (e) {
            return {
                id: elemData.id,
                status: "error",
                error: e.message
            };
        }
    },
    
    // 根据路径查找元素
    findItemByPath: function(path, layerIndex) {
        try {
            var layer = this.doc.layers[layerIndex];
            if (!layer) return null;
            
            var indices = path.split("/");
            var current = layer.pageItems;
            
            for (var i = 0; i < indices.length; i++) {
                var idx = parseInt(indices[i], 10);
                if (isNaN(idx) || idx >= current.length) return null;
                
                var item = current[idx];
                if (i === indices.length - 1) {
                    return item;
                }
                
                if (item.typename === "GroupItem") {
                    current = item.pageItems;
                } else {
                    return null;
                }
            }
        } catch (e) {}
        return null;
    },
    
    // 计算影响得分
    calculateImpactScore: function(sizeDiff, baselineSize, elemData) {
        var score = 0;
        
        // 基于文件大小差异
        if (baselineSize > 0) {
            var percent = sizeDiff / baselineSize * 100;
            score = Math.min(percent * 2, 50);  // 最高50分
        }
        
        // 基于元素类型
        if (elemData.type === "text" || elemData.type === "image_embedded" || elemData.type === "image_linked") {
            score += 20;
        } else if (elemData.type === "group" || elemData.type === "clip_group") {
            score += 15;
        }
        
        // 基于元素大小
        var area = elemData.size.width * elemData.size.height;
        var docArea = this.doc.width * this.doc.height;
        if (docArea > 0) {
            var areaPercent = area / docArea * 100;
            score += Math.min(areaPercent, 30);  // 最高30分
        }
        
        return Math.round(score);
    },
    
    // 汇总分析结果
    summarizeResults: function() {
        var summary = {
            total: this.results.length,
            analyzed: 0,
            errors: 0,
            highImpact: [],
            mediumImpact: [],
            lowImpact: []
        };
        
        for (var i = 0; i < this.results.length; i++) {
            var r = this.results[i];
            
            if (r.status === "analyzed") {
                summary.analyzed++;
                
                var score = r.analysis.impactScore;
                var item = {
                    id: r.id,
                    type: r.type,
                    name: r.name,
                    score: score
                };
                
                if (score >= 70) {
                    summary.highImpact.push(item);
                } else if (score >= 40) {
                    summary.mediumImpact.push(item);
                } else {
                    summary.lowImpact.push(item);
                }
            } else {
                summary.errors++;
            }
        }
        
        // 按分数排序
        summary.highImpact.sort(function(a, b) { return b.score - a.score; });
        summary.mediumImpact.sort(function(a, b) { return b.score - a.score; });
        
        return summary;
    },
    
    // 交互效应分析（多元素组合LOO）
    analyzeInteraction: function(elemA, elemB) {
        // 同时隐藏两个元素，检测是否有交互效应
        // 如果 effect(A+B) != effect(A) + effect(B)，则存在交互
        // 这个功能较复杂，留作扩展
        return { notImplemented: true };
    }
};

// ===== 差异分析器（需要外部工具支持）=====

var DiffAnalyzer = {
    // 像素级差异分析（简化版）
    // 完整实现需要调用外部图像处理库
    analyzeDiff: function(baseline, target) {
        return {
            method: "file_size_comparison",
            note: "完整像素对比需要外部工具(如Python PIL/OpenCV)"
        };
    },
    
    // 生成差异热力图的命令（供外部执行）
    generateDiffCommand: function(baseline, target, output) {
        // Python命令示例
        return "python3 -c \"" +
            "from PIL import Image, ImageChops; " +
            "import numpy as np; " +
            "a = Image.open('" + baseline + "'); " +
            "b = Image.open('" + target + "'); " +
            "diff = ImageChops.difference(a, b); " +
            "diff.save('" + output + "')\"";
    }
};
