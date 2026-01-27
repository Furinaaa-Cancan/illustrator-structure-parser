/**
 * AI 模板结构解析器 v3.0 - 错误处理模块
 * 提供完善的错误处理、恢复机制和超时控制
 */

// ===== 错误类型定义 =====

var ErrorTypes = {
    FATAL: "fatal",           // 致命错误，必须停止
    RECOVERABLE: "recoverable", // 可恢复错误，可跳过继续
    WARNING: "warning",       // 警告，不影响执行
    INFO: "info"              // 信息性提示
};

var ErrorCodes = {
    // 环境错误 (1xx)
    E100_NO_DOCUMENT: { code: 100, type: ErrorTypes.FATAL, message: "没有打开的文档" },
    E101_VERSION_TOO_LOW: { code: 101, type: ErrorTypes.FATAL, message: "Illustrator版本过低" },
    E102_NO_WRITE_PERMISSION: { code: 102, type: ErrorTypes.FATAL, message: "没有写入权限" },
    
    // 解析错误 (2xx)
    E200_ELEMENT_ACCESS: { code: 200, type: ErrorTypes.RECOVERABLE, message: "无法访问元素" },
    E201_PROPERTY_READ: { code: 201, type: ErrorTypes.RECOVERABLE, message: "无法读取属性" },
    E202_TEXT_PARSE: { code: 202, type: ErrorTypes.RECOVERABLE, message: "文本解析失败" },
    E203_IMAGE_PARSE: { code: 203, type: ErrorTypes.RECOVERABLE, message: "图像解析失败" },
    E204_PATH_PARSE: { code: 204, type: ErrorTypes.RECOVERABLE, message: "路径解析失败" },
    E205_COLOR_EXTRACT: { code: 205, type: ErrorTypes.RECOVERABLE, message: "颜色提取失败" },
    E206_TRANSFORM_PARSE: { code: 206, type: ErrorTypes.RECOVERABLE, message: "变换解析失败" },
    
    // 结构错误 (3xx)
    E300_MAX_DEPTH: { code: 300, type: ErrorTypes.WARNING, message: "超过最大递归深度" },
    E301_CIRCULAR_REF: { code: 301, type: ErrorTypes.WARNING, message: "检测到循环引用" },
    E302_EMPTY_GROUP: { code: 302, type: ErrorTypes.INFO, message: "空组被跳过" },
    
    // 输出错误 (4xx)
    E400_FILE_WRITE: { code: 400, type: ErrorTypes.FATAL, message: "文件写入失败" },
    E401_JSON_SERIALIZE: { code: 401, type: ErrorTypes.RECOVERABLE, message: "JSON序列化失败" },
    E402_EXPORT_IMAGE: { code: 402, type: ErrorTypes.RECOVERABLE, message: "图像导出失败" },
    
    // 超时错误 (5xx)
    E500_TIMEOUT: { code: 500, type: ErrorTypes.RECOVERABLE, message: "操作超时" },
    E501_MEMORY_LIMIT: { code: 501, type: ErrorTypes.WARNING, message: "接近内存限制" }
};

// ===== 错误处理器 =====

var ErrorHandler = {
    errors: [],
    warnings: [],
    recoveryStrategies: {},
    maxErrors: 100,          // 最大错误记录数
    stopOnFatal: true,       // 遇到致命错误时停止
    
    // 初始化
    init: function() {
        this.errors = [];
        this.warnings = [];
        return this;
    },
    
    // 注册恢复策略
    registerRecovery: function(errorCode, strategyFn) {
        this.recoveryStrategies[errorCode] = strategyFn;
    },
    
    // 处理错误
    handle: function(errorDef, context, originalError) {
        var entry = {
            code: errorDef.code,
            type: errorDef.type,
            message: errorDef.message,
            context: context || {},
            timestamp: new Date().toISOString(),
            originalError: originalError ? originalError.message : null,
            stack: originalError ? (originalError.stack || "") : ""
        };
        
        // 根据类型分类存储
        if (errorDef.type === ErrorTypes.WARNING || errorDef.type === ErrorTypes.INFO) {
            if (this.warnings.length < this.maxErrors) {
                this.warnings.push(entry);
            }
        } else {
            if (this.errors.length < this.maxErrors) {
                this.errors.push(entry);
            }
        }
        
        // 记录到日志
        if (typeof Logger !== "undefined") {
            var logLevel = errorDef.type === ErrorTypes.FATAL ? "error" : 
                          (errorDef.type === ErrorTypes.RECOVERABLE ? "warn" : "info");
            Logger[logLevel]("[E" + errorDef.code + "] " + errorDef.message, context);
        }
        
        // 尝试恢复
        if (errorDef.type === ErrorTypes.RECOVERABLE) {
            return this.tryRecover(errorDef.code, context, originalError);
        }
        
        // 致命错误处理
        if (errorDef.type === ErrorTypes.FATAL && this.stopOnFatal) {
            throw new Error("[FATAL E" + errorDef.code + "] " + errorDef.message);
        }
        
        return null;
    },
    
    // 尝试恢复
    tryRecover: function(code, context, originalError) {
        var strategy = this.recoveryStrategies[code];
        if (strategy) {
            try {
                return strategy(context, originalError);
            } catch (e) {
                // 恢复失败，记录
                if (typeof Logger !== "undefined") {
                    Logger.error("恢复策略执行失败", { code: code, error: e.message });
                }
            }
        }
        return null;
    },
    
    // 安全执行
    safeExecute: function(fn, errorDef, context) {
        try {
            return { success: true, result: fn() };
        } catch (e) {
            this.handle(errorDef, context, e);
            return { success: false, error: e };
        }
    },
    
    // 带重试的执行
    executeWithRetry: function(fn, errorDef, context, maxRetries) {
        maxRetries = maxRetries || 3;
        var lastError = null;
        
        for (var i = 0; i < maxRetries; i++) {
            try {
                return { success: true, result: fn(), attempts: i + 1 };
            } catch (e) {
                lastError = e;
                // 等待一小段时间后重试
                $.sleep(100 * (i + 1));
            }
        }
        
        this.handle(errorDef, context, lastError);
        return { success: false, error: lastError, attempts: maxRetries };
    },
    
    // 获取错误摘要
    getSummary: function() {
        var fatal = 0, recoverable = 0, warning = 0, info = 0;
        
        for (var i = 0; i < this.errors.length; i++) {
            if (this.errors[i].type === ErrorTypes.FATAL) fatal++;
            else if (this.errors[i].type === ErrorTypes.RECOVERABLE) recoverable++;
        }
        
        for (var j = 0; j < this.warnings.length; j++) {
            if (this.warnings[j].type === ErrorTypes.WARNING) warning++;
            else info++;
        }
        
        return {
            totalErrors: this.errors.length,
            totalWarnings: this.warnings.length,
            fatal: fatal,
            recoverable: recoverable,
            warning: warning,
            info: info,
            hasBlockingErrors: fatal > 0
        };
    },
    
    // 获取所有错误
    getAll: function() {
        return {
            errors: this.errors,
            warnings: this.warnings,
            summary: this.getSummary()
        };
    }
};

// ===== 超时控制器 =====

var TimeoutController = {
    startTime: null,
    maxDuration: 300000,     // 默认5分钟超时
    checkInterval: 1000,     // 检查间隔
    lastCheck: null,
    callbacks: {
        onTimeout: null,
        onProgress: null
    },
    
    // 开始计时
    start: function(maxDurationMs) {
        this.startTime = new Date();
        this.lastCheck = this.startTime;
        if (maxDurationMs) this.maxDuration = maxDurationMs;
        return this;
    },
    
    // 检查是否超时
    check: function() {
        if (!this.startTime) return false;
        
        var now = new Date();
        var elapsed = now - this.startTime;
        
        // 更新最后检查时间
        this.lastCheck = now;
        
        if (elapsed > this.maxDuration) {
            if (this.callbacks.onTimeout) {
                this.callbacks.onTimeout(elapsed, this.maxDuration);
            }
            return true;
        }
        
        return false;
    },
    
    // 获取已用时间
    getElapsed: function() {
        if (!this.startTime) return 0;
        return new Date() - this.startTime;
    },
    
    // 获取剩余时间
    getRemaining: function() {
        var remaining = this.maxDuration - this.getElapsed();
        return remaining > 0 ? remaining : 0;
    },
    
    // 设置超时回调
    onTimeout: function(callback) {
        this.callbacks.onTimeout = callback;
        return this;
    },
    
    // 重置
    reset: function() {
        this.startTime = null;
        this.lastCheck = null;
        return this;
    }
};

// ===== 进度跟踪器 =====

var ProgressTracker = {
    total: 0,
    current: 0,
    phase: "",
    phases: [],
    startTime: null,
    callbacks: {
        onProgress: null,
        onPhaseChange: null
    },
    
    // 初始化
    init: function(total) {
        this.total = total;
        this.current = 0;
        this.phase = "";
        this.phases = [];
        this.startTime = new Date();
        return this;
    },
    
    // 设置阶段
    setPhase: function(phaseName, phaseTotal) {
        this.phase = phaseName;
        this.phases.push({
            name: phaseName,
            total: phaseTotal || 0,
            current: 0,
            startTime: new Date()
        });
        
        if (this.callbacks.onPhaseChange) {
            this.callbacks.onPhaseChange(phaseName, this.phases.length);
        }
        
        return this;
    },
    
    // 更新进度
    update: function(increment) {
        increment = increment || 1;
        this.current += increment;
        
        // 更新当前阶段进度
        if (this.phases.length > 0) {
            this.phases[this.phases.length - 1].current += increment;
        }
        
        if (this.callbacks.onProgress) {
            this.callbacks.onProgress(this.getProgress());
        }
        
        return this;
    },
    
    // 设置当前值
    setCurrent: function(value) {
        this.current = value;
        return this;
    },
    
    // 获取进度信息
    getProgress: function() {
        var percent = this.total > 0 ? Math.round(this.current / this.total * 100) : 0;
        var elapsed = new Date() - this.startTime;
        var rate = elapsed > 0 ? this.current / (elapsed / 1000) : 0;
        var eta = rate > 0 ? Math.round((this.total - this.current) / rate * 1000) : 0;
        
        return {
            current: this.current,
            total: this.total,
            percent: percent,
            phase: this.phase,
            elapsed: elapsed,
            rate: Math.round(rate * 100) / 100,
            eta: eta,
            etaFormatted: this.formatTime(eta)
        };
    },
    
    // 格式化时间
    formatTime: function(ms) {
        if (ms < 1000) return "< 1秒";
        var seconds = Math.floor(ms / 1000);
        if (seconds < 60) return seconds + "秒";
        var minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        return minutes + "分" + seconds + "秒";
    },
    
    // 注册回调
    onProgress: function(callback) {
        this.callbacks.onProgress = callback;
        return this;
    },
    
    onPhaseChange: function(callback) {
        this.callbacks.onPhaseChange = callback;
        return this;
    }
};

// ===== 边界检查器 =====

var BoundaryChecker = {
    limits: {
        maxElements: 10000,      // 最大元素数
        maxDepth: 50,            // 最大深度
        maxTextLength: 100000,   // 最大文本长度
        maxPathPoints: 10000,    // 最大路径点数
        maxFileSize: 100000000,  // 100MB
        maxStringLength: 65535   // ExtendScript字符串限制
    },
    
    // 检查元素数量
    checkElementCount: function(count) {
        if (count > this.limits.maxElements) {
            ErrorHandler.handle(ErrorCodes.E501_MEMORY_LIMIT, {
                count: count,
                limit: this.limits.maxElements
            });
            return false;
        }
        return true;
    },
    
    // 检查递归深度
    checkDepth: function(depth) {
        if (depth > this.limits.maxDepth) {
            ErrorHandler.handle(ErrorCodes.E300_MAX_DEPTH, {
                depth: depth,
                limit: this.limits.maxDepth
            });
            return false;
        }
        return true;
    },
    
    // 检查文本长度
    checkTextLength: function(text) {
        if (text && text.length > this.limits.maxTextLength) {
            return {
                valid: false,
                truncated: text.substring(0, this.limits.maxTextLength),
                originalLength: text.length
            };
        }
        return { valid: true, text: text };
    },
    
    // 检查路径点数
    checkPathPoints: function(points) {
        return points <= this.limits.maxPathPoints;
    },
    
    // 安全截断字符串
    safeString: function(str, maxLen) {
        maxLen = maxLen || this.limits.maxStringLength;
        if (!str) return "";
        if (str.length > maxLen) {
            return str.substring(0, maxLen - 3) + "...";
        }
        return str;
    },
    
    // 检查对象是否为空
    isEmpty: function(obj) {
        if (!obj) return true;
        if (typeof obj === "string") return obj.length === 0;
        if (obj.length !== undefined) return obj.length === 0;
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) return false;
        }
        return true;
    },
    
    // 验证数值范围
    validateNumber: function(value, min, max, defaultValue) {
        if (typeof value !== "number" || isNaN(value)) {
            return defaultValue !== undefined ? defaultValue : 0;
        }
        if (min !== undefined && value < min) return min;
        if (max !== undefined && value > max) return max;
        return value;
    }
};

// ===== 注册默认恢复策略 =====

// 元素访问失败：返回占位数据
ErrorHandler.registerRecovery(200, function(context) {
    return {
        id: "error_" + Date.now(),
        type: "error_placeholder",
        error: true,
        originalPath: context.path || "unknown"
    };
});

// 颜色提取失败：返回透明色
ErrorHandler.registerRecovery(205, function(context) {
    return {
        type: "unknown",
        value: null,
        hex: "#000000",
        error: true
    };
});

// 变换解析失败：返回单位矩阵
ErrorHandler.registerRecovery(206, function(context) {
    return {
        scale: { x: 1, y: 1 },
        rotation: 0,
        skew: { x: 0, y: 0 },
        translation: { x: 0, y: 0 },
        error: true
    };
});
