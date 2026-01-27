/**
 * AI 模板结构解析器 v3.0 - 工具模块
 * 包含：ID生成、坐标转换、颜色处理、JSON序列化
 */

// ===== ExtendScript Polyfills =====

// Date.prototype.toISOString polyfill（ExtendScript 不支持）
if (!Date.prototype.toISOString) {
    Date.prototype.toISOString = function() {
        function pad(n, len) {
            len = len || 2;
            var s = String(n);
            while (s.length < len) s = "0" + s;
            return s;
        }
        return this.getUTCFullYear() + "-" +
            pad(this.getUTCMonth() + 1) + "-" +
            pad(this.getUTCDate()) + "T" +
            pad(this.getUTCHours()) + ":" +
            pad(this.getUTCMinutes()) + ":" +
            pad(this.getUTCSeconds()) + "." +
            pad(this.getUTCMilliseconds(), 3) + "Z";
    };
}

// String.prototype.trim polyfill（ExtendScript 不支持）
if (!String.prototype.trim) {
    String.prototype.trim = function() {
        return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
    };
}

// Array.prototype.indexOf polyfill（ExtendScript 不支持）
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(searchElement, fromIndex) {
        var k;
        if (this == null) throw new TypeError();
        var len = this.length >>> 0;
        if (len === 0) return -1;
        var n = fromIndex | 0;
        if (n >= len) return -1;
        k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
        while (k < len) {
            if (k in this && this[k] === searchElement) return k;
            k++;
        }
        return -1;
    };
}

// Object.keys polyfill（ExtendScript 不支持）
if (!Object.keys) {
    Object.keys = function(obj) {
        var keys = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                keys.push(key);
            }
        }
        return keys;
    };
}

// ===== ID 生成器（稳定UUID）=====

var IdGenerator = {
    counters: {},
    
    // 基于内容哈希生成稳定ID
    generateStableId: function(item, context) {
        var hash = this.hashContent(item, context);
        var type = item.typename || "unknown";
        return type.toLowerCase() + "_" + hash;
    },
    
    // 简单哈希函数（ExtendScript兼容）
    hashContent: function(item, context) {
        var str = "";
        try {
            str += item.typename || "";
            str += "|" + Math.round(item.position[0]) + "," + Math.round(item.position[1]);
            str += "|" + Math.round(item.width) + "x" + Math.round(item.height);
            str += "|" + (context.layerIndex || 0);
            str += "|" + (context.path || "");
            if (item.typename === "TextFrame" && item.contents) {
                str += "|" + item.contents.substring(0, 20);
            }
        } catch (e) {}
        
        // DJB2 哈希
        var hash = 5381;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash & 0x7FFFFFFF;
        }
        return hash.toString(16);
    },
    
    // 递增ID（备用）
    generateSequentialId: function(type) {
        this.counters[type] = (this.counters[type] || 0) + 1;
        return type.toLowerCase() + "_" + this.counters[type];
    },
    
    reset: function() {
        this.counters = {};
    }
};

// ===== 坐标系统转换 =====

var CoordinateSystem = {
    docHeight: 0,
    docWidth: 0,
    origin: "top-left",
    unit: "px",
    
    // 画板信息（用于相对坐标计算）
    artboard: null,
    artboardLeft: 0,
    artboardTop: 0,
    artboardWidth: 0,
    artboardHeight: 0,
    
    // 是否使用画板相对坐标
    useArtboardRelative: true,
    
    init: function(doc, config) {
        this.docHeight = doc.height;
        this.docWidth = doc.width;
        this.origin = config.coordinates.origin;
        this.unit = config.coordinates.unit;
        this.useArtboardRelative = config.coordinates.artboardRelative !== false;
        
        // 获取活动画板信息
        try {
            var abIndex = doc.artboards.getActiveArtboardIndex();
            this.artboard = doc.artboards[abIndex];
            var rect = this.artboard.artboardRect;
            // AI 画板坐标: [left, top, right, bottom]，top > bottom
            this.artboardLeft = rect[0];
            this.artboardTop = rect[1];  // AI 中 top 是更大的 Y 值
            this.artboardWidth = rect[2] - rect[0];
            this.artboardHeight = rect[1] - rect[3];  // top - bottom
        } catch (e) {
            // 如果获取画板失败，使用文档尺寸
            this.artboardLeft = 0;
            this.artboardTop = 0;
            this.artboardWidth = doc.width;
            this.artboardHeight = doc.height;
        }
    },
    
    // 转换位置坐标（相对于画板左上角，Y轴向下为正）
    transformPosition: function(x, y) {
        var relX, relY;
        
        if (this.useArtboardRelative) {
            // 转换为相对于画板左上角的坐标
            // AI 原生: x 向右为正, y 向上为正（数值越大越往上）
            // 目标: x 向右为正, y 向下为正
            relX = x - this.artboardLeft;
            relY = this.artboardTop - y;  // 翻转 Y 轴并相对于画板顶部
        } else {
            // 原有逻辑：相对于文档
            relX = x;
            relY = this.origin === "top-left" ? -y : y;
        }
        
        return {
            x: this.round(relX),
            y: this.round(relY)
        };
    },
    
    // 转换边界框（相对于画板，Y轴向下为正）
    transformBounds: function(bounds) {
        // bounds: [left, top, right, bottom] (AI格式：top > bottom，Y向上为正)
        var aiLeft = bounds[0];
        var aiTop = bounds[1];      // AI 中较大的 Y 值
        var aiRight = bounds[2];
        var aiBottom = bounds[3];   // AI 中较小的 Y 值
        
        var width = aiRight - aiLeft;
        var height = aiTop - aiBottom;  // 在 AI 中 top > bottom
        
        if (this.useArtboardRelative) {
            // 相对于画板的坐标
            var relLeft = aiLeft - this.artboardLeft;
            var relTop = this.artboardTop - aiTop;    // 翻转: 画板顶部 - 元素顶部
            var relRight = aiRight - this.artboardLeft;
            var relBottom = this.artboardTop - aiBottom;
            
            return {
                left: this.round(relLeft),
                top: this.round(relTop),
                right: this.round(relRight),
                bottom: this.round(relBottom),
                width: this.round(width),
                height: this.round(height),
                // 额外信息：中心点
                centerX: this.round(relLeft + width / 2),
                centerY: this.round(relTop + height / 2)
            };
        }
        
        // 原有逻辑（不使用画板相对坐标）
        if (this.origin === "top-left") {
            return {
                left: this.round(aiLeft),
                top: this.round(-aiTop),
                right: this.round(aiRight),
                bottom: this.round(-aiBottom),
                width: this.round(width),
                height: this.round(height)
            };
        }
        
        return {
            left: this.round(aiLeft),
            top: this.round(aiTop),
            right: this.round(aiRight),
            bottom: this.round(aiBottom),
            width: this.round(width),
            height: this.round(Math.abs(height))
        };
    },
    
    round: function(num) {
        if (typeof num !== "number" || isNaN(num)) return 0;
        return Math.round(num * 100) / 100;
    },
    
    // 根据参考点计算位置
    getPositionByReference: function(item, refPoint) {
        var bounds = item.geometricBounds;
        var left = bounds[0];
        var top = bounds[1];
        var right = bounds[2];
        var bottom = bounds[3];
        var width = right - left;
        var height = Math.abs(top - bottom);
        
        var ref = CONFIG.referencePoints[refPoint] || CONFIG.referencePoints["top-left"];
        
        var x = left + width * ref.x;
        var y = top - height * ref.y;  // AI坐标Y向下为负
        
        return this.transformPosition(x, y);
    },
    
    // 获取画板信息（供外部使用）
    getArtboardInfo: function() {
        return {
            left: this.artboardLeft,
            top: this.artboardTop,
            width: this.artboardWidth,
            height: this.artboardHeight,
            useRelative: this.useArtboardRelative
        };
    },
    
    // 检查元素是否在画板范围内
    isInArtboard: function(bounds) {
        var transformed = this.transformBounds(bounds);
        return transformed.left >= -10 && 
               transformed.top >= -10 && 
               transformed.right <= this.artboardWidth + 10 && 
               transformed.bottom <= this.artboardHeight + 10;
    },
    
    // 计算元素相对于画板的覆盖率
    getArtboardCoverage: function(bounds) {
        var transformed = this.transformBounds(bounds);
        var elemArea = transformed.width * transformed.height;
        var artboardArea = this.artboardWidth * this.artboardHeight;
        return artboardArea > 0 ? (elemArea / artboardArea) : 0;
    }
};

// ===== 变换矩阵解析 =====

var TransformParser = {
    // 解析变换矩阵为可读值
    parse: function(matrix) {
        if (!matrix) return null;
        
        try {
            var a = matrix.mValueA;
            var b = matrix.mValueB;
            var c = matrix.mValueC;
            var d = matrix.mValueD;
            var tx = matrix.mValueTX;
            var ty = matrix.mValueTY;
            
            // 计算缩放
            var scaleX = Math.sqrt(a * a + b * b);
            var scaleY = Math.sqrt(c * c + d * d);
            
            // 计算旋转（弧度转角度）
            var rotation = Math.atan2(b, a) * (180 / Math.PI);
            
            // 计算倾斜
            var skewX = Math.atan2(c, d) * (180 / Math.PI);
            var skewY = Math.atan2(b, a) * (180 / Math.PI);
            
            return {
                // 原始矩阵
                matrix: {
                    a: this.round(a), b: this.round(b),
                    c: this.round(c), d: this.round(d),
                    tx: this.round(tx), ty: this.round(ty)
                },
                // 解析后的值
                translation: { x: this.round(tx), y: this.round(ty) },
                scale: { x: this.round(scaleX), y: this.round(scaleY) },
                rotation: this.round(rotation),
                skew: { x: this.round(skewX - rotation), y: 0 },
                // 是否有变换
                hasTransform: Math.abs(rotation) > 0.1 || 
                              Math.abs(scaleX - 1) > 0.01 || 
                              Math.abs(scaleY - 1) > 0.01
            };
        } catch (e) {
            return { error: e.message };
        }
    },
    
    round: function(num) {
        return Math.round(num * 1000) / 1000;
    }
};

// ===== 颜色处理 =====

var ColorProcessor = {
    // 提取完整颜色信息
    extract: function(color) {
        if (!color) return null;
        
        try {
            var type = color.typename;
            var info = { type: type };
            
            switch (type) {
                case "RGBColor":
                    info.rgb = { r: Math.round(color.red), g: Math.round(color.green), b: Math.round(color.blue) };
                    info.hex = this.rgbToHex(color.red, color.green, color.blue);
                    info.hsl = this.rgbToHsl(color.red, color.green, color.blue);
                    break;
                    
                case "CMYKColor":
                    info.cmyk = { c: this.round(color.cyan), m: this.round(color.magenta), y: this.round(color.yellow), k: this.round(color.black) };
                    // CMYK 转 RGB
                    var rgb = this.cmykToRgb(color.cyan, color.magenta, color.yellow, color.black);
                    info.rgb = rgb;
                    info.hex = this.rgbToHex(rgb.r, rgb.g, rgb.b);
                    break;
                    
                case "GrayColor":
                    info.gray = this.round(color.gray);
                    var g = Math.round(255 * (1 - color.gray / 100));
                    info.rgb = { r: g, g: g, b: g };
                    info.hex = this.rgbToHex(g, g, g);
                    break;
                    
                case "SpotColor":
                    info.spotName = color.spot ? color.spot.name : "未知";
                    info.tint = this.round(color.tint);
                    // 尝试获取专色的等效色
                    if (color.spot && color.spot.color) {
                        info.equivalent = this.extract(color.spot.color);
                    }
                    break;
                    
                case "GradientColor":
                    info.gradient = this.extractGradient(color);
                    break;
                    
                case "PatternColor":
                    info.patternName = color.pattern ? color.pattern.name : "未知";
                    break;
                    
                case "NoColor":
                    info.none = true;
                    break;
            }
            
            return info;
        } catch (e) {
            return { type: "error", message: e.message };
        }
    },
    
    // 提取渐变信息
    extractGradient: function(color) {
        try {
            var grad = color.gradient;
            if (!grad) return { name: "未知" };
            
            var stops = [];
            for (var i = 0; i < grad.gradientStops.length; i++) {
                var stop = grad.gradientStops[i];
                stops.push({
                    position: this.round(stop.rampPoint),
                    midPoint: this.round(stop.midPoint),
                    color: this.extract(stop.color),
                    opacity: this.round(stop.opacity)
                });
            }
            
            return {
                name: grad.name,
                type: grad.type.toString(),
                stops: stops
            };
        } catch (e) {
            return { error: e.message };
        }
    },
    
    rgbToHex: function(r, g, b) {
        var toHex = function(c) {
            var hex = Math.round(c).toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        };
        return "#" + toHex(r) + toHex(g) + toHex(b);
    },
    
    rgbToHsl: function(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0;
        } else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    },
    
    cmykToRgb: function(c, m, y, k) {
        c = c / 100; m = m / 100; y = y / 100; k = k / 100;
        return {
            r: Math.round(255 * (1 - c) * (1 - k)),
            g: Math.round(255 * (1 - m) * (1 - k)),
            b: Math.round(255 * (1 - y) * (1 - k))
        };
    },
    
    round: function(num) {
        return Math.round(num * 100) / 100;
    }
};

// ===== JSON 序列化（优化版）=====

var JsonSerializer = {
    // 递归序列化
    stringify: function(obj, depth) {
        depth = depth || 0;
        if (obj === null || obj === undefined) return "null";
        
        var type = typeof obj;
        
        if (type === "string") return '"' + this.escape(obj) + '"';
        if (type === "number") return isNaN(obj) ? "null" : String(obj);
        if (type === "boolean") return obj ? "true" : "false";
        
        var indent = this.indent(depth);
        var childIndent = this.indent(depth + 1);
        
        if (obj instanceof Array) {
            if (obj.length === 0) return "[]";
            var arrParts = [];
            for (var i = 0, len = obj.length; i < len; i++) {
                arrParts.push(childIndent + this.stringify(obj[i], depth + 1));
            }
            return "[\n" + arrParts.join(",\n") + "\n" + indent + "]";
        }
        
        if (type === "object") {
            var keys = [];
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) keys.push(key);
            }
            if (keys.length === 0) return "{}";
            
            var objParts = [];
            for (var k = 0, klen = keys.length; k < klen; k++) {
                var key = keys[k];
                var value = this.stringify(obj[key], depth + 1);
                objParts.push(childIndent + '"' + this.escape(key) + '": ' + value);
            }
            return "{\n" + objParts.join(",\n") + "\n" + indent + "}";
        }
        
        return "null";
    },
    
    escape: function(str) {
        if (!str) return "";
        var result = "";
        for (var i = 0, len = str.length; i < len; i++) {
            var c = str.charAt(i);
            var code = str.charCodeAt(i);
            if (c === '\\') result += '\\\\';
            else if (c === '"') result += '\\"';
            else if (code === 10) result += '\\n';
            else if (code === 13) result += '\\r';
            else if (code === 9) result += '\\t';
            else if (code < 32) continue;
            else result += c;
        }
        return result;
    },
    
    indent: function(depth) {
        var s = "";
        for (var i = 0; i < depth; i++) s += "  ";
        return s;
    }
};

// ===== 前缀解析器 =====

var PrefixParser = {
    // 解析元素名称中的前缀
    parse: function(name) {
        if (!name || name.length === 0) return null;
        
        for (var prefix in ELEMENT_PREFIXES) {
            if (name.indexOf(prefix) === 0) {
                var info = ELEMENT_PREFIXES[prefix];
                return {
                    prefix: prefix,
                    baseName: name.substring(prefix.length),
                    type: info.type,
                    replaceable: info.replaceable,
                    role: info.role
                };
            }
        }
        return null;
    },
    
    // 检查是否有前缀
    hasPrefix: function(name) {
        return this.parse(name) !== null;
    },
    
    // 获取所有已定义的前缀
    getAllPrefixes: function() {
        var prefixes = [];
        for (var p in ELEMENT_PREFIXES) {
            prefixes.push(p);
        }
        return prefixes;
    }
};

// ===== 日志系统 =====

var Logger = {
    logs: [],
    level: "info",  // "debug" | "info" | "warn" | "error"
    
    levels: { "debug": 0, "info": 1, "warn": 2, "error": 3 },
    
    log: function(level, message, data) {
        if (this.levels[level] < this.levels[this.level]) return;
        
        var entry = {
            time: new Date().toISOString(),
            level: level,
            message: message
        };
        if (data) entry.data = data;
        
        this.logs.push(entry);
    },
    
    debug: function(msg, data) { this.log("debug", msg, data); },
    info: function(msg, data) { this.log("info", msg, data); },
    warn: function(msg, data) { this.log("warn", msg, data); },
    error: function(msg, data) { this.log("error", msg, data); },
    
    getLogs: function() { return this.logs; },
    clear: function() { this.logs = []; },
    
    getErrors: function() {
        var errors = [];
        for (var i = 0; i < this.logs.length; i++) {
            if (this.logs[i].level === "error") {
                errors.push(this.logs[i]);
            }
        }
        return errors;
    }
};

// ===== 文件操作 =====

var FileUtils = {
    // 确保目录存在
    ensureDir: function(path) {
        var folder = new Folder(path);
        if (!folder.exists) {
            folder.create();
        }
        return folder.exists;
    },
    
    // 写入JSON文件
    writeJson: function(path, obj) {
        var json = JsonSerializer.stringify(obj, 0);
        var file = new File(path);
        file.encoding = "UTF-8";
        file.open("w");
        file.write(json);
        file.close();
        return file.exists;
    },
    
    // 追加写入（流式）
    appendLine: function(file, line) {
        file.writeln(line);
    }
};
