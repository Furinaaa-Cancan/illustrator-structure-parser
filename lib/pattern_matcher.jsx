/**
 * AI 模板结构解析器 v3.1 - 模式匹配器
 * 
 * 功能：识别复合模式（嘉宾卡片、联系信息块等）
 * 将多个相关元素组织为可批量替换的单元
 */

// ===== 模式定义 =====

var COMPOSITE_PATTERNS = {
    // ===== 人物类 =====
    
    // 嘉宾卡片：头像 + 人名 + 职位
    GUEST_CARD: {
        id: "guest",
        label: "嘉宾卡片",
        category: "person",
        required: ["avatar", "name"],
        optional: ["title", "desc", "company"],
        repeatable: true,
        layout: "vertical",
        maxSpacing: 100
    },
    
    // 团队成员卡片（无头像）
    TEAM_MEMBER: {
        id: "member",
        label: "团队成员",
        category: "person",
        required: ["name", "title"],
        optional: ["desc", "phone", "email"],
        repeatable: true
    },
    
    // 证言/评价卡片
    TESTIMONIAL: {
        id: "testimonial",
        label: "用户评价",
        category: "person",
        required: ["text", "name"],
        optional: ["avatar", "title", "company"],
        repeatable: true
    },
    
    // ===== 活动类 =====
    
    // 活动头部
    EVENT_HEADER: {
        id: "header",
        label: "活动头部",
        category: "event",
        required: ["event_title"],
        optional: ["date", "slogan", "logo"],
        repeatable: false,
        zoneHint: "header"
    },
    
    // 议程/日程项
    AGENDA_ITEM: {
        id: "agenda",
        label: "议程项",
        category: "event",
        required: ["time", "text"],
        optional: ["name", "title"],
        repeatable: true,
        layout: "horizontal"
    },
    
    // 时间地点块
    TIME_LOCATION: {
        id: "schedule",
        label: "时间地点",
        category: "event",
        required: ["date"],
        optional: ["time", "address", "qrcode"],
        repeatable: false
    },
    
    // ===== 产品/服务类 =====
    
    // 价格卡片
    PRICE_CARD: {
        id: "price",
        label: "价格卡片",
        category: "product",
        required: ["price"],
        optional: ["text", "desc", "percent"],
        repeatable: true
    },
    
    // 特性/卖点项
    FEATURE_ITEM: {
        id: "feature",
        label: "特性项",
        category: "product",
        required: ["text"],
        optional: ["icon", "desc"],
        repeatable: true,
        layout: "horizontal"
    },
    
    // 产品卡片
    PRODUCT_CARD: {
        id: "product",
        label: "产品卡片",
        category: "product",
        required: ["photo", "text"],
        optional: ["price", "desc"],
        repeatable: true
    },
    
    // ===== 联系类 =====
    
    // 联系信息块
    CONTACT_BLOCK: {
        id: "contact",
        label: "联系信息",
        category: "contact",
        required: ["phone"],
        optional: ["email", "address", "wechat", "qq", "qrcode"],
        repeatable: false,
        minFields: 2,
        zoneHint: "footer"
    },
    
    // 社交媒体组
    SOCIAL_LINKS: {
        id: "social",
        label: "社交媒体",
        category: "contact",
        required: ["icon"],
        optional: ["text"],
        repeatable: true,
        minCount: 2
    },
    
    // ===== 布局类 =====
    
    // 数据统计项
    STAT_ITEM: {
        id: "stat",
        label: "数据统计",
        category: "layout",
        required: ["number"],
        optional: ["text", "percent"],
        repeatable: true
    },
    
    // 步骤/流程项
    STEP_ITEM: {
        id: "step",
        label: "步骤项",
        category: "layout",
        required: ["number", "text"],
        optional: ["icon", "desc"],
        repeatable: true,
        layout: "horizontal"
    },
    
    // 列表项
    LIST_ITEM: {
        id: "list",
        label: "列表项",
        category: "layout",
        required: ["text"],
        optional: ["icon"],
        repeatable: true
    },
    
    // 品牌展示
    BRAND_SHOWCASE: {
        id: "brand",
        label: "品牌展示",
        category: "layout",
        required: ["logo"],
        optional: ["text"],
        repeatable: true,
        minCount: 3
    }
};

// ===== 模式匹配器 =====

var PatternMatcher = {
    // 匹配所有模式
    matchAll: function(elements) {
        var results = {
            patterns: [],
            unmatched: [],
            summary: {}
        };
        
        // 1. 构建元素索引
        var elemIndex = this.buildIndex(elements);
        
        // 2. 找出所有 Group 元素
        var groups = this.findGroups(elements);
        
        // 3. 对每个 Group 尝试匹配模式
        for (var i = 0; i < groups.length; i++) {
            var group = groups[i];
            var children = this.getGroupChildren(elements, group.id);
            var childTags = this.extractTags(children);
            
            var matched = this.matchPattern(group, childTags, children);
            if (matched) {
                results.patterns.push(matched);
            }
        }
        
        // 4. 检测重复模式（如多个嘉宾卡片）
        results.patterns = this.detectRepeatablePatterns(results.patterns);
        
        // 5. 生成摘要
        results.summary = this.generateSummary(results.patterns);
        
        return results;
    },
    
    // 构建元素索引
    buildIndex: function(elements) {
        var index = {};
        for (var i = 0; i < elements.length; i++) {
            index[elements[i].id] = elements[i];
        }
        return index;
    },
    
    // 找出所有 Group 元素
    findGroups: function(elements) {
        var groups = [];
        for (var i = 0; i < elements.length; i++) {
            if (elements[i].type === "group" || elements[i].type === "clip_group") {
                groups.push(elements[i]);
            }
        }
        return groups;
    },
    
    // 获取 Group 的子元素
    getGroupChildren: function(elements, groupId) {
        var children = [];
        for (var i = 0; i < elements.length; i++) {
            if (elements[i].parentId === groupId) {
                children.push(elements[i]);
            }
        }
        return children;
    },
    
    // 提取子元素的变量标签（兼容 V1 和 V2 格式）
    extractTags: function(children) {
        var tags = {};
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (!child.variable) continue;
            
            // 兼容两种格式：
            // V1: variable.variableType.key
            // V2: variable.primaryType
            var type = child.variable.primaryType || 
                       (child.variable.variableType && child.variable.variableType.key);
            
            if (!type) continue;
            
            if (!tags[type]) tags[type] = [];
            tags[type].push({
                elementId: child.id,
                type: type,
                value: child.content || child.name || "",
                position: child.position,
                size: child.size
            });
        }
        return tags;
    },
    
    // 匹配单个 Group 到模式
    matchPattern: function(group, childTags, children) {
        for (var patternKey in COMPOSITE_PATTERNS) {
            var pattern = COMPOSITE_PATTERNS[patternKey];
            
            // 检查必需字段
            var hasAllRequired = true;
            for (var r = 0; r < pattern.required.length; r++) {
                var reqField = pattern.required[r];
                if (!childTags[reqField] || childTags[reqField].length === 0) {
                    hasAllRequired = false;
                    break;
                }
            }
            
            if (!hasAllRequired) continue;
            
            // 检查可选字段（至少有一个或满足 minFields）
            var optionalCount = 0;
            for (var o = 0; o < pattern.optional.length; o++) {
                if (childTags[pattern.optional[o]]) optionalCount++;
            }
            
            if (pattern.minFields && (pattern.required.length + optionalCount) < pattern.minFields) {
                continue;
            }
            
            // 匹配成功，构建结果
            var fields = {};
            
            // 添加必需字段
            for (var r = 0; r < pattern.required.length; r++) {
                var reqField = pattern.required[r];
                fields[reqField] = childTags[reqField][0];  // 取第一个
            }
            
            // 添加可选字段
            for (var o = 0; o < pattern.optional.length; o++) {
                var optField = pattern.optional[o];
                if (childTags[optField]) {
                    fields[optField] = childTags[optField][0];
                }
            }
            
            return {
                patternId: pattern.id,
                patternLabel: pattern.label,
                groupId: group.id,
                groupPath: group.path,
                position: group.position,
                size: group.size,
                fields: fields,
                repeatable: pattern.repeatable,
                repeatIndex: 0  // 稍后更新
            };
        }
        
        return null;
    },
    
    // 检测重复模式并分配索引
    detectRepeatablePatterns: function(patterns) {
        var byType = {};
        
        // 按类型分组
        for (var i = 0; i < patterns.length; i++) {
            var p = patterns[i];
            if (!byType[p.patternId]) byType[p.patternId] = [];
            byType[p.patternId].push(p);
        }
        
        // 为重复模式分配索引
        for (var type in byType) {
            var group = byType[type];
            if (group.length > 1) {
                // 按位置排序（从上到下，从左到右）
                group.sort(function(a, b) {
                    var yDiff = a.position.y - b.position.y;
                    if (Math.abs(yDiff) > 20) return yDiff;
                    return a.position.x - b.position.x;
                });
                
                for (var i = 0; i < group.length; i++) {
                    group[i].repeatIndex = i;
                    group[i].repeatTotal = group.length;
                }
            }
        }
        
        return patterns;
    },
    
    // 生成匹配摘要
    generateSummary: function(patterns) {
        var summary = {
            totalPatterns: patterns.length,
            byType: {},
            byCategory: {}
        };
        
        for (var i = 0; i < patterns.length; i++) {
            var p = patterns[i];
            summary.byType[p.patternId] = (summary.byType[p.patternId] || 0) + 1;
            if (p.category) {
                summary.byCategory[p.category] = (summary.byCategory[p.category] || 0) + 1;
            }
        }
        
        return summary;
    },
    
    // 计算模式匹配置信度
    calculateConfidence: function(pattern, childTags, children) {
        var score = 0;
        var maxScore = 0;
        
        // 必需字段权重 = 2
        for (var r = 0; r < pattern.required.length; r++) {
            maxScore += 2;
            if (childTags[pattern.required[r]]) score += 2;
        }
        
        // 可选字段权重 = 1
        for (var o = 0; o < pattern.optional.length; o++) {
            maxScore += 1;
            if (childTags[pattern.optional[o]]) score += 1;
        }
        
        // 布局匹配加分
        if (pattern.layout && this.checkLayout(children, pattern.layout)) {
            score += 1;
            maxScore += 1;
        }
        
        return maxScore > 0 ? Math.round(score / maxScore * 100) / 100 : 0;
    },
    
    // 检查元素布局
    checkLayout: function(children, expectedLayout) {
        if (children.length < 2) return true;
        
        // 计算元素位置分布
        var xPositions = [];
        var yPositions = [];
        
        for (var i = 0; i < children.length; i++) {
            if (children[i].position) {
                xPositions.push(children[i].position.x);
                yPositions.push(children[i].position.y);
            }
        }
        
        if (xPositions.length < 2) return true;
        
        // 计算位置方差
        var xVariance = this.variance(xPositions);
        var yVariance = this.variance(yPositions);
        
        if (expectedLayout === "vertical") {
            // 垂直布局：Y方差大，X方差小
            return yVariance > xVariance;
        } else if (expectedLayout === "horizontal") {
            // 水平布局：X方差大，Y方差小
            return xVariance > yVariance;
        }
        
        return true;
    },
    
    // 计算方差
    variance: function(arr) {
        if (arr.length < 2) return 0;
        var mean = 0;
        for (var i = 0; i < arr.length; i++) mean += arr[i];
        mean /= arr.length;
        
        var sumSq = 0;
        for (var i = 0; i < arr.length; i++) {
            sumSq += (arr[i] - mean) * (arr[i] - mean);
        }
        return sumSq / arr.length;
    },
    
    // 检测相邻元素组（非 Group 的情况）
    detectAdjacentPatterns: function(elements) {
        var adjacentPatterns = [];
        var docHeight = 2000;  // 默认文档高度
        
        // 按位置分组相邻元素
        var sorted = elements.slice().sort(function(a, b) {
            if (!a.position || !b.position) return 0;
            return a.position.y - b.position.y;
        });
        
        // 检测相邻的同类型元素
        var currentGroup = [];
        var lastY = null;
        var threshold = 150;  // 间距阈值
        
        for (var i = 0; i < sorted.length; i++) {
            var elem = sorted[i];
            if (!elem.position) continue;
            
            if (lastY !== null && Math.abs(elem.position.y - lastY) > threshold) {
                // 新组
                if (currentGroup.length >= 2) {
                    var pattern = this.tryMatchAdjacentGroup(currentGroup);
                    if (pattern) adjacentPatterns.push(pattern);
                }
                currentGroup = [];
            }
            
            currentGroup.push(elem);
            lastY = elem.position.y + (elem.size ? elem.size.height : 0);
        }
        
        // 处理最后一组
        if (currentGroup.length >= 2) {
            var pattern = this.tryMatchAdjacentGroup(currentGroup);
            if (pattern) adjacentPatterns.push(pattern);
        }
        
        return adjacentPatterns;
    },
    
    // 尝试匹配相邻元素组
    tryMatchAdjacentGroup: function(elements) {
        var childTags = this.extractTags(elements);
        
        for (var patternKey in COMPOSITE_PATTERNS) {
            var pattern = COMPOSITE_PATTERNS[patternKey];
            if (!pattern.repeatable) continue;
            
            // 检查必需字段
            var hasAllRequired = true;
            for (var r = 0; r < pattern.required.length; r++) {
                if (!childTags[pattern.required[r]]) {
                    hasAllRequired = false;
                    break;
                }
            }
            
            if (hasAllRequired) {
                return {
                    patternId: pattern.id,
                    patternLabel: pattern.label,
                    category: pattern.category,
                    isAdjacentGroup: true,
                    elementCount: elements.length,
                    confidence: this.calculateConfidence(pattern, childTags, elements)
                };
            }
        }
        
        return null;
    },
    
    // 为匹配的模式生成变量 ID
    generatePatternVariableIds: function(patterns) {
        var variables = [];
        
        for (var i = 0; i < patterns.length; i++) {
            var p = patterns[i];
            var prefix = p.repeatTotal > 1 
                ? p.patternId + "_" + p.repeatIndex 
                : p.patternId;
            
            for (var fieldName in p.fields) {
                var field = p.fields[fieldName];
                variables.push({
                    variableId: prefix + "." + fieldName,
                    patternId: p.patternId,
                    repeatIndex: p.repeatIndex,
                    fieldName: fieldName,
                    elementId: field.elementId,
                    currentValue: field.value
                });
            }
        }
        
        return variables;
    }
};

// 导出
if (typeof exports !== "undefined") {
    exports.PatternMatcher = PatternMatcher;
    exports.COMPOSITE_PATTERNS = COMPOSITE_PATTERNS;
}
