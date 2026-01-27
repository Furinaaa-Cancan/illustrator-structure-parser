/**
 * AI 模板结构解析器 v3.0 - 元素解析器模块
 * 每种元素类型的专用解析器
 */

// ===== 文本解析器 =====

var TextParser = {
    parse: function(tf, ctx, config) {
        var content = tf.contents || "";
        if (content.replace(/\s/g, "").length === 0) return null;
        
        // 边界检查：文本长度
        if (typeof BoundaryChecker !== "undefined") {
            var textCheck = BoundaryChecker.checkTextLength(content);
            if (!textCheck.valid) {
                content = textCheck.truncated;
                if (typeof Logger !== "undefined") {
                    Logger.warn("文本被截断", { original: textCheck.originalLength });
                }
            }
        }
        
        var elem = ElementFactory.createBase("text", tf, ctx);
        
        // 基础文本信息
        elem.content = content;
        elem.contentPreview = content.substring(0, 100);
        elem.characterCount = content.length;
        elem.lineCount = content.split(/\r|\n/).length;
        
        // 文本框类型
        elem.textType = this.getTextType(tf);
        
        // 主样式（第一个字符）
        elem.style = this.extractCharacterStyle(tf);
        
        // 多样式文本解析
        if (config.parse.extractTextRanges) {
            elem.textRanges = this.extractTextRanges(tf);
        }
        
        // 段落样式
        elem.paragraph = this.extractParagraphStyle(tf);
        
        // 语义分析
        elem.semantics = this.analyzeSemantics(content);
        
        return elem;
    },
    
    // 获取文本类型
    getTextType: function(tf) {
        try {
            var kind = tf.kind.toString();
            if (kind.indexOf("POINT") >= 0) return "point";
            if (kind.indexOf("AREA") >= 0) return "area";
            if (kind.indexOf("PATH") >= 0) return "path";
        } catch (e) {}
        return "unknown";
    },
    
    // 提取字符样式
    extractCharacterStyle: function(tf) {
        try {
            var attr = tf.textRange.characterAttributes;
            return {
                fontName: attr.textFont ? attr.textFont.name : "未知",
                fontFamily: attr.textFont ? attr.textFont.family : "未知",
                fontStyle: attr.textFont ? attr.textFont.style : "",
                fontSize: Math.round(attr.size * 100) / 100,
                fillColor: ColorProcessor.extract(attr.fillColor),
                strokeColor: ColorProcessor.extract(attr.strokeColor),
                strokeWidth: attr.strokeWeight || 0,
                tracking: attr.tracking || 0,
                leading: attr.leading || 0,
                baselineShift: attr.baselineShift || 0,
                horizontalScale: attr.horizontalScale || 100,
                verticalScale: attr.verticalScale || 100,
                rotation: attr.rotation || 0,
                underline: attr.underline || false,
                strikeThrough: attr.strikeThrough || false
            };
        } catch (e) {
            if (typeof ErrorHandler !== "undefined") {
                ErrorHandler.handle(ErrorCodes.E202_TEXT_PARSE, { method: "extractCharacterStyle" }, e);
            }
            return { error: e.message };
        }
    },
    
    // 提取多样式文本范围
    extractTextRanges: function(tf) {
        var ranges = [];
        try {
            var chars = tf.textRange.characters;
            if (chars.length === 0) return ranges;
            
            var currentStyle = null;
            var currentStart = 0;
            var currentText = "";
            
            for (var i = 0; i < chars.length; i++) {
                var ch = chars[i];
                var style = this.getStyleKey(ch.characterAttributes);
                
                if (style !== currentStyle && currentText.length > 0) {
                    ranges.push({
                        start: currentStart,
                        end: i,
                        text: currentText,
                        style: this.extractCharAttr(chars[currentStart].characterAttributes)
                    });
                    currentStart = i;
                    currentText = "";
                }
                currentStyle = style;
                currentText += ch.contents;
            }
            
            // 最后一段
            if (currentText.length > 0) {
                ranges.push({
                    start: currentStart,
                    end: chars.length,
                    text: currentText,
                    style: this.extractCharAttr(chars[currentStart].characterAttributes)
                });
            }
        } catch (e) {
            if (typeof ErrorHandler !== "undefined") {
                ErrorHandler.handle(ErrorCodes.E202_TEXT_PARSE, { method: "extractTextRanges" }, e);
            }
            ranges.push({ error: e.message });
        }
        
        return ranges;
    },
    
    // 获取样式键（用于比较）
    getStyleKey: function(attr) {
        try {
            return [
                attr.textFont ? attr.textFont.name : "",
                Math.round(attr.size),
                attr.fillColor ? attr.fillColor.typename : ""
            ].join("|");
        } catch (e) {
            return "";
        }
    },
    
    // 简化的字符属性提取
    extractCharAttr: function(attr) {
        try {
            return {
                font: attr.textFont ? attr.textFont.name : "未知",
                size: Math.round(attr.size),
                color: ColorProcessor.extract(attr.fillColor)
            };
        } catch (e) {
            return null;
        }
    },
    
    // 提取段落样式
    extractParagraphStyle: function(tf) {
        try {
            var attr = tf.textRange.paragraphAttributes;
            return {
                justification: attr.justification.toString().replace("Justification.", ""),
                firstLineIndent: Math.round(attr.firstLineIndent * 100) / 100,
                leftIndent: Math.round(attr.leftIndent * 100) / 100,
                rightIndent: Math.round(attr.rightIndent * 100) / 100,
                spaceBefore: Math.round(attr.spaceBefore * 100) / 100,
                spaceAfter: Math.round(attr.spaceAfter * 100) / 100,
                hyphenation: attr.hyphenation || false
            };
        } catch (e) {
            if (typeof ErrorHandler !== "undefined") {
                ErrorHandler.handle(ErrorCodes.E202_TEXT_PARSE, { method: "extractParagraphStyle" }, e);
            }
            return null;
        }
    },
    
    // 语义分析
    analyzeSemantics: function(content) {
        var result = {
            hints: [],
            role: "unknown",
            replaceable: false,
            confidence: 0,
            detectedPatterns: []
        };
        
        var rules = SEMANTIC_RULES.text;
        var trimmed = content.trim();
        
        // 人名检测
        if (rules.name.test(trimmed)) {
            result.hints.push("name");
            result.detectedPatterns.push({ type: "chinese_name", confidence: 0.85 });
            result.role = "person_name";
            result.replaceable = true;
            result.confidence = 0.85;
        }
        if (rules.englishName && rules.englishName.test(trimmed)) {
            result.hints.push("english_name");
            result.detectedPatterns.push({ type: "english_name", confidence: 0.8 });
            if (result.role === "unknown") {
                result.role = "person_name";
                result.replaceable = true;
                result.confidence = 0.8;
            }
        }
        
        // 日期时间检测
        if (rules.date.test(content)) {
            result.hints.push("date");
            result.detectedPatterns.push({ type: "date", confidence: 0.9 });
            if (result.role === "unknown") {
                result.role = "date";
                result.replaceable = true;
                result.confidence = 0.9;
            }
        }
        if (rules.chineseDate && rules.chineseDate.test(content)) {
            result.hints.push("chinese_date");
            result.detectedPatterns.push({ type: "chinese_date", confidence: 0.95 });
        }
        if (rules.time.test(content)) {
            result.hints.push("time");
            result.detectedPatterns.push({ type: "time", confidence: 0.9 });
        }
        if (rules.dateRange && rules.dateRange.test(content)) {
            result.hints.push("date_range");
            result.detectedPatterns.push({ type: "date_range", confidence: 0.85 });
        }
        
        // 联系方式检测
        if (rules.phone.test(content)) {
            result.hints.push("phone");
            result.detectedPatterns.push({ type: "mobile_phone", confidence: 0.95 });
            result.role = "contact";
            result.replaceable = true;
            result.confidence = 0.95;
        }
        if (rules.telephone && rules.telephone.test(content)) {
            result.hints.push("telephone");
            result.detectedPatterns.push({ type: "landline", confidence: 0.9 });
        }
        if (rules.email.test(content)) {
            result.hints.push("email");
            result.detectedPatterns.push({ type: "email", confidence: 0.95 });
            result.role = "contact";
            result.replaceable = true;
            result.confidence = 0.95;
        }
        if (rules.url.test(content)) {
            result.hints.push("url");
            result.detectedPatterns.push({ type: "url", confidence: 0.9 });
        }
        if (rules.wechat && rules.wechat.test(content)) {
            result.hints.push("wechat");
            result.detectedPatterns.push({ type: "wechat", confidence: 0.9 });
        }
        if (rules.qq && rules.qq.test(content)) {
            result.hints.push("qq");
            result.detectedPatterns.push({ type: "qq", confidence: 0.9 });
        }
        
        // 职位和身份
        if (rules.position.test(content)) {
            result.hints.push("position");
            result.detectedPatterns.push({ type: "job_title", confidence: 0.85 });
            result.role = "job_title";
            result.replaceable = true;
            result.confidence = 0.85;
        }
        if (rules.department && rules.department.test(content)) {
            result.hints.push("department");
            result.detectedPatterns.push({ type: "department", confidence: 0.8 });
        }
        
        // 地址
        if (rules.address && rules.address.test(content)) {
            result.hints.push("address");
            result.detectedPatterns.push({ type: "address", confidence: 0.75 });
            if (result.role === "unknown") {
                result.role = "address";
                result.replaceable = true;
                result.confidence = 0.75;
            }
        }
        
        // 金额和数字
        if (rules.price && rules.price.test(content)) {
            result.hints.push("price");
            result.detectedPatterns.push({ type: "price", confidence: 0.9 });
            if (result.role === "unknown") {
                result.role = "price";
                result.replaceable = true;
                result.confidence = 0.9;
            }
        }
        if (rules.percent && rules.percent.test(content)) {
            result.hints.push("percent");
            result.detectedPatterns.push({ type: "percentage", confidence: 0.85 });
        }
        
        // 标题和段落
        if (rules.title(trimmed)) {
            result.hints.push("title");
            if (result.role === "unknown") {
                result.role = "heading";
                result.confidence = 0.6;
            }
        }
        if (rules.slogan && rules.slogan(trimmed)) {
            result.hints.push("slogan");
            result.detectedPatterns.push({ type: "slogan", confidence: 0.7 });
        }
        if (rules.paragraph(content)) {
            result.hints.push("paragraph");
            result.role = "body_text";
            result.replaceable = true;
            result.confidence = 0.7;
        }
        
        // 特殊格式
        if (rules.hashtag && rules.hashtag.test(content)) {
            result.hints.push("hashtag");
            result.detectedPatterns.push({ type: "hashtag", confidence: 0.9 });
        }
        if (rules.serial && rules.serial.test(content)) {
            result.hints.push("serial");
            result.detectedPatterns.push({ type: "serial_number", confidence: 0.85 });
        }
        
        // 时效性和行动号召
        if (rules.deadline && rules.deadline.test(content)) {
            result.hints.push("deadline");
            result.detectedPatterns.push({ type: "time_sensitive", confidence: 0.8 });
        }
        if (rules.newTag && rules.newTag.test(content)) {
            result.hints.push("promotion");
            result.detectedPatterns.push({ type: "promotion_tag", confidence: 0.85 });
        }
        if (rules.cta && rules.cta.test(content)) {
            result.hints.push("cta");
            result.detectedPatterns.push({ type: "call_to_action", confidence: 0.8 });
        }
        
        return result;
    }
};

// ===== 图像解析器 =====

var ImageParser = {
    parseRaster: function(raster, ctx) {
        var elem = ElementFactory.createBase("image_embedded", raster, ctx);
        
        elem.imageType = "embedded";
        elem.colorSpace = raster.imageColorSpace ? raster.imageColorSpace.toString().replace("ImageColorSpace.", "") : "未知";
        elem.channels = raster.channels || 0;
        elem.transparent = raster.transparent || false;
        elem.overprint = raster.overprint || false;
        
        // 剪切组信息
        this.addClipInfo(elem, raster);
        
        // 图像尺寸分析
        elem.imageAnalysis = this.analyzeImage(elem.size.width, elem.size.height);
        
        return elem;
    },
    
    parsePlaced: function(placed, ctx) {
        var elem = ElementFactory.createBase("image_linked", placed, ctx);
        
        elem.imageType = "linked";
        elem.file = {
            name: placed.file ? placed.file.name : "未知",
            path: placed.file ? placed.file.fsName : "",
            exists: placed.file ? placed.file.exists : false,
            extension: placed.file ? this.getExtension(placed.file.name) : ""
        };
        
        // 剪切组信息
        this.addClipInfo(elem, placed);
        
        // 图像尺寸分析
        elem.imageAnalysis = this.analyzeImage(elem.size.width, elem.size.height);
        
        return elem;
    },
    
    addClipInfo: function(elem, item) {
        try {
            var parent = item.parent;
            elem.inClipGroup = (parent.typename === "GroupItem" && parent.clipped);
            if (elem.inClipGroup) {
                elem.clipBounds = this.getClipBounds(parent);
                // 实际可见区域
                elem.visibleBounds = elem.clipBounds;
            }
        } catch (e) {
            if (typeof ErrorHandler !== "undefined") {
                ErrorHandler.handle(ErrorCodes.E203_IMAGE_PARSE, { method: "checkClipGroup" }, e);
            }
            elem.inClipGroup = false;
        }
    },
    
    getClipBounds: function(group) {
        for (var i = 0; i < group.pageItems.length; i++) {
            var item = group.pageItems[i];
            if (item.typename === "PathItem" && item.clipping) {
                return CoordinateSystem.transformBounds(item.geometricBounds);
            }
        }
        return null;
    },
    
    getExtension: function(filename) {
        var parts = filename.split(".");
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
    },
    
    analyzeImage: function(w, h, docW, docH) {
        var rules = SEMANTIC_RULES.image;
        docW = docW || 1920;
        docH = docH || 1080;
        
        var result = {
            aspectRatio: h > 0 ? Math.round(w / h * 100) / 100 : 0,
            orientation: w > h ? "landscape" : (h > w ? "portrait" : "square"),
            role: "unknown",
            replaceable: true,
            confidence: 0,
            detectedTypes: [],
            sizeCategory: this.getSizeCategory(w, h, docW, docH)
        };
        
        // 人物类检测
        if (rules.avatar && rules.avatar(w, h)) {
            result.detectedTypes.push({ type: "avatar", confidence: 0.9 });
            result.role = "avatar";
            result.confidence = 0.9;
        }
        if (rules.headshot && rules.headshot(w, h)) {
            result.detectedTypes.push({ type: "headshot", confidence: 0.85 });
            if (result.role === "unknown") {
                result.role = "headshot";
                result.confidence = 0.85;
            }
        }
        if (rules.portrait(w, h)) {
            result.detectedTypes.push({ type: "portrait", confidence: 0.8 });
            if (result.role === "unknown") {
                result.role = "portrait";
                result.confidence = 0.8;
            }
        }
        
        // 布局类检测
        if (rules.banner && rules.banner(w, h)) {
            result.detectedTypes.push({ type: "banner", confidence: 0.9 });
            result.role = "banner";
            result.confidence = 0.9;
        }
        if (rules.square && rules.square(w, h)) {
            result.detectedTypes.push({ type: "square", confidence: 0.85 });
        }
        if (rules.landscape(w, h)) {
            result.detectedTypes.push({ type: "landscape", confidence: 0.7 });
        }
        
        // 大小类检测
        if (rules.smallIcon && rules.smallIcon(w, h)) {
            result.detectedTypes.push({ type: "small_icon", confidence: 0.95 });
            result.role = "small_icon";
            result.confidence = 0.95;
        } else if (rules.icon(w, h)) {
            result.detectedTypes.push({ type: "icon", confidence: 0.9 });
            if (result.role === "unknown") {
                result.role = "icon";
                result.confidence = 0.9;
            }
        }
        
        if (rules.logo(w, h)) {
            result.detectedTypes.push({ type: "logo", confidence: 0.7 });
            if (result.role === "unknown") {
                result.role = "logo";
                result.confidence = 0.7;
            }
        }
        
        if (rules.thumbnail && rules.thumbnail(w, h)) {
            result.detectedTypes.push({ type: "thumbnail", confidence: 0.75 });
        }
        
        if (rules.mainImage(w, h)) {
            result.detectedTypes.push({ type: "main_visual", confidence: 0.75 });
            if (result.role === "unknown") {
                result.role = "main_visual";
                result.confidence = 0.75;
            }
        }
        
        // 全宽检测
        if (rules.fullWidth && rules.fullWidth(w, h, docW)) {
            result.detectedTypes.push({ type: "full_width", confidence: 0.85 });
            result.isFullWidth = true;
        }
        
        // 特殊类型检测
        if (rules.qrcode && rules.qrcode(w, h)) {
            result.detectedTypes.push({ type: "qrcode", confidence: 0.85 });
            if (result.role === "unknown" || result.role === "icon") {
                result.role = "qrcode";
                result.confidence = 0.85;
            }
        }
        if (rules.barcode && rules.barcode(w, h)) {
            result.detectedTypes.push({ type: "barcode", confidence: 0.8 });
            result.role = "barcode";
            result.confidence = 0.8;
        }
        
        return result;
    },
    
    // 获取尺寸分类
    getSizeCategory: function(w, h, docW, docH) {
        var area = w * h;
        var docArea = docW * docH;
        var ratio = area / docArea;
        
        if (ratio > 0.5) return "dominant";
        if (ratio > 0.25) return "large";
        if (ratio > 0.1) return "medium";
        if (ratio > 0.02) return "small";
        return "tiny";
    }
};

// ===== 路径解析器 =====

var PathParser = {
    parse: function(pathItem, ctx, config) {
        // 过滤无意义路径
        if (!pathItem.clipping && !pathItem.stroked && !pathItem.filled) {
            return null;
        }
        
        var elem = ElementFactory.createBase("path", pathItem, ctx);
        
        elem.pathType = pathItem.clipping ? "clipping_mask" : "shape";
        elem.closed = pathItem.closed || false;
        elem.filled = pathItem.filled || false;
        elem.stroked = pathItem.stroked || false;
        
        // 边界检查：路径点数
        var pointCount = pathItem.pathPoints ? pathItem.pathPoints.length : 0;
        if (typeof BoundaryChecker !== "undefined" && !BoundaryChecker.checkPathPoints(pointCount)) {
            if (typeof Logger !== "undefined") {
                Logger.warn("路径点数过多，可能影响性能", { pointCount: pointCount });
            }
        }
        elem.pointCount = pointCount;
        elem.area = pathItem.area || 0;
        elem.length = pathItem.length || 0;
        
        // 样式
        if (config.parse.extractStyles) {
            if (pathItem.filled) {
                elem.fillColor = ColorProcessor.extract(pathItem.fillColor);
            }
            if (pathItem.stroked) {
                elem.strokeColor = ColorProcessor.extract(pathItem.strokeColor);
                elem.strokeWidth = Math.round(pathItem.strokeWidth * 100) / 100;
                elem.strokeCap = pathItem.strokeCap ? pathItem.strokeCap.toString() : "";
                elem.strokeJoin = pathItem.strokeJoin ? pathItem.strokeJoin.toString() : "";
                elem.strokeDashes = pathItem.strokeDashes || [];
            }
        }
        
        // 几何边界
        elem.geometricBounds = CoordinateSystem.transformBounds(pathItem.geometricBounds);
        
        // 形状识别
        elem.shapeAnalysis = this.analyzeShape(pathItem);
        
        return elem;
    },
    
    parseCompound: function(compound, ctx) {
        var elem = ElementFactory.createBase("compound_path", compound, ctx);
        elem.pathCount = compound.pathItems ? compound.pathItems.length : 0;
        return elem;
    },
    
    // 形状识别
    analyzeShape: function(pathItem) {
        var result = { shape: "unknown", confidence: 0 };
        
        try {
            var points = pathItem.pathPoints.length;
            var closed = pathItem.closed;
            var w = pathItem.width;
            var h = pathItem.height;
            
            if (closed && points === 4) {
                var ratio = w / h;
                if (ratio > 0.9 && ratio < 1.1) {
                    result.shape = "square";
                    result.confidence = 0.8;
                } else {
                    result.shape = "rectangle";
                    result.confidence = 0.8;
                }
            } else if (closed && points >= 8 && Math.abs(w - h) < 5) {
                result.shape = "circle";
                result.confidence = 0.7;
            } else if (!closed && points === 2) {
                result.shape = "line";
                result.confidence = 0.9;
            }
        } catch (e) {}
        
        return result;
    }
};

// ===== 组解析器 =====

var GroupParser = {
    parse: function(group, ctx) {
        var elem = ElementFactory.createBase("group", group, ctx);
        
        elem.clipped = group.clipped || false;
        elem.itemCount = group.pageItems.length;
        
        // 剪切蒙版组
        if (group.clipped) {
            elem.type = "clip_group";
            elem.clipInfo = this.parseClipInfo(group);
            elem.clipBounds = elem.clipInfo ? elem.clipInfo.clipBounds : null;
        }
        
        // 组内容分析
        elem.childrenSummary = this.analyzeChildren(group);
        
        // 组的语义角色推断
        elem.groupRole = this.inferGroupRole(group, elem.childrenSummary, ctx);
        
        return elem;
    },
    
    // 解析剪切蒙版信息
    parseClipInfo: function(group) {
        var clipInfo = {
            hasClipMask: false,
            clipBounds: null,
            clipPathType: null,
            maskedItemCount: 0
        };
        
        try {
            for (var i = 0; i < group.pageItems.length; i++) {
                var item = group.pageItems[i];
                if (item.typename === "PathItem" && item.clipping) {
                    clipInfo.hasClipMask = true;
                    clipInfo.clipBounds = CoordinateSystem.transformBounds(item.geometricBounds);
                    clipInfo.clipPathType = this.getPathShape(item);
                    clipInfo.maskedItemCount = group.pageItems.length - 1;
                    break;
                }
                // 复合路径也可以作为剪切蒙版
                if (item.typename === "CompoundPathItem" && item.clipping) {
                    clipInfo.hasClipMask = true;
                    clipInfo.clipBounds = CoordinateSystem.transformBounds(item.geometricBounds);
                    clipInfo.clipPathType = "compound";
                    clipInfo.maskedItemCount = group.pageItems.length - 1;
                    break;
                }
            }
        } catch (e) {
            if (typeof ErrorHandler !== "undefined") {
                ErrorHandler.handle(ErrorCodes.E200_ELEMENT_ACCESS, { method: "parseClipInfo" }, e);
            }
        }
        
        return clipInfo;
    },
    
    // 分析组内子元素
    analyzeChildren: function(group) {
        var summary = {
            total: 0,
            byType: {},
            hasText: false,
            hasImage: false,
            hasPath: false,
            hasNestedGroup: false,
            textCount: 0,
            imageCount: 0
        };
        
        try {
            summary.total = group.pageItems.length;
            
            for (var i = 0; i < group.pageItems.length; i++) {
                var item = group.pageItems[i];
                var tn = item.typename;
                
                summary.byType[tn] = (summary.byType[tn] || 0) + 1;
                
                if (tn === "TextFrame") {
                    summary.hasText = true;
                    summary.textCount++;
                }
                if (tn === "RasterItem" || tn === "PlacedItem") {
                    summary.hasImage = true;
                    summary.imageCount++;
                }
                if (tn === "PathItem" || tn === "CompoundPathItem") {
                    summary.hasPath = true;
                }
                if (tn === "GroupItem") {
                    summary.hasNestedGroup = true;
                }
            }
        } catch (e) {}
        
        return summary;
    },
    
    // 推断组的语义角色
    inferGroupRole: function(group, childSummary, ctx) {
        var role = {
            type: "generic",
            confidence: 0.3,
            isCard: false,
            isRepeatable: false,
            suggestedPattern: null
        };
        
        // 卡片检测：包含文本+图片
        if (childSummary.hasText && childSummary.hasImage) {
            role.type = "card";
            role.confidence = 0.7;
            role.isCard = true;
            role.isRepeatable = true;
            
            // 人物卡片：1图片+多文本
            if (childSummary.imageCount === 1 && childSummary.textCount >= 2) {
                role.suggestedPattern = "person_card";
                role.confidence = 0.8;
            }
            // 产品卡片：1图片+1-2文本
            else if (childSummary.imageCount === 1 && childSummary.textCount <= 2) {
                role.suggestedPattern = "product_card";
                role.confidence = 0.7;
            }
        }
        // 文本组：只有文本
        else if (childSummary.hasText && !childSummary.hasImage && childSummary.textCount > 1) {
            role.type = "text_block";
            role.confidence = 0.6;
        }
        // 装饰组：只有路径
        else if (childSummary.hasPath && !childSummary.hasText && !childSummary.hasImage) {
            role.type = "decoration";
            role.confidence = 0.5;
        }
        // 容器组：包含嵌套组
        else if (childSummary.hasNestedGroup) {
            role.type = "container";
            role.confidence = 0.5;
        }
        
        return role;
    },
    
    // 获取路径形状类型
    getPathShape: function(path) {
        try {
            if (path.pathPoints.length === 4) {
                // 可能是矩形
                return "rectangle";
            } else if (path.pathPoints.length > 8) {
                // 可能是圆形或椭圆
                return "ellipse";
            }
        } catch (e) {}
        return "freeform";
    }
};

// ===== 符号解析器 =====

var SymbolParser = {
    parse: function(symbol, ctx) {
        var elem = ElementFactory.createBase("symbol", symbol, ctx);
        
        try {
            elem.symbolName = symbol.symbol ? symbol.symbol.name : "未知";
            elem.symbolId = symbol.symbol ? this.getSymbolIndex(symbol.symbol) : -1;
        } catch (e) {
            if (typeof ErrorHandler !== "undefined") {
                ErrorHandler.handle(ErrorCodes.E200_ELEMENT_ACCESS, { method: "SymbolParser.parse" }, e);
            }
            elem.symbolName = "无法访问";
        }
        
        return elem;
    },
    
    getSymbolIndex: function(symbol) {
        try {
            var doc = app.activeDocument;
            for (var i = 0; i < doc.symbols.length; i++) {
                if (doc.symbols[i] === symbol) return i;
            }
        } catch (e) {}
        return -1;
    }
};

// ===== 元素工厂 =====

var ElementFactory = {
    createBase: function(type, item, ctx) {
        var id = CONFIG.parse.generateStableIds 
            ? IdGenerator.generateStableId(item, ctx)
            : IdGenerator.generateSequentialId(type);
        
        var typeInfo = ELEMENT_TYPES[item.typename] || { category: "其他", importance: "low" };
        var itemName = this.getItemName(item);
        
        // 解析前缀标记
        var prefixInfo = PrefixParser.parse(itemName);
        
        var elem = {
            id: id,
            type: type,
            typename: item.typename,
            category: typeInfo.category,
            importance: typeInfo.importance,
            
            // 命名
            name: itemName,
            
            // 前缀标记（如果有）
            prefixMark: prefixInfo,
            
            // 层级信息
            layer: ctx.layerName,
            layerIndex: ctx.layerIndex,
            path: ctx.path,
            depth: ctx.depth,
            parentId: ctx.parentId || null,
            
            // 位置和尺寸（标准化）
            position: CoordinateSystem.transformPosition(item.position[0], item.position[1]),
            positionByRef: CoordinateSystem.getPositionByReference(item, CONFIG.coordinates.referencePoint),
            referencePoint: CONFIG.coordinates.referencePoint,
            size: {
                width: Math.round(item.width * 100) / 100,
                height: Math.round(item.height * 100) / 100
            },
            bounds: CoordinateSystem.transformBounds(item.geometricBounds),
            
            // 状态
            visible: !item.hidden,
            locked: item.locked,
            selected: item.selected,
            
            // 不透明度和混合模式
            opacity: item.opacity !== undefined ? Math.round(item.opacity) : 100,
            blendMode: item.blendingMode ? item.blendingMode.toString().replace("BlendModes.", "") : "NORMAL"
        };
        
        // 变换矩阵
        if (CONFIG.parse.extractTransforms) {
            elem.transform = TransformParser.parse(item.matrix);
        }
        
        // 位置语义分析
        elem.positionSemantics = this.analyzePosition(elem.bounds, ctx);
        
        return elem;
    },
    
    // 位置语义分析
    analyzePosition: function(bounds, ctx) {
        var result = {
            zone: "unknown",
            alignment: [],
            hints: []
        };
        
        try {
            // 获取文档尺寸
            var docW = app.activeDocument.width;
            var docH = app.activeDocument.height;
            
            var x = bounds.left;
            var y = bounds.top;
            var w = bounds.width;
            var h = bounds.height;
            var centerX = x + w / 2;
            var centerY = y + h / 2;
            var bottom = y + h;
            var right = x + w;
            
            var rules = SEMANTIC_RULES.position;
            
            // 区域检测
            if (rules.header && rules.header(y, docH)) {
                result.zone = "header";
                result.hints.push("top_area");
            } else if (rules.footer && rules.footer(y, h, docH)) {
                result.zone = "footer";
                result.hints.push("bottom_area");
            } else {
                result.zone = "content";
            }
            
            // 侧边检测
            if (rules.sidebar && rules.sidebar(x, w, docW)) {
                if (x < docW * 0.2) {
                    result.hints.push("left_sidebar");
                } else {
                    result.hints.push("right_sidebar");
                }
            }
            
            // 居中检测
            if (rules.center && rules.center(x, w, docW)) {
                result.alignment.push("horizontal_center");
            }
            
            // 垂直居中
            if (Math.abs(centerY - docH / 2) < docH * 0.1) {
                result.alignment.push("vertical_center");
            }
            
            // 边缘检测
            if (x < docW * 0.05) {
                result.alignment.push("left_edge");
            }
            if (right > docW * 0.95) {
                result.alignment.push("right_edge");
            }
            if (y < docH * 0.05) {
                result.alignment.push("top_edge");
            }
            if (bottom > docH * 0.95) {
                result.alignment.push("bottom_edge");
            }
            
            // 全宽检测
            if (w > docW * 0.9) {
                result.hints.push("full_width");
            }
            
            // 全高检测
            if (h > docH * 0.9) {
                result.hints.push("full_height");
            }
            
            // 覆盖率
            result.coveragePercent = Math.round((w * h) / (docW * docH) * 10000) / 100;
            
        } catch (e) {
            if (typeof ErrorHandler !== "undefined") {
                ErrorHandler.handle(ErrorCodes.E201_PROPERTY_READ, { method: "analyzePosition" }, e);
            }
            result.error = e.message;
        }
        
        return result;
    },
    
    getItemName: function(item) {
        try {
            if (item.name && item.name.length > 0) {
                return item.name;
            }
        } catch (e) {}
        return "";
    },
    
    // 检查元素是否有标记前缀
    hasMarkedPrefix: function(item) {
        var name = this.getItemName(item);
        return PrefixParser.hasPrefix(name);
    }
};
