/**
 * AI 模板结构解析器 v3.1 - 批量替换执行器
 * 
 * 功能：根据变量模板和用户数据，执行批量替换
 * 支持：文本替换、图片替换、组复制
 */

// ===== 批量替换执行器 =====

var BatchReplacer = {
    doc: null,
    elemIndex: null,
    log: [],
    
    // 初始化
    init: function(doc) {
        this.doc = doc || app.activeDocument;
        this.elemIndex = {};
        this.log = [];
        return this;
    },
    
    // 构建元素索引（通过名称或路径查找）
    buildIndex: function(elements) {
        for (var i = 0; i < elements.length; i++) {
            var elem = elements[i];
            this.elemIndex[elem.id] = elem;
            if (elem.path) {
                this.elemIndex["path:" + elem.path] = elem;
            }
        }
    },
    
    // 执行批量替换
    // data: 用户输入的替换数据
    // template: 变量模板
    execute: function(data, template) {
        var results = {
            success: [],
            failed: [],
            skipped: []
        };
        
        // 1. 处理简单字段替换
        if (data.fields) {
            for (var fieldPath in data.fields) {
                var value = data.fields[fieldPath];
                var templateField = this.findTemplateField(template, fieldPath);
                
                if (templateField) {
                    var result = this.replaceField(templateField.elementId, value, templateField.type);
                    if (result.success) {
                        results.success.push({ field: fieldPath, value: value });
                    } else {
                        results.failed.push({ field: fieldPath, error: result.error });
                    }
                } else {
                    results.skipped.push({ field: fieldPath, reason: "模板中未找到" });
                }
            }
        }
        
        // 2. 处理可重复模式（如嘉宾列表）
        if (data.guests && template.patterns) {
            var guestPattern = this.findPattern(template.patterns, "guest");
            if (guestPattern) {
                var guestResults = this.processRepeatablePattern(guestPattern, data.guests);
                results.success = results.success.concat(guestResults.success);
                results.failed = results.failed.concat(guestResults.failed);
            }
        }
        
        // 3. 刷新文档
        this.doc.redraw();
        
        return results;
    },
    
    // 查找模板字段
    findTemplateField: function(template, fieldPath) {
        // 支持嵌套路径：header.event_title
        var parts = fieldPath.split(".");
        var current = template.fields;
        
        for (var i = 0; i < parts.length; i++) {
            if (!current) return null;
            current = current[parts[i]];
        }
        
        return current;
    },
    
    // 查找模式定义
    findPattern: function(patterns, patternId) {
        for (var i = 0; i < patterns.length; i++) {
            if (patterns[i].patternId === patternId) {
                return patterns[i];
            }
        }
        return null;
    },
    
    // 替换单个字段
    replaceField: function(elementId, value, fieldType) {
        try {
            var item = this.findItemById(elementId);
            if (!item) {
                return { success: false, error: "元素未找到: " + elementId };
            }
            
            // 根据类型执行替换
            if (fieldType === "image" || fieldType === "avatar" || fieldType === "photo" || fieldType === "logo") {
                return this.replaceImage(item, value);
            } else {
                return this.replaceText(item, value);
            }
        } catch (e) {
            return { success: false, error: e.message };
        }
    },
    
    // 替换文本内容（简化版，只替换内容不改变样式）
    replaceText: function(item, newContent) {
        if (item.typename !== "TextFrame") {
            return { success: false, error: "不是文本元素" };
        }
        
        try {
            // 直接替换内容，保留原有样式
            item.contents = newContent;
            
            this.log.push({ action: "replaceText", elementId: item.name, newValue: newContent });
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },
    
    // 替换图片
    replaceImage: function(item, newImagePath) {
        if (item.typename !== "PlacedItem" && item.typename !== "RasterItem") {
            return { success: false, error: "不是图片元素" };
        }
        
        try {
            var file = new File(newImagePath);
            if (!file.exists) {
                return { success: false, error: "图片文件不存在: " + newImagePath };
            }
            
            // 记录原始位置和尺寸
            var originalBounds = item.geometricBounds.slice();
            var originalWidth = item.width;
            var originalHeight = item.height;
            
            // 替换图片
            if (item.typename === "PlacedItem") {
                item.file = file;
            } else {
                // RasterItem 需要重新嵌入
                var newItem = this.doc.placedItems.add();
                newItem.file = file;
                newItem.move(item, ElementPlacement.PLACEBEFORE);
                
                // 复制位置和尺寸
                newItem.geometricBounds = originalBounds;
                
                // 删除原图
                item.remove();
                item = newItem;
            }
            
            // 恢复到原始尺寸和位置（智能裁剪）
            this.fitImageToBounds(item, originalBounds, originalWidth, originalHeight);
            
            this.log.push({ action: "replaceImage", elementId: item.name, newPath: newImagePath });
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },
    
    // 将图片适配到原始边界（居中裁剪）
    fitImageToBounds: function(item, originalBounds, targetWidth, targetHeight) {
        var currentWidth = item.width;
        var currentHeight = item.height;
        
        // 计算缩放比例（cover 模式）
        var scaleX = targetWidth / currentWidth;
        var scaleY = targetHeight / currentHeight;
        var scale = Math.max(scaleX, scaleY);
        
        // 缩放
        item.resize(scale * 100, scale * 100);
        
        // 居中定位
        var newWidth = item.width;
        var newHeight = item.height;
        var left = originalBounds[0] - (newWidth - targetWidth) / 2;
        var top = originalBounds[1] + (newHeight - targetHeight) / 2;
        
        item.position = [left, top];
        
        // 如果有剪切蒙版，图片会自动被裁剪
    },
    
    // 处理可重复模式（如多个嘉宾）
    processRepeatablePattern: function(pattern, dataList) {
        var results = { success: [], failed: [] };
        
        // 找到源组
        var sourceGroup = this.findItemById(pattern.groupId);
        if (!sourceGroup) {
            results.failed.push({ error: "找不到源组: " + pattern.groupId });
            return results;
        }
        
        // 计算组高度（用于偏移）
        var groupHeight = Math.abs(sourceGroup.geometricBounds[1] - sourceGroup.geometricBounds[3]);
        var spacing = 20;  // 组间距
        
        for (var i = 0; i < dataList.length; i++) {
            var data = dataList[i];
            
            if (i === 0) {
                // 第一个：直接替换源组
                var r = this.replacePatternFields(sourceGroup, pattern.fields, data);
                results.success = results.success.concat(r.success);
                results.failed = results.failed.concat(r.failed);
            } else {
                // 后续：复制组并替换
                var newGroup = sourceGroup.duplicate();
                
                // 向下移动
                var offset = i * (groupHeight + spacing);
                newGroup.translate(0, -offset);  // AI 坐标 Y 向下为负
                
                // 替换新组内容
                var r = this.replacePatternFields(newGroup, pattern.fields, data);
                results.success = results.success.concat(r.success);
                results.failed = results.failed.concat(r.failed);
            }
        }
        
        return results;
    },
    
    // 替换模式中的字段
    replacePatternFields: function(group, fieldDefs, data) {
        var results = { success: [], failed: [] };
        
        for (var fieldName in fieldDefs) {
            if (data[fieldName] !== undefined) {
                var fieldDef = fieldDefs[fieldName];
                var item = this.findItemInGroup(group, fieldDef.elementId);
                
                if (item) {
                    var r = this.replaceField(item.name, data[fieldName], fieldDef.type || "text");
                    if (r.success) {
                        results.success.push({ field: fieldName, value: data[fieldName] });
                    } else {
                        results.failed.push({ field: fieldName, error: r.error });
                    }
                }
            }
        }
        
        return results;
    },
    
    // 通过 ID 查找元素
    findItemById: function(elementId) {
        // 优先从索引查找
        if (this.elemIndex[elementId]) {
            var path = this.elemIndex[elementId].path;
            return this.findItemByPath(path);
        }
        
        // 遍历查找（按名称）
        return this.findItemByName(this.doc, elementId);
    },
    
    // 通过路径查找元素
    findItemByPath: function(path) {
        var parts = path.split("/");
        var current = this.doc.layers[parseInt(parts[0], 10)];
        
        for (var i = 1; i < parts.length && current; i++) {
            var index = parseInt(parts[i], 10);
            if (current.pageItems && current.pageItems.length > index) {
                current = current.pageItems[index];
            } else {
                return null;
            }
        }
        
        return current;
    },
    
    // 通过名称递归查找
    findItemByName: function(container, name) {
        var items = container.pageItems || container.layers;
        if (!items) return null;
        
        for (var i = 0; i < items.length; i++) {
            if (items[i].name === name) {
                return items[i];
            }
            if (items[i].pageItems) {
                var found = this.findItemByName(items[i], name);
                if (found) return found;
            }
        }
        return null;
    },
    
    // 在组内查找元素
    findItemInGroup: function(group, elementId) {
        if (!group.pageItems) return null;
        
        for (var i = 0; i < group.pageItems.length; i++) {
            var item = group.pageItems[i];
            if (item.name === elementId) return item;
            
            // 递归查找子组
            if (item.pageItems) {
                var found = this.findItemInGroup(item, elementId);
                if (found) return found;
            }
        }
        return null;
    },
    
    // 捕获文本样式
    captureTextStyle: function(textFrame) {
        try {
            var range = textFrame.textRange;
            var attr = range.characterAttributes;
            return {
                font: attr.textFont ? attr.textFont.name : null,
                size: attr.size,
                fillColor: attr.fillColor,
                tracking: attr.tracking,
                leading: attr.leading
            };
        } catch (e) {
            return null;
        }
    },
    
    // 应用文本样式
    applyTextStyle: function(textFrame, style) {
        if (!style) return;
        
        try {
            var range = textFrame.textRange;
            var attr = range.characterAttributes;
            
            if (style.font) {
                try { attr.textFont = app.textFonts.getByName(style.font); } catch (e) {}
            }
            if (style.size) attr.size = style.size;
            if (style.fillColor) attr.fillColor = style.fillColor;
            if (style.tracking) attr.tracking = style.tracking;
            if (style.leading) attr.leading = style.leading;
        } catch (e) {
            // 样式应用失败，忽略
        }
    },
    
    // 获取执行日志
    getLog: function() {
        return this.log;
    }
};

// ===== 快捷函数 =====

// 从 JSON 文件加载数据并执行替换
function runBatchReplace(dataJsonPath, templateJsonPath) {
    var dataFile = new File(dataJsonPath);
    var templateFile = new File(templateJsonPath);
    
    if (!dataFile.exists) {
        alert("数据文件不存在: " + dataJsonPath);
        return null;
    }
    if (!templateFile.exists) {
        alert("模板文件不存在: " + templateJsonPath);
        return null;
    }
    
    // 读取 JSON
    dataFile.open("r");
    var dataJson = dataFile.read();
    dataFile.close();
    
    templateFile.open("r");
    var templateJson = templateFile.read();
    templateFile.close();
    
    // 解析（ExtendScript 没有 JSON.parse，使用 eval）
    var data, template;
    try {
        data = eval("(" + dataJson + ")");
        template = eval("(" + templateJson + ")");
    } catch (e) {
        alert("JSON 解析错误: " + e.message);
        return null;
    }
    
    // 执行替换
    var replacer = BatchReplacer.init();
    var results = replacer.execute(data, template);
    
    // 显示结果
    var msg = "批量替换完成\n\n";
    msg += "成功: " + results.success.length + " 项\n";
    msg += "失败: " + results.failed.length + " 项\n";
    msg += "跳过: " + results.skipped.length + " 项\n";
    
    if (results.failed.length > 0) {
        msg += "\n失败详情:\n";
        for (var i = 0; i < Math.min(results.failed.length, 5); i++) {
            msg += "- " + results.failed[i].field + ": " + results.failed[i].error + "\n";
        }
    }
    
    alert(msg);
    return results;
}

// 从配置文件运行批量替换（供 Web 服务调用）
BatchReplacer.runFromConfig = function(configPath) {
    var configFile = new File(configPath);
    if (!configFile.exists) {
        return { success: false, error: "配置文件不存在: " + configPath };
    }
    
    // 读取配置
    configFile.open("r");
    var configJson = configFile.read();
    configFile.close();
    
    var config;
    try {
        config = eval("(" + configJson + ")");
    } catch (e) {
        return { success: false, error: "配置解析错误: " + e.message };
    }
    
    // 打开源文件
    var sourceFile = new File(config.sourceFile);
    if (!sourceFile.exists) {
        return { success: false, error: "源文件不存在: " + config.sourceFile };
    }
    
    var doc = app.open(sourceFile);
    this.init(doc);
    
    // 执行替换 - 支持新格式（数组）和旧格式（对象）
    var replacements = config.replacements || [];
    var self = this;  // 保存 this 引用
    
    // 调试日志函数
    function debugLog(msg) {
        var logFile = new File(config.outputDir + "/jsx_debug.log");
        logFile.open("a");
        var d = new Date();
        var ts = d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate() + " " + d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds();
        logFile.writeln("[" + ts + "] " + msg);
        logFile.close();
    }
    
    // 递归查找文本元素（通过内容匹配）
    function findTextByContent(container, targetContent) {
        if (!container) return null;
        var items = container.pageItems || container.textFrames;
        if (!items) return null;
        
        for (var k = 0; k < items.length; k++) {
            var item = items[k];
            // 如果是文本框，检查内容
            if (item.typename === "TextFrame") {
                var content = "";
                try { content = item.contents || ""; } catch(e) {}
                // 内容匹配（去除换行符比较）
                var cleanTarget = targetContent.replace(/[\r\n]/g, "").substring(0, 30);
                var cleanContent = content.replace(/[\r\n]/g, "").substring(0, 30);
                if (cleanContent === cleanTarget) {
                    debugLog("findTextByContent: MATCH found, content=" + cleanContent.substring(0,20));
                    return item;
                }
            }
            // 递归搜索子元素
            if (item.pageItems && item.pageItems.length > 0) {
                var found = findTextByContent(item, targetContent);
                if (found) return found;
            }
        }
        return null;
    }
    
    // 通过路径查找元素（备用）
    function findByPath(pathStr) {
        if (!pathStr) return null;
        var parts = pathStr.split("/");
        var layerIndex = parseInt(parts[0], 10);
        if (layerIndex >= doc.layers.length) return null;
        var current = doc.layers[layerIndex];
        
        for (var j = 1; j < parts.length && current; j++) {
            var idx = parseInt(parts[j], 10);
            if (current.pageItems && current.pageItems.length > idx) {
                current = current.pageItems[idx];
            } else {
                return null;
            }
        }
        return current;
    }
    
    // 如果是数组格式（新格式，包含 currentValue 和 newValue）
    if (replacements.length !== undefined) {
        debugLog("Processing " + replacements.length + " replacements");
        for (var i = 0; i < replacements.length; i++) {
            var rep = replacements[i];
            var item = null;
            var newValue = rep.newValue || rep.value || "";
            
            debugLog("Rep " + i + ": varKey=" + rep.varKey + ", currentValue=" + (rep.currentValue || "").substring(0,20));
            
            // 优先使用 currentValue 通过内容匹配查找
            if (rep.currentValue) {
                for (var layerIdx = 0; layerIdx < doc.layers.length && !item; layerIdx++) {
                    item = findTextByContent(doc.layers[layerIdx], rep.currentValue);
                }
            }
            
            // 退回到路径查找
            if (!item && rep.elementPath) {
                item = findByPath(rep.elementPath);
                // 如果找到的是 Group，递归搜索其中的文本
                if (item && item.typename !== "TextFrame" && rep.currentValue) {
                    item = findTextByContent(item, rep.currentValue);
                }
            }
            
            debugLog("Rep " + i + ": found item=" + (item ? item.typename : "null"));
            
            if (item) {
                if (item.typename === "TextFrame") {
                    debugLog("Replacing text: " + item.contents.substring(0,20) + " -> " + newValue.substring(0,20));
                    self.replaceText(item, newValue);
                } else if (item.typename === "PlacedItem" || item.typename === "RasterItem") {
                    self.replaceImage(item, newValue);
                }
            }
        }
    } else {
        // 旧格式（对象）- 向后兼容
        for (var varKey in replacements) {
            var newValue = replacements[varKey];
            var item = self.findItemByName(doc, varKey);
            if (item) {
                if (item.typename === "TextFrame") {
                    self.replaceText(item, newValue);
                } else if (item.typename === "PlacedItem" || item.typename === "RasterItem") {
                    self.replaceImage(item, newValue);
                }
            }
        }
    }
    
    // 将所有文字转曲（避免字体缺失导致的白色边框）
    function outlineAllText(container) {
        if (!container) return;
        var items = container.textFrames;
        if (items && items.length > 0) {
            // 从后向前遍历，因为转曲会改变索引
            for (var k = items.length - 1; k >= 0; k--) {
                try {
                    items[k].createOutline();
                } catch (e) {}
            }
        }
        // 递归处理子组
        if (container.groupItems) {
            for (var g = 0; g < container.groupItems.length; g++) {
                outlineAllText(container.groupItems[g]);
            }
        }
    }
    
    // 对所有图层执行转曲
    for (var layerIdx = 0; layerIdx < doc.layers.length; layerIdx++) {
        outlineAllText(doc.layers[layerIdx]);
    }
    
    // 导出
    var outputDir = new Folder(config.outputDir);
    if (!outputDir.exists) {
        outputDir.create();
    }
    
    var outputName = config.outputName || "output";
    var formats = config.exportFormats || ["pdf"];
    var results = [];
    
    for (var i = 0; i < formats.length; i++) {
        var format = formats[i].toLowerCase();
        var outputPath;
        
        if (format === "ai") {
            // 保存为 AI 格式（使用最简单的选项）
            outputPath = config.outputDir + "/" + outputName + ".ai";
            var aiOpts = new IllustratorSaveOptions();
            aiOpts.compatibility = Compatibility.ILLUSTRATOR17;  // CC
            aiOpts.pdfCompatible = true;
            aiOpts.embedLinkedFiles = true;
            // 不设置 flattenOutput，使用默认值
            doc.saveAs(new File(outputPath), aiOpts);
            results.push(outputPath);
        } else if (format === "pdf") {
            outputPath = config.outputDir + "/" + outputName + ".pdf";
            var pdfOpts = new PDFSaveOptions();
            pdfOpts.compatibility = PDFCompatibility.ACROBAT6;
            pdfOpts.preserveEditability = false;
            pdfOpts.generateThumbnails = false;
            doc.saveAs(new File(outputPath), pdfOpts);
            results.push(outputPath);
        } else if (format === "png") {
            outputPath = config.outputDir + "/" + outputName + ".png";
            var pngOpts = new ExportOptionsPNG24();
            pngOpts.horizontalScale = 100;
            pngOpts.verticalScale = 100;
            pngOpts.transparency = true;
            doc.exportFile(new File(outputPath), ExportType.PNG24, pngOpts);
            results.push(outputPath);
        } else if (format === "jpg" || format === "jpeg") {
            outputPath = config.outputDir + "/" + outputName + ".jpg";
            var jpgOpts = new ExportOptionsJPEG();
            jpgOpts.qualitySetting = 80;
            doc.exportFile(new File(outputPath), ExportType.JPEG, jpgOpts);
            results.push(outputPath);
        }
    }
    
    // 关闭文档（不保存更改）
    doc.close(SaveOptions.DONOTSAVECHANGES);
    
    return { success: true, files: results };
};

// 导出
if (typeof exports !== "undefined") {
    exports.BatchReplacer = BatchReplacer;
    exports.runBatchReplace = runBatchReplace;
}
