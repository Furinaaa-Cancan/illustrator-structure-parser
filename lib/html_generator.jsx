/**
 * AI 模板结构解析器 v3.0 - HTML/CSS 生成模块
 * 将解析结果转换为可用的 HTML 和 CSS 代码
 */

var HtmlGenerator = {
    docWidth: 0,
    docHeight: 0,
    cssRules: [],
    htmlElements: [],
    
    // 初始化
    init: function(doc) {
        this.docWidth = doc.width;
        this.docHeight = doc.height;
        this.cssRules = [];
        this.htmlElements = [];
        return this;
    },
    
    // 生成完整的 HTML/CSS
    generate: function(elements, options) {
        options = options || {};
        var useAbsolute = options.positioning !== "relative";
        var includeHidden = options.includeHidden || false;
        
        // 重置
        this.cssRules = [];
        this.htmlElements = [];
        
        // 添加基础样式
        this.addBaseStyles(options.responsive);
        
        // 处理每个元素
        for (var i = 0; i < elements.length; i++) {
            var elem = elements[i];
            
            // 跳过不可见元素
            if (!includeHidden && !elem.visible) continue;
            
            // 只处理顶层元素或有前缀标记的元素
            if (elem.depth === 0 || elem.prefixMark) {
                this.processElement(elem, useAbsolute);
            }
        }
        
        return {
            html: this.buildHtml(),
            css: this.buildCss(),
            combined: this.buildCombined()
        };
    },
    
    // 添加基础样式
    addBaseStyles: function(responsive) {
        var containerRules = {
            "position": "relative",
            "width": Math.round(this.docWidth) + "px",
            "height": Math.round(this.docHeight) + "px",
            "overflow": "hidden",
            "background": "#ffffff"
        };
        
        // 响应式容器
        if (responsive) {
            containerRules["max-width"] = "100%";
            containerRules["margin"] = "0 auto";
        }
        
        this.cssRules.push({
            selector: ".ai-container",
            rules: containerRules
        });
        
        this.cssRules.push({
            selector: ".ai-element",
            rules: {
                "position": "absolute",
                "box-sizing": "border-box"
            }
        });
        
        // 响应式媒体查询
        if (responsive) {
            this.addResponsiveStyles();
        }
    },
    
    // 添加响应式媒体查询
    addResponsiveStyles: function() {
        // 平板断点
        this.cssRules.push({
            selector: "@media (max-width: 1024px)",
            isMediaQuery: true,
            rules: {
                ".ai-container": {
                    "transform": "scale(0.8)",
                    "transform-origin": "top center"
                }
            }
        });
        
        // 手机断点
        this.cssRules.push({
            selector: "@media (max-width: 768px)",
            isMediaQuery: true,
            rules: {
                ".ai-container": {
                    "transform": "scale(0.5)",
                    "transform-origin": "top center"
                }
            }
        });
        
        // 小屏手机
        this.cssRules.push({
            selector: "@media (max-width: 480px)",
            isMediaQuery: true,
            rules: {
                ".ai-container": {
                    "transform": "scale(0.35)",
                    "transform-origin": "top center"
                }
            }
        });
    },
    
    // 处理单个元素
    processElement: function(elem, useAbsolute) {
        var className = this.generateClassName(elem);
        var tag = this.getHtmlTag(elem);
        var styles = this.generateStyles(elem, useAbsolute);
        var content = this.getContent(elem);
        var attrs = this.getAttributes(elem);
        
        // 添加 CSS 规则
        this.cssRules.push({
            selector: "." + className,
            rules: styles
        });
        
        // 添加 HTML 元素
        this.htmlElements.push({
            tag: tag,
            className: className,
            content: content,
            attributes: attrs,
            id: elem.id,
            depth: elem.depth
        });
    },
    
    // 生成类名
    generateClassName: function(elem) {
        var name = elem.name || elem.id;
        // 清理非法字符
        name = name.replace(/[^a-zA-Z0-9_-]/g, "_");
        // 确保以字母开头
        if (/^[0-9]/.test(name)) {
            name = "el_" + name;
        }
        return name;
    },
    
    // 获取 HTML 标签
    getHtmlTag: function(elem) {
        // 优先使用前缀标记的 cssTag
        if (elem.prefixMark && elem.prefixMark.cssTag) {
            return elem.prefixMark.cssTag;
        }
        
        // 根据类型推断
        switch (elem.type) {
            case "text":
                return "div";
            case "image_embedded":
            case "image_linked":
                return "img";
            case "group":
            case "clip_group":
                return "div";
            case "path":
                return "div";
            default:
                return "div";
        }
    },
    
    // 生成 CSS 样式
    generateStyles: function(elem, useAbsolute) {
        var styles = {};
        
        // 位置
        if (useAbsolute) {
            styles["left"] = Math.round(elem.bounds.left) + "px";
            styles["top"] = Math.round(elem.bounds.top) + "px";
        }
        
        // 尺寸
        styles["width"] = Math.round(elem.size.width) + "px";
        styles["height"] = Math.round(elem.size.height) + "px";
        
        // 不透明度
        if (elem.opacity < 100) {
            styles["opacity"] = (elem.opacity / 100).toFixed(2);
        }
        
        // 混合模式
        if (elem.blendMode && elem.blendMode !== "NORMAL") {
            styles["mix-blend-mode"] = this.convertBlendMode(elem.blendMode);
        }
        
        // 文本样式
        if (elem.type === "text" && elem.style) {
            styles["font-family"] = "'" + (elem.style.fontFamily || elem.style.fontName) + "', sans-serif";
            styles["font-size"] = Math.round(elem.style.fontSize) + "px";
            
            if (elem.style.fillColor && elem.style.fillColor.hex) {
                styles["color"] = elem.style.fillColor.hex;
            }
            
            // 行高
            if (elem.style.leading && elem.style.leading > 0) {
                styles["line-height"] = Math.round(elem.style.leading) + "px";
            }
            
            // 字间距
            if (elem.style.tracking && elem.style.tracking !== 0) {
                styles["letter-spacing"] = (elem.style.tracking / 1000) + "em";
            }
        }
        
        // 路径填充色
        if (elem.fillColor && elem.fillColor.hex) {
            styles["background-color"] = elem.fillColor.hex;
        }
        
        // 路径描边
        if (elem.strokeColor && elem.strokeColor.hex && elem.strokeWidth > 0) {
            styles["border"] = Math.round(elem.strokeWidth) + "px solid " + elem.strokeColor.hex;
        }
        
        // 变换
        if (elem.transform && elem.transform.hasTransform) {
            var transforms = [];
            if (Math.abs(elem.transform.rotation) > 0.1) {
                transforms.push("rotate(" + Math.round(elem.transform.rotation) + "deg)");
            }
            if (Math.abs(elem.transform.scale.x - 1) > 0.01 || Math.abs(elem.transform.scale.y - 1) > 0.01) {
                transforms.push("scale(" + elem.transform.scale.x.toFixed(2) + ", " + elem.transform.scale.y.toFixed(2) + ")");
            }
            if (transforms.length > 0) {
                styles["transform"] = transforms.join(" ");
            }
        }
        
        return styles;
    },
    
    // 转换混合模式
    convertBlendMode: function(aiMode) {
        var modeMap = {
            "MULTIPLY": "multiply",
            "SCREEN": "screen",
            "OVERLAY": "overlay",
            "DARKEN": "darken",
            "LIGHTEN": "lighten",
            "COLORDODGE": "color-dodge",
            "COLORBURN": "color-burn",
            "HARDLIGHT": "hard-light",
            "SOFTLIGHT": "soft-light",
            "DIFFERENCE": "difference",
            "EXCLUSION": "exclusion",
            "HUE": "hue",
            "SATURATION": "saturation",
            "COLOR": "color",
            "LUMINOSITY": "luminosity"
        };
        return modeMap[aiMode] || "normal";
    },
    
    // 获取元素内容
    getContent: function(elem) {
        if (elem.type === "text") {
            return elem.content || "";
        }
        return "";
    },
    
    // 获取元素属性
    getAttributes: function(elem) {
        var attrs = {};
        
        if (elem.type === "image_embedded" || elem.type === "image_linked") {
            attrs["src"] = elem.file ? elem.file.name : "placeholder.png";
            attrs["alt"] = elem.name || "image";
        }
        
        if (elem.prefixMark && elem.prefixMark.role === "interactive") {
            attrs["data-action"] = elem.prefixMark.baseName || "";
        }
        
        return attrs;
    },
    
    // 构建 HTML
    buildHtml: function() {
        var html = [];
        html.push('<div class="ai-container">');
        
        for (var i = 0; i < this.htmlElements.length; i++) {
            var el = this.htmlElements[i];
            html.push(this.buildHtmlElement(el));
        }
        
        html.push('</div>');
        return html.join("\n");
    },
    
    // 构建单个 HTML 元素
    buildHtmlElement: function(el) {
        var indent = "  ";
        var tag = el.tag;
        var classes = "ai-element " + el.className;
        
        var attrStr = 'class="' + classes + '"';
        attrStr += ' data-id="' + el.id + '"';
        
        for (var key in el.attributes) {
            attrStr += ' ' + key + '="' + this.escapeHtml(el.attributes[key]) + '"';
        }
        
        if (tag === "img" || tag === "input" || tag === "hr") {
            return indent + '<' + tag + ' ' + attrStr + ' />';
        } else {
            var content = this.escapeHtml(el.content);
            return indent + '<' + tag + ' ' + attrStr + '>' + content + '</' + tag + '>';
        }
    },
    
    // 构建 CSS
    buildCss: function() {
        var css = [];
        
        for (var i = 0; i < this.cssRules.length; i++) {
            var rule = this.cssRules[i];
            
            // 媒体查询特殊处理
            if (rule.isMediaQuery) {
                css.push(rule.selector + " {");
                for (var selector in rule.rules) {
                    css.push("  " + selector + " {");
                    var props = rule.rules[selector];
                    for (var prop in props) {
                        css.push("    " + prop + ": " + props[prop] + ";");
                    }
                    css.push("  }");
                }
                css.push("}");
            } else {
                css.push(rule.selector + " {");
                for (var prop in rule.rules) {
                    css.push("  " + prop + ": " + rule.rules[prop] + ";");
                }
                css.push("}");
            }
            css.push("");
        }
        
        return css.join("\n");
    },
    
    // 构建完整 HTML 文件
    buildCombined: function() {
        var html = [];
        html.push('<!DOCTYPE html>');
        html.push('<html lang="zh-CN">');
        html.push('<head>');
        html.push('  <meta charset="UTF-8">');
        html.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
        html.push('  <title>AI Template Export</title>');
        html.push('  <style>');
        html.push(this.buildCss());
        html.push('  </style>');
        html.push('</head>');
        html.push('<body>');
        html.push(this.buildHtml());
        html.push('</body>');
        html.push('</html>');
        return html.join("\n");
    },
    
    // HTML 转义
    escapeHtml: function(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    },
    
    // 保存 HTML 文件
    saveHtml: function(path, content) {
        var file = new File(path);
        file.encoding = "UTF-8";
        file.open("w");
        file.write(content);
        file.close();
        return file.exists;
    },
    
    // 保存 CSS 文件
    saveCss: function(path, content) {
        var file = new File(path);
        file.encoding = "UTF-8";
        file.open("w");
        file.write(content);
        file.close();
        return file.exists;
    }
};

// CSS 工具函数
var CssUtils = {
    // 颜色转换
    rgbToRgba: function(rgb, alpha) {
        if (!rgb) return "transparent";
        return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + (alpha || 1) + ")";
    },
    
    // 生成渐变 CSS
    gradientToCss: function(gradient) {
        if (!gradient || !gradient.stops) return "transparent";
        
        var type = gradient.type || "linear";
        var stops = [];
        
        for (var i = 0; i < gradient.stops.length; i++) {
            var stop = gradient.stops[i];
            var color = stop.color && stop.color.hex ? stop.color.hex : "transparent";
            var pos = Math.round(stop.position) + "%";
            stops.push(color + " " + pos);
        }
        
        if (type.indexOf("radial") >= 0) {
            return "radial-gradient(circle, " + stops.join(", ") + ")";
        }
        return "linear-gradient(to bottom, " + stops.join(", ") + ")";
    },
    
    // 生成阴影 CSS
    shadowToCss: function(shadow) {
        if (!shadow) return "none";
        var x = shadow.offsetX || 0;
        var y = shadow.offsetY || 0;
        var blur = shadow.blur || 0;
        var color = shadow.color && shadow.color.hex ? shadow.color.hex : "rgba(0,0,0,0.5)";
        return x + "px " + y + "px " + blur + "px " + color;
    }
};
