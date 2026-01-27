/**
 * AI 模板结构解析器 v3.0 - 配置模块
 * SOTA 级别 - 支持留一法(LOO)分析
 */

var CONFIG = {
    // 项目路径
    projectPath: "/Volumes/Seagate/Adobe Illustrator解析结构/",
    outputDir: "output/",
    
    // 输出文件
    files: {
        structure: "structure.json",      // 完整结构
        elements: "elements.json",        // 扁平元素列表
        tree: "tree.json",                // 层级树
        looResults: "loo_analysis.json",  // 留一法分析结果
        report: "report.html"             // 可视化报告
    },
    
    // 解析选项
    parse: {
        includeHidden: false,
        includeLocked: true,
        maxDepth: 100,
        extractStyles: true,
        extractTransforms: true,
        extractEffects: true,
        extractAppearance: true,      // 外观面板
        extractTextRanges: true,      // 多样式文本
        smartClassify: true,
        generateStableIds: true       // 稳定UUID
    },
    
    // 留一法分析选项
    loo: {
        enabled: false,               // 是否启用LOO分析
        exportFormat: "PNG24",        // 导出格式
        exportScale: 1,               // 导出缩放
        diffThreshold: 10,            // 差异阈值(像素)
        sampleMode: "all",            // "all" | "random" | "important"
        sampleSize: 50,               // random模式采样数
        groupFirst: true,             // 先按组分析
        parallelExport: false         // 并行导出(需外部工具)
    },
    
    // 坐标系统
    coordinates: {
        normalize: true,              // 标准化坐标
        origin: "top-left",           // "top-left" | "bottom-left" | "center"
        unit: "px",                   // "px" | "pt" | "mm"
        referencePoint: "top-left",   // 元素参考点：9个锚点之一
        artboardRelative: true        // 使用画板相对坐标（修复负坐标问题）
    },
    
    // 参考点配置（9个锚点）
    referencePoints: {
        "top-left":      { x: 0,   y: 0 },
        "top-center":    { x: 0.5, y: 0 },
        "top-right":     { x: 1,   y: 0 },
        "center-left":   { x: 0,   y: 0.5 },
        "center":        { x: 0.5, y: 0.5 },
        "center-right":  { x: 1,   y: 0.5 },
        "bottom-left":   { x: 0,   y: 1 },
        "bottom-center": { x: 0.5, y: 1 },
        "bottom-right":  { x: 1,   y: 1 }
    },
    
    // 性能选项
    performance: {
        chunkSize: 100,               // 分块大小
        gcInterval: 50,               // GC间隔
        streamWrite: true,            // 流式写入
        maxDuration: 300000,          // 最大执行时间(毫秒) = 5分钟
        maxElements: 10000,           // 最大元素数量
        maxDepth: 50,                 // 最大递归深度
        maxTextLength: 100000,        // 最大文本长度
        maxPathPoints: 10000,         // 最大路径点数
        enableProgressUI: true,       // 启用进度UI
        enableValidation: true        // 启用输出验证
    },
    
    // HTML/CSS 生成选项
    html: {
        enabled: true,                // 启用 HTML 生成
        positioning: "absolute",      // "absolute" | "relative"
        includeHidden: false,         // 包含隐藏元素
        exportSeparateFiles: true,    // 分别导出 HTML 和 CSS
        minify: false,                // 压缩输出
        cssPrefix: "ai-",             // CSS 类名前缀
        responsive: false             // 生成响应式代码
    }
};

// 元素类型定义
var ELEMENT_TYPES = {
    "TextFrame":        { category: "文字", importance: "high", replaceable: true },
    "RasterItem":       { category: "图片", importance: "high", replaceable: true },
    "PlacedItem":       { category: "图片", importance: "high", replaceable: true },
    "GroupItem":        { category: "容器", importance: "medium", replaceable: false },
    "PathItem":         { category: "路径", importance: "low", replaceable: false },
    "CompoundPathItem": { category: "路径", importance: "low", replaceable: false },
    "SymbolItem":       { category: "符号", importance: "medium", replaceable: true },
    "MeshItem":         { category: "网格", importance: "medium", replaceable: false },
    "PluginItem":       { category: "插件", importance: "medium", replaceable: false },
    "GraphItem":        { category: "图表", importance: "high", replaceable: true },
    "LegacyTextItem":   { category: "文字", importance: "medium", replaceable: true },
    "NonNativeItem":    { category: "外部", importance: "low", replaceable: false }
};

// 元素前缀标记（用于模板系统）
var ELEMENT_PREFIXES = {
    // 文本类
    "txt_":     { type: "text", replaceable: true, role: "dynamic_text", cssTag: "p" },
    "title_":   { type: "text", replaceable: true, role: "heading", cssTag: "h1" },
    "subtitle_": { type: "text", replaceable: true, role: "subheading", cssTag: "h2" },
    "label_":   { type: "text", replaceable: true, role: "label", cssTag: "span" },
    "desc_":    { type: "text", replaceable: true, role: "description", cssTag: "p" },
    "name_":    { type: "text", replaceable: true, role: "person_name", cssTag: "span" },
    "date_":    { type: "text", replaceable: true, role: "date", cssTag: "time" },
    "price_":   { type: "text", replaceable: true, role: "price", cssTag: "span" },
    
    // 图像类
    "img_":     { type: "image", replaceable: true, role: "dynamic_image", cssTag: "img" },
    "photo_":   { type: "image", replaceable: true, role: "photo", cssTag: "img" },
    "avatar_":  { type: "image", replaceable: true, role: "avatar", cssTag: "img" },
    "banner_":  { type: "image", replaceable: true, role: "banner", cssTag: "img" },
    "thumb_":   { type: "image", replaceable: true, role: "thumbnail", cssTag: "img" },
    
    // 品牌和图标类
    "logo_":    { type: "logo", replaceable: true, role: "branding", cssTag: "img" },
    "icon_":    { type: "icon", replaceable: true, role: "symbol", cssTag: "i" },
    "qr_":      { type: "qrcode", replaceable: true, role: "dynamic_code", cssTag: "img" },
    "barcode_": { type: "barcode", replaceable: true, role: "dynamic_code", cssTag: "img" },
    
    // 交互类
    "btn_":     { type: "button", replaceable: false, role: "interactive", cssTag: "button" },
    "link_":    { type: "link", replaceable: false, role: "interactive", cssTag: "a" },
    "input_":   { type: "input", replaceable: false, role: "form", cssTag: "input" },
    
    // 装饰和布局类
    "bg_":      { type: "background", replaceable: true, role: "decoration", cssTag: "div" },
    "mask_":    { type: "mask", replaceable: false, role: "decoration", cssTag: "div" },
    "line_":    { type: "divider", replaceable: false, role: "decoration", cssTag: "hr" },
    "box_":     { type: "container", replaceable: false, role: "layout", cssTag: "div" },
    "card_":    { type: "card", replaceable: false, role: "layout", cssTag: "div" },
    
    // 数据类
    "list_":    { type: "list", replaceable: true, role: "data", cssTag: "ul" },
    "table_":   { type: "table", replaceable: true, role: "data", cssTag: "table" },
    "chart_":   { type: "chart", replaceable: true, role: "data", cssTag: "div" }
};

// 语义分类规则
var SEMANTIC_RULES = {
    text: {
        // 人名规则
        name: /^[\u4e00-\u9fa5]{2,4}$/,
        englishName: /^[A-Z][a-z]+\s+[A-Z][a-z]+$/,
        
        // 日期时间
        date: /\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/,
        chineseDate: /\d{4}年\d{1,2}月\d{1,2}日/,
        time: /\d{1,2}:\d{2}(:\d{2})?/,
        dateRange: /\d{1,2}[.\-\/]\d{1,2}\s*[-~至到]\s*\d{1,2}[.\-\/]\d{1,2}/,
        
        // 联系方式
        phone: /1[3-9]\d{9}/,
        telephone: /0\d{2,3}[-\s]?\d{7,8}/,
        email: /[\w.-]+@[\w.-]+\.\w+/,
        url: /https?:\/\/[\w.-]+/,
        wechat: /微信[:：]?\s*\w+/,
        qq: /QQ[:：]?\s*\d{5,12}/,
        
        // 职位和身份
        position: /创始人|CEO|CTO|COO|CFO|总监|经理|顾问|专家|总裁|董事|设计师|工程师|主任|秘书|助理|实习生/,
        department: /部门|事业部|中心|办公室|团队|小组/,
        
        // 地址
        address: /省|市|区|县|街道|路|号|楼|室|大厦|广场|园区/,
        zipcode: /邮编[:：]?\s*\d{6}/,
        
        // 金额和数字
        price: /[¥$€£]\s*[\d,]+(\.\d{2})?|[\d,]+\s*元/,
        percent: /\d+(\.\d+)?%/,
        number: /^\d+(\.\d+)?$/,
        
        // 标题和段落
        title: function(t) { return t.length >= 4 && t.length <= 30 && !/\n/.test(t); },
        subtitle: function(t) { return t.length >= 8 && t.length <= 50; },
        paragraph: function(t) { return t.length > 80; },
        slogan: function(t) { return t.length >= 6 && t.length <= 20 && /[！!。，,]/.test(t); },
        
        // 特殊格式
        hashtag: /#[\w\u4e00-\u9fa5]+/,
        mention: /@[\w\u4e00-\u9fa5]+/,
        serial: /[A-Z]{2,4}[-\s]?\d{4,}/,
        
        // 时效性
        deadline: /截止|有效期|到期|限时|倒计时/,
        newTag: /新品|NEW|热销|HOT|推荐|精选/,
        
        // 行动号召
        cta: /立即|马上|点击|了解|咨询|预约|报名|购买|下载|注册|登录|免费/
    },
    
    image: {
        // 人物类
        portrait: function(w, h) { return h > w * 1.2 && h > 300; },
        avatar: function(w, h) { return Math.abs(w - h) < 20 && w >= 50 && w <= 200; },
        headshot: function(w, h) { return h > w * 1.3 && w >= 100 && w <= 300; },
        
        // 布局类
        landscape: function(w, h) { return w > h * 1.2 && w > 300; },
        banner: function(w, h) { return w > h * 2.5 && w > 600; },
        square: function(w, h) { return Math.abs(w - h) < 10; },
        
        // 大小类
        icon: function(w, h) { return w < 80 && h < 80; },
        smallIcon: function(w, h) { return w < 40 && h < 40; },
        logo: function(w, h) { return w < 300 && h < 150; },
        thumbnail: function(w, h) { return w < 200 && h < 200; },
        mainImage: function(w, h) { return w > 400 && h > 400; },
        fullWidth: function(w, h, docW) { return w > docW * 0.8; },
        
        // 特殊类型
        qrcode: function(w, h) { return Math.abs(w - h) < 5 && w >= 80 && w <= 300; },
        barcode: function(w, h) { return w > h * 2 && h < 100; }
    },
    
    // 路径/形状语义
    shape: {
        button: function(w, h) { return w > 60 && w < 300 && h > 20 && h < 80; },
        divider: function(w, h) { return (w > h * 10) || (h > w * 10); },
        card: function(w, h) { return w > 200 && h > 150 && w < 600; },
        badge: function(w, h) { return w < 100 && h < 60; }
    },
    
    // 位置语义
    position: {
        header: function(y, docH) { return y < docH * 0.15; },
        footer: function(y, h, docH) { return (y + h) > docH * 0.85; },
        sidebar: function(x, w, docW) { return x < docW * 0.2 || (x + w) > docW * 0.8; },
        center: function(x, w, docW) { return Math.abs((x + w/2) - docW/2) < docW * 0.1; }
    }
};
