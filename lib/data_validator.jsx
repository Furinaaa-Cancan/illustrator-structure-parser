/**
 * AI 模板结构解析器 v3.0 - 商业级数据验证模块
 * 提供严格的输入验证、数据清洗和类型检查
 */

// ===== 数据验证器 =====

var DataValidator = {
    // 验证统计
    stats: {
        validated: 0,
        cleaned: 0,
        rejected: 0,
        warnings: []
    },
    
    // 重置统计
    reset: function() {
        this.stats = { validated: 0, cleaned: 0, rejected: 0, warnings: [] };
    },
    
    // 验证并清洗字符串
    sanitizeString: function(str, maxLength, fieldName) {
        if (str === null || str === undefined) return "";
        if (typeof str !== "string") {
            str = String(str);
            this.stats.cleaned++;
        }
        // 移除控制字符
        str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
        // 限制长度
        if (maxLength && str.length > maxLength) {
            str = str.substring(0, maxLength);
            this.stats.warnings.push(fieldName + " 被截断至 " + maxLength + " 字符");
        }
        this.stats.validated++;
        return str;
    },
    
    // 验证并清洗数字
    sanitizeNumber: function(num, min, max, defaultVal, fieldName) {
        if (num === null || num === undefined || isNaN(num)) {
            this.stats.cleaned++;
            return defaultVal !== undefined ? defaultVal : 0;
        }
        num = Number(num);
        if (isNaN(num) || !isFinite(num)) {
            this.stats.cleaned++;
            return defaultVal !== undefined ? defaultVal : 0;
        }
        if (min !== undefined && num < min) {
            num = min;
            this.stats.warnings.push(fieldName + " 被限制为最小值 " + min);
        }
        if (max !== undefined && num > max) {
            num = max;
            this.stats.warnings.push(fieldName + " 被限制为最大值 " + max);
        }
        this.stats.validated++;
        return num;
    },
    
    // 验证数组
    sanitizeArray: function(arr, maxItems, fieldName) {
        if (!arr) return [];
        if (!this.isArray(arr)) {
            this.stats.rejected++;
            return [];
        }
        if (maxItems && arr.length > maxItems) {
            arr = arr.slice(0, maxItems);
            this.stats.warnings.push(fieldName + " 被截断至 " + maxItems + " 项");
        }
        this.stats.validated++;
        return arr;
    },
    
    // 验证对象
    sanitizeObject: function(obj, requiredKeys, fieldName) {
        if (!obj || typeof obj !== "object") {
            this.stats.rejected++;
            return null;
        }
        if (requiredKeys) {
            for (var i = 0; i < requiredKeys.length; i++) {
                if (!(requiredKeys[i] in obj)) {
                    this.stats.warnings.push(fieldName + " 缺少必需字段: " + requiredKeys[i]);
                }
            }
        }
        this.stats.validated++;
        return obj;
    },
    
    // 验证坐标
    sanitizeCoordinate: function(coord, docWidth, docHeight) {
        if (!coord) return { x: 0, y: 0 };
        return {
            x: this.sanitizeNumber(coord.x, -docWidth * 2, docWidth * 2, 0, "坐标X"),
            y: this.sanitizeNumber(coord.y, -docHeight * 2, docHeight * 2, 0, "坐标Y")
        };
    },
    
    // 验证尺寸
    sanitizeSize: function(size, maxWidth, maxHeight) {
        if (!size) return { width: 0, height: 0 };
        return {
            width: this.sanitizeNumber(size.width, 0, maxWidth, 0, "宽度"),
            height: this.sanitizeNumber(size.height, 0, maxHeight, 0, "高度")
        };
    },
    
    // 验证颜色值
    sanitizeColor: function(color) {
        if (!color) return null;
        if (color.type === "rgb" || color.type === "RGB") {
            return {
                type: "rgb",
                r: this.sanitizeNumber(color.r, 0, 255, 0, "颜色R"),
                g: this.sanitizeNumber(color.g, 0, 255, 0, "颜色G"),
                b: this.sanitizeNumber(color.b, 0, 255, 0, "颜色B")
            };
        }
        if (color.type === "cmyk" || color.type === "CMYK") {
            return {
                type: "cmyk",
                c: this.sanitizeNumber(color.c, 0, 100, 0, "颜色C"),
                m: this.sanitizeNumber(color.m, 0, 100, 0, "颜色M"),
                y: this.sanitizeNumber(color.y, 0, 100, 0, "颜色Y"),
                k: this.sanitizeNumber(color.k, 0, 100, 0, "颜色K")
            };
        }
        return color;
    },
    
    // 验证元素数据完整性
    validateElement: function(elem) {
        var errors = [];
        var warnings = [];
        
        // 必需字段检查
        if (!elem.id) errors.push("缺少ID");
        if (!elem.type) errors.push("缺少类型");
        if (!elem.typename) warnings.push("缺少typename");
        
        // 位置和尺寸检查
        if (!elem.position) {
            warnings.push("缺少位置信息");
        } else {
            if (typeof elem.position.x !== "number") warnings.push("位置X非数字");
            if (typeof elem.position.y !== "number") warnings.push("位置Y非数字");
        }
        
        if (!elem.size) {
            warnings.push("缺少尺寸信息");
        } else {
            if (elem.size.width < 0) errors.push("宽度为负数");
            if (elem.size.height < 0) errors.push("高度为负数");
        }
        
        // 边界检查
        if (elem.bounds) {
            if (elem.bounds.width !== elem.bounds.right - elem.bounds.left) {
                warnings.push("边界宽度不一致");
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    },
    
    // 验证整体结构
    validateStructure: function(structure) {
        var result = {
            valid: true,
            errors: [],
            warnings: [],
            elementErrors: 0,
            elementWarnings: 0
        };
        
        // meta 验证
        if (!structure.meta) {
            result.errors.push("缺少 meta 信息");
            result.valid = false;
        } else {
            if (!structure.meta.version) result.warnings.push("缺少版本号");
            if (!structure.meta.exportTime) result.warnings.push("缺少导出时间");
        }
        
        // document 验证
        if (!structure.document) {
            result.errors.push("缺少 document 信息");
            result.valid = false;
        } else {
            if (!structure.document.name) result.warnings.push("缺少文档名");
            if (!structure.document.width || !structure.document.height) {
                result.errors.push("缺少文档尺寸");
                result.valid = false;
            }
        }
        
        // elements 验证
        if (!structure.elements || !this.isArray(structure.elements)) {
            result.errors.push("缺少 elements 数组");
            result.valid = false;
        } else {
            for (var i = 0; i < structure.elements.length; i++) {
                var elemResult = this.validateElement(structure.elements[i]);
                if (!elemResult.valid) result.elementErrors++;
                result.elementWarnings += elemResult.warnings.length;
            }
        }
        
        return result;
    },
    
    // 辅助：检查是否为数组
    isArray: function(obj) {
        return Object.prototype.toString.call(obj) === "[object Array]";
    },
    
    // 获取验证报告
    getReport: function() {
        return {
            validated: this.stats.validated,
            cleaned: this.stats.cleaned,
            rejected: this.stats.rejected,
            warnings: this.stats.warnings,
            summary: "验证 " + this.stats.validated + " 项, 清洗 " + 
                     this.stats.cleaned + " 项, 拒绝 " + this.stats.rejected + " 项"
        };
    }
};

// ===== 商业级日志系统 =====

var AuditLogger = {
    logs: [],
    level: "info", // debug, info, warn, error
    maxLogs: 1000,
    
    levels: { debug: 0, info: 1, warn: 2, error: 3 },
    
    // 记录日志
    log: function(level, category, message, data) {
        if (this.levels[level] < this.levels[this.level]) return;
        
        var entry = {
            timestamp: new Date().toISOString(),
            level: level,
            category: category,
            message: message,
            data: data || null
        };
        
        this.logs.push(entry);
        
        // 限制日志数量
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
        
        return entry;
    },
    
    debug: function(category, message, data) {
        return this.log("debug", category, message, data);
    },
    
    info: function(category, message, data) {
        return this.log("info", category, message, data);
    },
    
    warn: function(category, message, data) {
        return this.log("warn", category, message, data);
    },
    
    error: function(category, message, data) {
        return this.log("error", category, message, data);
    },
    
    // 性能追踪
    startTimer: function(name) {
        this["_timer_" + name] = new Date().getTime();
    },
    
    endTimer: function(name) {
        var start = this["_timer_" + name];
        if (!start) return 0;
        var duration = new Date().getTime() - start;
        this.info("performance", name + " 耗时: " + duration + "ms", { duration: duration });
        return duration;
    },
    
    // 获取日志
    getLogs: function(level, category) {
        var result = [];
        for (var i = 0; i < this.logs.length; i++) {
            var log = this.logs[i];
            if (level && log.level !== level) continue;
            if (category && log.category !== category) continue;
            result.push(log);
        }
        return result;
    },
    
    // 导出日志
    exportLogs: function() {
        return {
            exportTime: new Date().toISOString(),
            totalLogs: this.logs.length,
            byLevel: {
                debug: this.getLogs("debug").length,
                info: this.getLogs("info").length,
                warn: this.getLogs("warn").length,
                error: this.getLogs("error").length
            },
            logs: this.logs
        };
    },
    
    // 清空日志
    clear: function() {
        this.logs = [];
    }
};

// ===== 数据完整性检查器 =====

var IntegrityChecker = {
    // 检查 ID 唯一性
    checkIdUniqueness: function(elements) {
        var ids = {};
        var duplicates = [];
        
        for (var i = 0; i < elements.length; i++) {
            var id = elements[i].id;
            if (ids[id]) {
                duplicates.push({ id: id, indices: [ids[id], i] });
            } else {
                ids[id] = i;
            }
        }
        
        return {
            unique: duplicates.length === 0,
            duplicates: duplicates,
            totalIds: Object.keys(ids).length
        };
    },
    
    // 检查父子关系完整性
    checkHierarchy: function(elements) {
        var issues = [];
        var idSet = {};
        
        // 构建 ID 集合
        for (var i = 0; i < elements.length; i++) {
            idSet[elements[i].id] = true;
        }
        
        // 检查父 ID 引用
        for (var j = 0; j < elements.length; j++) {
            var elem = elements[j];
            if (elem.parentId && !idSet[elem.parentId]) {
                issues.push({
                    elementId: elem.id,
                    issue: "父元素ID不存在: " + elem.parentId
                });
            }
        }
        
        return {
            valid: issues.length === 0,
            issues: issues
        };
    },
    
    // 检查边界合理性（使用画板相对坐标）
    checkBounds: function(elements, docWidth, docHeight) {
        var outOfBounds = [];
        var partiallyVisible = [];
        var fullyVisible = 0;
        
        // 获取画板信息（如果可用）
        var artboardInfo = null;
        if (typeof CoordinateSystem !== "undefined" && CoordinateSystem.getArtboardInfo) {
            artboardInfo = CoordinateSystem.getArtboardInfo();
        }
        
        var checkWidth = artboardInfo ? artboardInfo.width : docWidth;
        var checkHeight = artboardInfo ? artboardInfo.height : docHeight;
        
        // 允许小幅度溢出（10px容差）
        var margin = 10;
        
        for (var i = 0; i < elements.length; i++) {
            var elem = elements[i];
            if (!elem.bounds) continue;
            
            var b = elem.bounds;
            
            // 完全在画板外
            if (b.right < -margin || b.left > checkWidth + margin ||
                b.bottom < -margin || b.top > checkHeight + margin) {
                outOfBounds.push({
                    elementId: elem.id,
                    elementType: elem.type,
                    bounds: b,
                    reason: "完全在画板外"
                });
            }
            // 部分在画板外
            else if (b.left < -margin || b.right > checkWidth + margin ||
                     b.top < -margin || b.bottom > checkHeight + margin) {
                partiallyVisible.push({
                    elementId: elem.id,
                    elementType: elem.type,
                    bounds: b
                });
            }
            // 完全在画板内
            else {
                fullyVisible++;
            }
        }
        
        return {
            valid: outOfBounds.length === 0,
            outOfBounds: outOfBounds,
            partiallyVisible: partiallyVisible,
            fullyVisible: fullyVisible,
            artboardSize: { width: checkWidth, height: checkHeight }
        };
    },
    
    // 完整性检查汇总
    runAll: function(structure) {
        var doc = structure.document || {};
        var elements = structure.elements || [];
        
        return {
            idCheck: this.checkIdUniqueness(elements),
            hierarchyCheck: this.checkHierarchy(elements),
            boundsCheck: this.checkBounds(elements, doc.width || 1000, doc.height || 1000),
            timestamp: new Date().toISOString()
        };
    }
};
