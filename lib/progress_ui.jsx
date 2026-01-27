/**
 * AI 模板结构解析器 v3.0 - 进度UI模块
 * 提供可视化进度反馈对话框
 */

// ===== 进度对话框 =====

var ProgressDialog = {
    win: null,
    progressBar: null,
    statusText: null,
    detailText: null,
    phaseText: null,
    timeText: null,
    cancelBtn: null,
    cancelled: false,
    
    // 创建对话框
    create: function(title, total) {
        this.cancelled = false;
        
        // 创建窗口
        this.win = new Window("palette", title || "处理中...", undefined, {
            closeButton: false
        });
        this.win.orientation = "column";
        this.win.alignChildren = ["fill", "top"];
        this.win.preferredSize = [400, 180];
        
        // 阶段文本
        this.phaseText = this.win.add("statictext", undefined, "初始化...");
        this.phaseText.alignment = ["left", "top"];
        
        // 进度条
        this.progressBar = this.win.add("progressbar", undefined, 0, total || 100);
        this.progressBar.preferredSize = [380, 20];
        
        // 状态文本
        this.statusText = this.win.add("statictext", undefined, "0 / " + (total || 100));
        this.statusText.alignment = ["center", "top"];
        
        // 详细信息
        this.detailText = this.win.add("statictext", undefined, "");
        this.detailText.alignment = ["left", "top"];
        
        // 时间信息
        this.timeText = this.win.add("statictext", undefined, "已用时间: 0秒 | 预计剩余: 计算中...");
        this.timeText.alignment = ["left", "top"];
        
        // 取消按钮
        var btnGroup = this.win.add("group");
        btnGroup.alignment = ["center", "bottom"];
        this.cancelBtn = btnGroup.add("button", undefined, "取消");
        
        var self = this;
        this.cancelBtn.onClick = function() {
            self.cancelled = true;
            self.statusText.text = "正在取消...";
        };
        
        this.win.show();
        return this;
    },
    
    // 更新进度
    update: function(current, total, detail) {
        if (!this.win) return this;
        
        try {
            this.progressBar.value = current;
            this.progressBar.maxvalue = total || this.progressBar.maxvalue;
            
            var percent = total > 0 ? Math.round(current / total * 100) : 0;
            this.statusText.text = current + " / " + total + " (" + percent + "%)";
            
            if (detail) {
                this.detailText.text = detail;
            }
            
            this.win.update();
        } catch (e) {}
        
        return this;
    },
    
    // 设置阶段
    setPhase: function(phaseName) {
        if (!this.win) return this;
        
        try {
            this.phaseText.text = "阶段: " + phaseName;
            this.win.update();
        } catch (e) {}
        
        return this;
    },
    
    // 更新时间信息
    updateTime: function(elapsed, eta) {
        if (!this.win) return this;
        
        try {
            this.timeText.text = "已用时间: " + this.formatTime(elapsed) + 
                               " | 预计剩余: " + this.formatTime(eta);
            this.win.update();
        } catch (e) {}
        
        return this;
    },
    
    // 格式化时间
    formatTime: function(ms) {
        if (!ms || ms < 1000) return "< 1秒";
        var seconds = Math.floor(ms / 1000);
        if (seconds < 60) return seconds + "秒";
        var minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        if (minutes < 60) return minutes + "分" + seconds + "秒";
        var hours = Math.floor(minutes / 60);
        minutes = minutes % 60;
        return hours + "小时" + minutes + "分";
    },
    
    // 检查是否取消
    isCancelled: function() {
        return this.cancelled;
    },
    
    // 关闭对话框
    close: function() {
        if (this.win) {
            try {
                this.win.close();
            } catch (e) {}
            this.win = null;
        }
        return this;
    },
    
    // 显示完成消息
    showComplete: function(message, duration) {
        if (this.win) {
            try {
                this.phaseText.text = "完成!";
                this.statusText.text = message || "处理完成";
                this.progressBar.value = this.progressBar.maxvalue;
                this.cancelBtn.text = "关闭";
                this.cancelBtn.onClick = function() {
                    ProgressDialog.close();
                };
                this.win.update();
                
                // 自动关闭
                if (duration) {
                    $.sleep(duration);
                    this.close();
                }
            } catch (e) {}
        }
        return this;
    },
    
    // 显示错误
    showError: function(message) {
        if (this.win) {
            try {
                this.phaseText.text = "错误!";
                this.statusText.text = message || "处理失败";
                this.detailText.text = "";
                this.cancelBtn.text = "关闭";
                this.win.update();
            } catch (e) {}
        }
        return this;
    }
};

// ===== 结果对话框 =====

var ResultDialog = {
    // 显示解析结果
    showResults: function(structure) {
        var stats = structure.statistics;
        
        var win = new Window("dialog", "AI 模板解析结果 (v3.0 SOTA)");
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.preferredSize = [500, 400];
        
        // 文档信息
        var docPanel = win.add("panel", undefined, "文档信息");
        docPanel.alignChildren = ["left", "top"];
        docPanel.add("statictext", undefined, "名称: " + structure.document.name);
        docPanel.add("statictext", undefined, "尺寸: " + structure.document.width + " x " + structure.document.height);
        docPanel.add("statictext", undefined, "图层: " + structure.layers.length + " | 画板: " + structure.document.artboards.length);
        
        // 元素统计
        var elemPanel = win.add("panel", undefined, "元素统计");
        elemPanel.alignChildren = ["left", "top"];
        elemPanel.preferredSize = [480, 150];
        
        var typeList = "";
        for (var type in stats.byType) {
            typeList += type + ": " + stats.byType[type] + "  ";
        }
        elemPanel.add("statictext", undefined, typeList, { multiline: true });
        
        elemPanel.add("statictext", undefined, "");
        elemPanel.add("statictext", undefined, "总计: " + stats.totalElements + " 个元素");
        elemPanel.add("statictext", undefined, "可替换: " + stats.replaceableCount + " | 前缀标记: " + stats.prefixMarkedCount);
        elemPanel.add("statictext", undefined, "最大深度: " + stats.maxDepth + " 层");
        
        // 处理信息
        var procPanel = win.add("panel", undefined, "处理信息");
        procPanel.alignChildren = ["left", "top"];
        procPanel.add("statictext", undefined, "处理时间: " + stats.processingTime);
        procPanel.add("statictext", undefined, "错误: " + stats.errors + " | 警告: " + stats.warnings);
        
        // LOO 分析
        if (structure.looAnalysis) {
            var looPanel = win.add("panel", undefined, "留一法分析");
            looPanel.alignChildren = ["left", "top"];
            looPanel.add("statictext", undefined, "分析元素: " + structure.looAnalysis.analyzedCount);
            if (structure.looAnalysis.summary) {
                looPanel.add("statictext", undefined, "高影响元素: " + structure.looAnalysis.summary.highImpact.length);
            }
        }
        
        // HTML 生成
        if (structure.htmlOutput) {
            var htmlPanel = win.add("panel", undefined, "HTML/CSS 生成");
            htmlPanel.alignChildren = ["left", "top"];
            htmlPanel.add("statictext", undefined, "✓ template.html 已生成");
            htmlPanel.add("statictext", undefined, "✓ template.css 已生成");
        }
        
        // 输出路径
        win.add("statictext", undefined, "输出目录: " + CONFIG.projectPath + CONFIG.outputDir);
        
        // 按钮
        var btnGroup = win.add("group");
        btnGroup.alignment = ["center", "bottom"];
        
        var openBtn = btnGroup.add("button", undefined, "打开输出目录");
        var closeBtn = btnGroup.add("button", undefined, "关闭");
        
        openBtn.onClick = function() {
            var folder = new Folder(CONFIG.projectPath + CONFIG.outputDir);
            folder.execute();
        };
        
        closeBtn.onClick = function() {
            win.close();
        };
        
        win.show();
    },
    
    // 显示错误报告
    showErrors: function(errors, warnings) {
        var win = new Window("dialog", "错误报告");
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.preferredSize = [500, 350];
        
        // 错误面板
        if (errors && errors.length > 0) {
            var errPanel = win.add("panel", undefined, "错误 (" + errors.length + ")");
            errPanel.alignChildren = ["fill", "top"];
            
            var errList = errPanel.add("edittext", undefined, "", {
                multiline: true,
                readonly: true,
                scrollable: true
            });
            errList.preferredSize = [460, 120];
            
            var errText = "";
            for (var i = 0; i < Math.min(errors.length, 20); i++) {
                var err = errors[i];
                errText += "[E" + err.code + "] " + err.message + "\n";
                if (err.context && err.context.path) {
                    errText += "  位置: " + err.context.path + "\n";
                }
            }
            if (errors.length > 20) {
                errText += "\n... 还有 " + (errors.length - 20) + " 个错误";
            }
            errList.text = errText;
        }
        
        // 警告面板
        if (warnings && warnings.length > 0) {
            var warnPanel = win.add("panel", undefined, "警告 (" + warnings.length + ")");
            warnPanel.alignChildren = ["fill", "top"];
            
            var warnList = warnPanel.add("edittext", undefined, "", {
                multiline: true,
                readonly: true,
                scrollable: true
            });
            warnList.preferredSize = [460, 100];
            
            var warnText = "";
            for (var j = 0; j < Math.min(warnings.length, 10); j++) {
                warnText += warnings[j].message + "\n";
            }
            if (warnings.length > 10) {
                warnText += "\n... 还有 " + (warnings.length - 10) + " 个警告";
            }
            warnList.text = warnText;
        }
        
        // 关闭按钮
        var closeBtn = win.add("button", undefined, "关闭");
        closeBtn.onClick = function() {
            win.close();
        };
        
        win.show();
    }
};

// ===== 配置对话框 =====

var ConfigDialog = {
    // 显示配置对话框
    show: function() {
        var win = new Window("dialog", "AI 模板解析器配置");
        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.preferredSize = [450, 400];
        
        // 解析选项
        var parsePanel = win.add("panel", undefined, "解析选项");
        parsePanel.alignChildren = ["left", "top"];
        
        var cbHidden = parsePanel.add("checkbox", undefined, "包含隐藏元素");
        cbHidden.value = CONFIG.parse.includeHidden;
        
        var cbLocked = parsePanel.add("checkbox", undefined, "包含锁定元素");
        cbLocked.value = CONFIG.parse.includeLocked;
        
        var cbTextRanges = parsePanel.add("checkbox", undefined, "提取多样式文本");
        cbTextRanges.value = CONFIG.parse.extractTextRanges;
        
        var cbStableIds = parsePanel.add("checkbox", undefined, "生成稳定ID");
        cbStableIds.value = CONFIG.parse.generateStableIds;
        
        // 坐标选项
        var coordPanel = win.add("panel", undefined, "坐标系统");
        coordPanel.alignChildren = ["left", "top"];
        
        var originGroup = coordPanel.add("group");
        originGroup.add("statictext", undefined, "原点位置:");
        var originDropdown = originGroup.add("dropdownlist", undefined, 
            ["top-left", "bottom-left", "center"]);
        originDropdown.selection = originDropdown.find(CONFIG.coordinates.origin);
        
        var refGroup = coordPanel.add("group");
        refGroup.add("statictext", undefined, "参考点:");
        var refDropdown = refGroup.add("dropdownlist", undefined,
            ["top-left", "top-center", "top-right", 
             "center-left", "center", "center-right",
             "bottom-left", "bottom-center", "bottom-right"]);
        refDropdown.selection = refDropdown.find(CONFIG.coordinates.referencePoint);
        
        // HTML 选项
        var htmlPanel = win.add("panel", undefined, "HTML/CSS 生成");
        htmlPanel.alignChildren = ["left", "top"];
        
        var cbHtml = htmlPanel.add("checkbox", undefined, "启用 HTML 生成");
        cbHtml.value = CONFIG.html.enabled;
        
        var cbResponsive = htmlPanel.add("checkbox", undefined, "响应式布局");
        cbResponsive.value = CONFIG.html.responsive;
        
        // LOO 选项
        var looPanel = win.add("panel", undefined, "留一法分析");
        looPanel.alignChildren = ["left", "top"];
        
        var cbLoo = looPanel.add("checkbox", undefined, "启用 LOO 分析 (耗时较长)");
        cbLoo.value = CONFIG.loo.enabled;
        
        // 按钮
        var btnGroup = win.add("group");
        btnGroup.alignment = ["center", "bottom"];
        
        var okBtn = btnGroup.add("button", undefined, "确定");
        var cancelBtn = btnGroup.add("button", undefined, "取消");
        
        okBtn.onClick = function() {
            // 应用配置
            CONFIG.parse.includeHidden = cbHidden.value;
            CONFIG.parse.includeLocked = cbLocked.value;
            CONFIG.parse.extractTextRanges = cbTextRanges.value;
            CONFIG.parse.generateStableIds = cbStableIds.value;
            
            if (originDropdown.selection) {
                CONFIG.coordinates.origin = originDropdown.selection.text;
            }
            if (refDropdown.selection) {
                CONFIG.coordinates.referencePoint = refDropdown.selection.text;
            }
            
            CONFIG.html.enabled = cbHtml.value;
            CONFIG.html.responsive = cbResponsive.value;
            CONFIG.loo.enabled = cbLoo.value;
            
            win.close(1);
        };
        
        cancelBtn.onClick = function() {
            win.close(0);
        };
        
        return win.show();
    }
};
