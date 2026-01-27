/**
 * AI 模板结构解析器 v3.1 - 变量检测模块 (增强版)
 * 
 * 改进点：
 * 1. 多标签检测：返回所有匹配的类型标签，不再只返回第一个
 * 2. 统一变量命名：使用语义路径命名 (如 guest_0.name)
 * 3. 上下文分组：识别复合模式（嘉宾卡片等）
 */

// ===== 变量类型定义 =====

var VAR_TYPES = {
    // 人员信息
    PERSON_NAME:  { key: "name",   category: "person",  label: "人名",     priority: 1 },
    PERSON_TITLE: { key: "title",  category: "person",  label: "职位",     priority: 2 },
    PERSON_DESC:  { key: "desc",   category: "person",  label: "人物描述", priority: 3 },
    
    // 时间信息
    DATE:     { key: "date",     category: "time", label: "日期",     priority: 1 },
    TIME:     { key: "time",     category: "time", label: "时间",     priority: 2 },
    DATETIME: { key: "datetime", category: "time", label: "日期时间", priority: 1 },
    
    // 活动信息
    EVENT_TITLE: { key: "event_title", category: "event", label: "活动标题", priority: 1 },
    SLOGAN:      { key: "slogan",      category: "event", label: "口号标语", priority: 2 },
    
    // 联系信息
    PHONE:   { key: "phone",   category: "contact", label: "电话", priority: 1 },
    EMAIL:   { key: "email",   category: "contact", label: "邮箱", priority: 1 },
    ADDRESS: { key: "address", category: "contact", label: "地址", priority: 2 },
    WECHAT:  { key: "wechat",  category: "contact", label: "微信", priority: 2 },
    
    // 数值信息
    PRICE:   { key: "price",   category: "number", label: "价格", priority: 1 },
    PERCENT: { key: "percent", category: "number", label: "百分比", priority: 2 },
    
    // 图片类型
    AVATAR:  { key: "avatar",  category: "image", label: "头像",   priority: 1 },
    PHOTO:   { key: "photo",   category: "image", label: "照片",   priority: 2 },
    LOGO:    { key: "logo",    category: "image", label: "Logo",   priority: 1 },
    BANNER:  { key: "banner",  category: "image", label: "横幅图", priority: 2 },
    QRCODE:  { key: "qrcode",  category: "image", label: "二维码", priority: 1 },
    
    // 通用
    TEXT:  { key: "text",  category: "generic", label: "文本", priority: 3 },
    IMAGE: { key: "image", category: "generic", label: "图片", priority: 3 }
};

// ===== 复合模式定义 =====

var PATTERNS = {
    GUEST_CARD: {
        name: "guest",
        label: "嘉宾卡片",
        required: ["avatar", "name"],
        optional: ["title", "desc"],
        repeatable: true
    },
    CONTACT_BLOCK: {
        name: "contact",
        label: "联系信息",
        required: ["phone"],
        optional: ["email", "address", "wechat"],
        repeatable: false
    },
    EVENT_HEADER: {
        name: "header",
        label: "活动头部",
        required: ["event_title"],
        optional: ["date", "slogan"],
        repeatable: false
    }
};

// ===== 多标签检测器 =====

var MultiTagDetector = {
    rules: null,
    
    // 初始化规则
    init: function() {
        if (this.compiledRegex) return this;
        
        this.rules = {
            // 日期规则
            date: [
                { pattern: "^\\d{4}[\\-./]\\d{1,2}[\\-./]\\d{1,2}$", confidence: 0.95 },
                { pattern: "^\\d{4}年\\d{1,2}月\\d{1,2}日?$", confidence: 0.95 },
                { pattern: "\\d{1,2}月\\d{1,2}日", confidence: 0.85 }
            ],
            // 时间规则
            time: [
                { pattern: "^\\d{1,2}:\\d{2}(:\\d{2})?$", confidence: 0.9 },
                { pattern: "\\d{1,2}:\\d{2}\\s*[-~至]\\s*\\d{1,2}:\\d{2}", confidence: 0.9 }
            ],
            // 电话规则
            phone: [
                { pattern: "1[3-9]\\d{9}", confidence: 0.95 },
                { pattern: "0\\d{2,3}[-\\s]?\\d{7,8}", confidence: 0.9 }
            ],
            // 邮箱规则
            email: [
                { pattern: "[\\w.-]+@[\\w.-]+\\.\\w+", confidence: 0.95 }
            ],
            // 价格规则
            price: [
                { pattern: "[¥￥$€]\\s*[\\d,]+(\\.\\d{1,2})?", confidence: 0.9 },
                { pattern: "[\\d,]+\\s*元", confidence: 0.85 }
            ],
            // 百分比规则
            percent: [
                { pattern: "\\d+(\\.\\d+)?\\s*%", confidence: 0.9 }
            ],
            // 职位规则
            title: [
                { pattern: "创始人|CEO|CTO|COO|CFO|总裁|董事|总监|经理|主任", confidence: 0.85 },
                { pattern: "教授|博士|院士|专家|顾问|讲师", confidence: 0.8 },
                { pattern: "嘉宾|主持人|演讲者|评委|主编", confidence: 0.8 }
            ],
            // 微信规则
            wechat: [
                { pattern: "微信[:：]?\\s*\\w+", confidence: 0.9 }
            ],
            // 地址规则
            address: [
                { pattern: "省|市|区|县|街道|路|号|楼|室|大厦|广场", confidence: 0.75 }
            ]
        };
        
        // 预编译常用正则（避免动态编译）
        this.compiledRegex = {
            date: /\d{4}[.\-\/年]\d{1,2}[.\-\/月]\d{1,2}/,
            time: /\d{1,2}:\d{2}/,
            phone: /1[3-9]\d{9}/,
            email: /[\w.-]+@[\w.-]+\.\w+/,
            price: /[¥￥$€]\s*[\d,]+/,
            percent: /\d+(\.\d+)?\s*%/,
            title: /创始人|CEO|CTO|COO|CFO|总裁|董事|总监|经理|主任|教授|博士|院士|专家|顾问/,
            wechat: /微信[:：]?\s*\w+/,
            address: /省|市|区|县|街道|路|号|楼|室|大厦|广场/
        };
        
        return this;
    },
    
    // 检测文本，返回所有匹配的标签
    detectText: function(content) {
        if (!content || content.length === 0) return { tags: [], primaryType: null };
        
        if (!this.compiledRegex) this.init();
        var trimmed = content.replace(/^\s+|\s+$/g, "");
        var tags = [];
        
        // 使用预编译正则匹配
        if (this.compiledRegex.date.test(trimmed)) {
            tags.push({ type: "date", varType: VAR_TYPES.DATE, confidence: 0.95 });
        }
        if (this.compiledRegex.time.test(trimmed)) {
            tags.push({ type: "time", varType: VAR_TYPES.TIME, confidence: 0.9 });
        }
        if (this.compiledRegex.phone.test(trimmed)) {
            tags.push({ type: "phone", varType: VAR_TYPES.PHONE, confidence: 0.95 });
        }
        if (this.compiledRegex.email.test(trimmed)) {
            tags.push({ type: "email", varType: VAR_TYPES.EMAIL, confidence: 0.95 });
        }
        if (this.compiledRegex.price.test(trimmed)) {
            tags.push({ type: "price", varType: VAR_TYPES.PRICE, confidence: 0.9 });
        }
        if (this.compiledRegex.percent.test(trimmed)) {
            tags.push({ type: "percent", varType: VAR_TYPES.PERCENT, confidence: 0.9 });
        }
        if (this.compiledRegex.title.test(trimmed)) {
            tags.push({ type: "title", varType: VAR_TYPES.PERSON_TITLE, confidence: 0.85 });
        }
        if (this.compiledRegex.wechat.test(trimmed)) {
            tags.push({ type: "wechat", varType: VAR_TYPES.WECHAT, confidence: 0.9 });
        }
        if (this.compiledRegex.address.test(trimmed)) {
            tags.push({ type: "address", varType: VAR_TYPES.ADDRESS, confidence: 0.75 });
        }
        
        // 2. 人名检测（特殊处理）
        if (this.isChineseName(trimmed)) {
            tags.push({
                type: "name",
                varType: VAR_TYPES.PERSON_NAME,
                confidence: 0.85
            });
        }
        
        // 3. 活动标题检测
        if (this.isEventTitle(trimmed)) {
            tags.push({
                type: "event_title",
                varType: VAR_TYPES.EVENT_TITLE,
                confidence: 0.85
            });
        }
        
        // 4. 口号/标语检测
        if (this.isSlogan(trimmed)) {
            tags.push({
                type: "slogan",
                varType: VAR_TYPES.SLOGAN,
                confidence: 0.75
            });
        }
        
        // 5. 通用文本（兜底）
        if (tags.length === 0 && trimmed.length >= 2) {
            tags.push({
                type: "text",
                varType: VAR_TYPES.TEXT,
                confidence: trimmed.length > 50 ? 0.4 : 0.5
            });
        }
        
        // 按置信度排序
        tags.sort(function(a, b) { return b.confidence - a.confidence; });
        
        return {
            tags: tags,
            primaryType: tags.length > 0 ? tags[0].varType : null,
            allTypes: tags.map(function(t) { return t.type; }),
            maxConfidence: tags.length > 0 ? tags[0].confidence : 0
        };
    },
    
    // 获取变量类型
    getVarType: function(type) {
        var mapping = {
            "date": VAR_TYPES.DATE,
            "time": VAR_TYPES.TIME,
            "phone": VAR_TYPES.PHONE,
            "email": VAR_TYPES.EMAIL,
            "price": VAR_TYPES.PRICE,
            "percent": VAR_TYPES.PERCENT,
            "title": VAR_TYPES.PERSON_TITLE,
            "wechat": VAR_TYPES.WECHAT,
            "address": VAR_TYPES.ADDRESS,
            "name": VAR_TYPES.PERSON_NAME,
            "event_title": VAR_TYPES.EVENT_TITLE,
            "slogan": VAR_TYPES.SLOGAN
        };
        return mapping[type] || VAR_TYPES.TEXT;
    },
    
    // 检测中文人名
    isChineseName: function(str) {
        if (!str) return false;
        var cleaned = str.replace(/\s+/g, "");
        if (cleaned.length < 2 || cleaned.length > 4) return false;
        for (var i = 0; i < cleaned.length; i++) {
            var code = cleaned.charCodeAt(i);
            if (code < 0x4e00 || code > 0x9fa5) return false;
        }
        return true;
    },
    
    // 检测活动标题
    isEventTitle: function(str) {
        if (!str || str.length < 4) return false;
        var keywords = ["年会", "大会", "峰会", "论坛", "发布会", "颁奖", "典礼", 
                       "晚宴", "庆典", "仪式", "盛典", "活动", "会议", "展览", "展会"];
        for (var i = 0; i < keywords.length; i++) {
            if (str.indexOf(keywords[i]) >= 0) return true;
        }
        return false;
    },
    
    // 检测口号/标语
    isSlogan: function(str) {
        if (!str || str.length < 4 || str.length > 30) return false;
        var patterns = ["周年", "之夜", "荣耀", "同行", "共赢", "携手", "共创", "未来"];
        for (var i = 0; i < patterns.length; i++) {
            if (str.indexOf(patterns[i]) >= 0) return true;
        }
        if (str.indexOf("第") >= 0 && str.indexOf("届") >= 0) return true;
        return false;
    },
    
    // 检测图片类型
    detectImage: function(width, height) {
        var tags = [];
        var ratio = width / (height || 1);
        
        // 头像（正方形，50-500px）
        if (ratio > 0.8 && ratio < 1.2 && width >= 50 && width <= 500) {
            tags.push({ type: "avatar", varType: VAR_TYPES.AVATAR, confidence: 0.85 });
        }
        
        // 二维码（正方形，80-300px）
        if (ratio > 0.95 && ratio < 1.05 && width >= 80 && width <= 300) {
            tags.push({ type: "qrcode", varType: VAR_TYPES.QRCODE, confidence: 0.8 });
        }
        
        // Logo（较小）
        if (width < 300 && height < 150) {
            tags.push({ type: "logo", varType: VAR_TYPES.LOGO, confidence: 0.6 });
        }
        
        // 横幅（宽高比 > 2.5）
        if (ratio > 2.5 && width > 400) {
            tags.push({ type: "banner", varType: VAR_TYPES.BANNER, confidence: 0.85 });
        }
        
        // 照片（较大）
        if (width > 200 && height > 200) {
            tags.push({ type: "photo", varType: VAR_TYPES.PHOTO, confidence: 0.6 });
        }
        
        // 兜底
        if (tags.length === 0) {
            tags.push({ type: "image", varType: VAR_TYPES.IMAGE, confidence: 0.5 });
        }
        
        tags.sort(function(a, b) { return b.confidence - a.confidence; });
        
        return {
            tags: tags,
            primaryType: tags[0].varType,
            allTypes: tags.map(function(t) { return t.type; })
        };
    },
    
    // 检测形状类型
    detectShape: function(width, height, name) {
        var ratio = width / (height || 1);
        var shapeType = "shape";
        var label = "形状";
        var confidence = 0.5;
        
        // 根据名称判断
        if (name && /bg|背景|background/i.test(name)) {
            shapeType = "bg_shape";
            label = "背景形状";
            confidence = 0.7;
        } else if (name && /circle|圆|圈/i.test(name)) {
            shapeType = "circle";
            label = "圆形";
            confidence = 0.7;
        } else if (name && /line|线|分割/i.test(name)) {
            shapeType = "line";
            label = "线条";
            confidence = 0.7;
        }
        // 根据尺寸判断
        else if (ratio > 0.9 && ratio < 1.1 && width < 200) {
            shapeType = "circle";
            label = "圆形";
            confidence = 0.6;
        } else if (ratio > 10 || ratio < 0.1) {
            shapeType = "line";
            label = "线条";
            confidence = 0.6;
        } else if (width > 500 && height > 500) {
            shapeType = "bg_shape";
            label = "背景形状";
            confidence = 0.6;
        }
        
        return {
            tags: [{ type: shapeType, confidence: confidence }],
            primaryType: { key: shapeType, label: label, category: "shape", priority: 2 },
            allTypes: [shapeType],
            maxConfidence: confidence
        };
    }
};

// ===== 变量命名器 =====

var VariableNamer = {
    counters: {},
    
    // 重置计数器
    reset: function() {
        this.counters = {};
    },
    
    // 生成语义路径名称
    // 格式: {pattern}_{index}.{field}
    // 例如: guest_0.name, guest_0.avatar, header.event_title
    generateId: function(patternName, fieldType, index) {
        if (patternName && index !== undefined) {
            // 复合模式：guest_0.name
            return patternName + "_" + index + "." + fieldType;
        } else if (patternName) {
            // 单例模式：header.event_title
            return patternName + "." + fieldType;
        } else {
            // 独立元素：text_0, image_1
            var key = fieldType || "item";
            this.counters[key] = (this.counters[key] || 0);
            var id = key + "_" + this.counters[key];
            this.counters[key]++;
            return id;
        }
    }
};

// ===== 增强版变量检测器 =====

var VariableDetectorV2 = {
    // 处理所有元素
    processElements: function(elements) {
        MultiTagDetector.init();
        VariableNamer.reset();
        
        var variables = [];
        var variableMap = {};
        var debugCount = { text: 0, image: 0, detected: 0, failed: 0 };
        
        if (!elements || !elements.length) {
            return { variables: [], variableMap: {}, totalVariables: 0, byType: {}, byCategory: {} };
        }
        
        for (var i = 0; i < elements.length; i++) {
            try {
                var elem = elements[i];
                if (!elem) continue;
                
                var detection = null;
                
                // 优先使用元素已有的 variable 字段（由 parsers.jsx 生成）
                if (elem.variable && (elem.variable.isVariable || elem.variable.variableKey)) {
                    debugCount.detected++;
                    var v = elem.variable;
                    var varType = v.variableType || {};
                    var varKey = v.variableKey || VariableNamer.generateId(null, varType.key || "unknown", null);
                    
                    var varInfo = {
                        elementId: elem.id,
                        elementPath: elem.path || "",
                        variableKey: varKey,
                        variableType: varType.key || "text",
                        variableLabel: varType.label || "文本",
                        suggestedName: v.suggestedName || "",
                        confidence: v.confidence || 0.5,
                        currentValue: v.originalContent || elem.content || elem.name || "",
                        position: elem.position,
                        size: elem.size
                    };
                    
                    variables.push(varInfo);
                    variableMap[varKey] = elem.id;
                    continue;
                }
                
                // 文本检测
                if (elem.type === "text" && elem.content) {
                    debugCount.text++;
                    detection = MultiTagDetector.detectText(elem.content);
                    if (!detection || !detection.primaryType) {
                        debugCount.failed++;
                    }
                }
                // 图片检测
                else if (elem.type === "image_embedded" || elem.type === "image_linked") {
                    debugCount.image++;
                    var w = elem.size ? elem.size.width : 0;
                    var h = elem.size ? elem.size.height : 0;
                    detection = MultiTagDetector.detectImage(w, h);
                    if (!detection || !detection.primaryType) {
                        debugCount.failed++;
                    }
                }
                // 路径/形状检测
                else if (elem.type === "path" || elem.type === "compound_path") {
                    var sw = elem.size ? elem.size.width : 0;
                    var sh = elem.size ? elem.size.height : 0;
                    detection = MultiTagDetector.detectShape(sw, sh, elem.name || "");
                }
                
                if (detection && detection.primaryType) {
                    debugCount.detected++;
                    var primaryType = detection.primaryType;
                    var varId = VariableNamer.generateId(null, primaryType.key, null);
                    
                    // 添加到元素
                    elem.variable = {
                        id: varId,
                        primaryType: primaryType.key,
                        primaryLabel: primaryType.label,
                        category: primaryType.category,
                        allTags: detection.allTypes,
                        confidence: detection.maxConfidence
                    };
                    elem.replaceable = true;
                    
                    // 添加到变量列表
                    var varInfo = {
                        elementId: elem.id,
                        elementPath: elem.path || "",
                        variableKey: varId,
                        variableType: primaryType.key,
                        variableLabel: primaryType.label,
                        suggestedName: "",
                        confidence: detection.maxConfidence,
                        currentValue: elem.content || elem.name || "",
                        position: elem.position,
                        size: elem.size
                    };
                    
                    variables.push(varInfo);
                    variableMap[varId] = elem.id;
                }
            } catch (e) {
                // 容错
            }
        }
        
        // 调试输出
        if (typeof $.writeln === "function") {
            $.writeln("[V2 Debug] text=" + debugCount.text + ", image=" + debugCount.image + ", detected=" + debugCount.detected + ", failed=" + debugCount.failed);
        }
        
        return {
            variables: variables,
            variableMap: variableMap,
            totalVariables: variables.length,
            byType: this.groupBy(variables, "variableType")
        };
    },
    
    // 分组辅助函数
    groupBy: function(arr, key) {
        var groups = {};
        for (var i = 0; i < arr.length; i++) {
            var val = arr[i][key];
            if (!groups[val]) groups[val] = [];
            groups[val].push(arr[i]);
        }
        return groups;
    },
    
    // 生成变量模板（供用户填充）
    generateTemplate: function(variables) {
        var template = {
            templateVersion: "1.0",
            generatedAt: new Date().toISOString(),
            fields: {}
        };
        
        // 按类别组织
        var byCategory = this.groupBy(variables, "category");
        
        for (var category in byCategory) {
            template.fields[category] = {};
            var items = byCategory[category];
            for (var i = 0; i < items.length; i++) {
                var v = items[i];
                template.fields[category][v.variableId] = {
                    type: v.primaryType,
                    label: v.primaryLabel,
                    defaultValue: v.currentValue,
                    elementId: v.elementId
                };
            }
        }
        
        return template;
    }
};

// 导出（保持向后兼容）
if (typeof VariableDetector === "undefined") {
    var VariableDetector = VariableDetectorV2;
}
