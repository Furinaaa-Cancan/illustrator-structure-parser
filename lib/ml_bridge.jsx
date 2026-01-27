/**
 * AI 模板结构解析器 v3.1 - ML 服务桥接模块
 * ExtendScript ↔ Python ML Service 通信
 * 
 * 功能：
 * 1. HTTP 请求发送（通过 Socket 或 系统命令）
 * 2. 结构数据序列化
 * 3. ML 预测结果解析
 * 4. 层次角色预测集成
 */

// ===== ML 服务配置 =====

var ML_CONFIG = {
    // 服务地址
    host: "127.0.0.1",
    port: 8765,
    baseUrl: "http://127.0.0.1:8765",
    
    // 超时设置（毫秒）
    timeout: 30000,
    
    // 是否启用 ML 增强
    enabled: true,
    
    // 降级策略
    fallbackToRules: true,
    
    // 缓存
    cacheEnabled: true,
    cacheDir: "ml_cache/"
};

// ===== HTTP 客户端（ExtendScript 兼容）=====

var MLHttpClient = {
    /**
     * 发送 HTTP 请求（通过系统命令 curl）
     * ExtendScript 没有原生 HTTP 支持，使用 curl 命令
     */
    request: function(method, endpoint, data) {
        var url = ML_CONFIG.baseUrl + endpoint;
        var result = { success: false, data: null, error: null };
        
        try {
            // 构建 curl 命令
            var cmd = this.buildCurlCommand(method, url, data);
            
            // 执行命令
            var response = this.executeCommand(cmd);
            
            if (response) {
                // 解析 JSON 响应
                result.data = this.parseJson(response);
                result.success = true;
            } else {
                result.error = "Empty response from ML service";
            }
            
        } catch (e) {
            result.error = e.message;
            if (typeof Logger !== "undefined") {
                Logger.error("ML HTTP request failed", { endpoint: endpoint, error: e.message });
            }
        }
        
        return result;
    },
    
    /**
     * 构建 curl 命令
     */
    buildCurlCommand: function(method, url, data) {
        var cmd = 'curl -s -X ' + method.toUpperCase();
        cmd += ' -H "Content-Type: application/json"';
        cmd += ' -m ' + Math.floor(ML_CONFIG.timeout / 1000);  // 超时（秒）
        
        if (data) {
            // 将数据写入临时文件（避免命令行长度限制）
            var tempFile = this.writeTempJson(data);
            cmd += ' -d @"' + tempFile + '"';
        }
        
        cmd += ' "' + url + '"';
        
        return cmd;
    },
    
    /**
     * 写入临时 JSON 文件
     */
    writeTempJson: function(data) {
        var tempPath = Folder.temp.fsName + "/ml_request_" + new Date().getTime() + ".json";
        var json = typeof data === "string" ? data : JsonSerializer.stringify(data, 0);
        
        var file = new File(tempPath);
        file.encoding = "UTF-8";
        file.open("w");
        file.write(json);
        file.close();
        
        return tempPath;
    },
    
    /**
     * 执行系统命令
     */
    executeCommand: function(cmd) {
        var result = "";
        
        if (ENV.isMac) {
            // macOS: 使用 do shell script
            result = app.doScript('do shell script "' + cmd.replace(/"/g, '\\"') + '"', ScriptLanguage.APPLESCRIPT);
        } else {
            // Windows: 使用 cmd.exe
            var batFile = new File(Folder.temp.fsName + "/ml_cmd.bat");
            batFile.open("w");
            batFile.writeln('@echo off');
            batFile.writeln(cmd);
            batFile.close();
            
            // 执行并捕获输出
            var wsh = new ActiveXObject("WScript.Shell");
            var exec = wsh.Exec('cmd /c "' + batFile.fsName + '"');
            while (exec.Status === 0) {
                $.sleep(100);
            }
            result = exec.StdOut.ReadAll();
            
            batFile.remove();
        }
        
        return result;
    },
    
    /**
     * 解析 JSON 响应
     */
    parseJson: function(str) {
        try {
            // ExtendScript 没有 JSON.parse，使用 eval（需要信任数据源）
            return eval('(' + str + ')');
        } catch (e) {
            return null;
        }
    },
    
    /**
     * 检查服务是否可用
     */
    checkService: function() {
        var result = this.request("GET", "/health", null);
        return result.success && result.data && result.data.status === "healthy";
    }
};

// ===== ML 服务客户端 =====

var MLServiceClient = {
    _serviceAvailable: null,
    _cachedResults: {},
    
    /**
     * 初始化客户端
     */
    init: function() {
        if (!ML_CONFIG.enabled) {
            this._serviceAvailable = false;
            return this;
        }
        
        // 检查服务可用性
        this._serviceAvailable = MLHttpClient.checkService();
        
        if (this._serviceAvailable) {
            if (typeof Logger !== "undefined") {
                Logger.info("ML service connected", { url: ML_CONFIG.baseUrl });
            }
        } else {
            if (typeof Logger !== "undefined") {
                Logger.warn("ML service not available, using rule-based fallback");
            }
        }
        
        return this;
    },
    
    /**
     * 检查服务是否可用
     */
    isAvailable: function() {
        if (this._serviceAvailable === null) {
            this.init();
        }
        return this._serviceAvailable;
    },
    
    /**
     * 分析文档层次结构
     */
    analyzeHierarchy: function(structureData) {
        if (!this.isAvailable()) {
            return this._fallbackAnalysis(structureData);
        }
        
        var result = MLHttpClient.request("POST", "/analyze", {
            structure_json: structureData,
            include_visual_features: false
        });
        
        if (!result.success) {
            if (typeof Logger !== "undefined") {
                Logger.warn("ML analysis failed, using fallback", { error: result.error });
            }
            return this._fallbackAnalysis(structureData);
        }
        
        return {
            success: true,
            predictions: result.data.hierarchy_predictions || [],
            patterns: result.data.pattern_predictions || [],
            suggestedGroups: result.data.suggested_groups || [],
            source: "ml_service"
        };
    },
    
    /**
     * 转换结构数据为图格式
     */
    convertToGraph: function(structureData) {
        if (!this.isAvailable()) {
            return { success: false, error: "ML service not available" };
        }
        
        var result = MLHttpClient.request("POST", "/convert", {
            structure_json: structureData
        });
        
        return result;
    },
    
    /**
     * 保存标注数据
     */
    saveAnnotation: function(docId, elementId, annotation) {
        if (!this.isAvailable()) {
            return { success: false, error: "ML service not available" };
        }
        
        var result = MLHttpClient.request("POST", "/annotate", {
            doc_id: docId,
            element_id: elementId,
            hierarchy_role: annotation.hierarchyRole || null,
            logical_group_id: annotation.logicalGroupId || null,
            semantic_tags: annotation.semanticTags || null
        });
        
        return result;
    },
    
    /**
     * 获取层级角色定义
     */
    getHierarchyRoles: function() {
        if (!this.isAvailable()) {
            return this._defaultHierarchyRoles();
        }
        
        var result = MLHttpClient.request("GET", "/hierarchy-roles", null);
        
        if (result.success && result.data && result.data.roles) {
            return result.data.roles;
        }
        
        return this._defaultHierarchyRoles();
    },
    
    /**
     * 降级分析（基于规则）
     */
    _fallbackAnalysis: function(structureData) {
        var predictions = [];
        var elements = structureData.elements || [];
        var docHeight = structureData.document ? structureData.document.height : 1080;
        
        for (var i = 0; i < elements.length; i++) {
            var elem = elements[i];
            var prediction = this._predictElementRole(elem, docHeight);
            predictions.push(prediction);
        }
        
        return {
            success: true,
            predictions: predictions,
            patterns: [],
            suggestedGroups: [],
            source: "rule_based"
        };
    },
    
    /**
     * 基于规则预测元素角色
     */
    _predictElementRole: function(elem, docHeight) {
        var role = "decoration";
        var confidence = 0.3;
        
        var bounds = elem.bounds || elem.position || {};
        var y = bounds.top || bounds.y || 0;
        var yRatio = docHeight > 0 ? y / docHeight : 0;
        
        // 位置规则
        if (yRatio < 0.15) {
            if (elem.type === "image_embedded" || elem.type === "image_linked") {
                role = "branding";
                confidence = 0.6;
            } else {
                role = "navigation";
                confidence = 0.5;
            }
        } else if (yRatio > 0.85) {
            role = "navigation";
            confidence = 0.5;
        }
        // 类型规则
        else if (elem.type === "text") {
            var fontSize = elem.style ? elem.style.fontSize : 0;
            if (fontSize > 24) {
                role = "content_primary";
                confidence = 0.7;
            } else {
                role = "content_secondary";
                confidence = 0.5;
            }
        } else if (elem.type === "image_embedded" || elem.type === "image_linked") {
            var size = elem.size || {};
            var area = (size.width || 0) * (size.height || 0);
            if (area > 50000) {
                role = "content_primary";
                confidence = 0.6;
            } else {
                role = "decoration";
                confidence = 0.4;
            }
        } else if (elem.type === "group" || elem.type === "clip_group") {
            role = "content_container";
            confidence = 0.5;
        }
        
        // 前缀标记覆盖
        if (elem.prefixMark) {
            var prefixRole = elem.prefixMark.role;
            if (prefixRole === "branding" || prefixRole === "logo") {
                role = "branding";
                confidence = 0.9;
            } else if (prefixRole === "interactive" || prefixRole === "button") {
                role = "interactive";
                confidence = 0.9;
            }
        }
        
        return {
            element_id: elem.id,
            predicted_role: role,
            confidence: confidence,
            all_probabilities: {}
        };
    },
    
    /**
     * 默认层级角色定义
     */
    _defaultHierarchyRoles: function() {
        return [
            { id: 0, name: "background", description: "背景层" },
            { id: 1, name: "decoration", description: "装饰元素" },
            { id: 2, name: "content_container", description: "内容容器" },
            { id: 3, name: "content_primary", description: "主要内容" },
            { id: 4, name: "content_secondary", description: "次要内容" },
            { id: 5, name: "navigation", description: "导航元素" },
            { id: 6, name: "branding", description: "品牌元素" },
            { id: 7, name: "interactive", description: "交互元素" }
        ];
    }
};

// ===== 层次分析增强器 =====

var HierarchyAnalyzer = {
    /**
     * 增强元素的层次信息
     */
    enhanceElements: function(elements, structureData) {
        // 初始化 ML 客户端
        MLServiceClient.init();
        
        // 获取 ML 分析结果
        var analysis = MLServiceClient.analyzeHierarchy(structureData);
        
        if (!analysis.success) {
            if (typeof Logger !== "undefined") {
                Logger.warn("Hierarchy analysis failed");
            }
            return elements;
        }
        
        // 创建预测映射
        var predictionMap = {};
        for (var i = 0; i < analysis.predictions.length; i++) {
            var pred = analysis.predictions[i];
            predictionMap[pred.element_id] = pred;
        }
        
        // 增强元素
        for (var j = 0; j < elements.length; j++) {
            var elem = elements[j];
            var prediction = predictionMap[elem.id];
            
            if (prediction) {
                elem.mlAnalysis = {
                    hierarchyRole: prediction.predicted_role,
                    confidence: prediction.confidence,
                    source: analysis.source
                };
                
                // 如果置信度足够高，更新 importance
                if (prediction.confidence > 0.7) {
                    elem.importance = this._roleToImportance(prediction.predicted_role);
                }
            }
        }
        
        // 记录分析来源
        if (typeof AuditLogger !== "undefined") {
            AuditLogger.info("hierarchy", "层次分析完成", {
                source: analysis.source,
                elementCount: elements.length,
                predictionCount: analysis.predictions.length
            });
        }
        
        return elements;
    },
    
    /**
     * 角色到重要性的映射
     */
    _roleToImportance: function(role) {
        var mapping = {
            "background": "low",
            "decoration": "low",
            "content_container": "medium",
            "content_primary": "high",
            "content_secondary": "medium",
            "navigation": "medium",
            "branding": "high",
            "interactive": "high"
        };
        return mapping[role] || "medium";
    }
};

// ===== 导出 =====

// 在主解析流程中调用：
// elements = HierarchyAnalyzer.enhanceElements(elements, structure);
