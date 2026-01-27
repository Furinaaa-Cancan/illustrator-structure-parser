/**
 * AI 模板结构解析器 v3.0 - 测试框架
 * 提供自动化测试和验证功能
 */

// ===== 测试框架 =====

var TestFramework = {
    tests: [],
    results: [],
    startTime: null,
    
    // 注册测试
    register: function(name, testFn, category) {
        this.tests.push({
            name: name,
            fn: testFn,
            category: category || "general"
        });
    },
    
    // 运行所有测试
    runAll: function() {
        this.results = [];
        this.startTime = new Date();
        
        for (var i = 0; i < this.tests.length; i++) {
            var test = this.tests[i];
            var result = this.runSingle(test);
            this.results.push(result);
        }
        
        return this.generateReport();
    },
    
    // 运行单个测试
    runSingle: function(test) {
        var result = {
            name: test.name,
            category: test.category,
            passed: false,
            error: null,
            duration: 0,
            assertions: []
        };
        
        var startTime = new Date();
        
        try {
            var ctx = new TestContext();
            test.fn(ctx);
            result.assertions = ctx.assertions;
            result.passed = ctx.allPassed();
        } catch (e) {
            result.passed = false;
            result.error = {
                message: e.message,
                line: e.line || "unknown"
            };
        }
        
        result.duration = new Date() - startTime;
        return result;
    },
    
    // 按类别运行
    runByCategory: function(category) {
        this.results = [];
        this.startTime = new Date();
        
        for (var i = 0; i < this.tests.length; i++) {
            var test = this.tests[i];
            if (test.category === category) {
                var result = this.runSingle(test);
                this.results.push(result);
            }
        }
        
        return this.generateReport();
    },
    
    // 生成报告
    generateReport: function() {
        var passed = 0;
        var failed = 0;
        var errors = [];
        
        for (var i = 0; i < this.results.length; i++) {
            if (this.results[i].passed) {
                passed++;
            } else {
                failed++;
                errors.push(this.results[i]);
            }
        }
        
        return {
            totalTests: this.tests.length,
            executed: this.results.length,
            passed: passed,
            failed: failed,
            passRate: this.results.length > 0 ? 
                Math.round(passed / this.results.length * 100) : 0,
            duration: new Date() - this.startTime,
            errors: errors,
            details: this.results
        };
    },
    
    // 清除所有测试
    clear: function() {
        this.tests = [];
        this.results = [];
    }
};

// ===== 测试上下文 =====

function TestContext() {
    this.assertions = [];
}

TestContext.prototype = {
    // 断言相等
    assertEqual: function(actual, expected, message) {
        var passed = actual === expected;
        this.assertions.push({
            type: "assertEqual",
            passed: passed,
            message: message || "",
            actual: actual,
            expected: expected
        });
        return passed;
    },
    
    // 断言不相等
    assertNotEqual: function(actual, notExpected, message) {
        var passed = actual !== notExpected;
        this.assertions.push({
            type: "assertNotEqual",
            passed: passed,
            message: message || "",
            actual: actual,
            notExpected: notExpected
        });
        return passed;
    },
    
    // 断言真
    assertTrue: function(value, message) {
        var passed = value === true;
        this.assertions.push({
            type: "assertTrue",
            passed: passed,
            message: message || "",
            actual: value
        });
        return passed;
    },
    
    // 断言假
    assertFalse: function(value, message) {
        var passed = value === false;
        this.assertions.push({
            type: "assertFalse",
            passed: passed,
            message: message || "",
            actual: value
        });
        return passed;
    },
    
    // 断言非空
    assertNotNull: function(value, message) {
        var passed = value !== null && value !== undefined;
        this.assertions.push({
            type: "assertNotNull",
            passed: passed,
            message: message || "",
            actual: value
        });
        return passed;
    },
    
    // 断言为空
    assertNull: function(value, message) {
        var passed = value === null || value === undefined;
        this.assertions.push({
            type: "assertNull",
            passed: passed,
            message: message || "",
            actual: value
        });
        return passed;
    },
    
    // 断言类型
    assertType: function(value, expectedType, message) {
        var actualType = typeof value;
        var passed = actualType === expectedType;
        this.assertions.push({
            type: "assertType",
            passed: passed,
            message: message || "",
            actual: actualType,
            expected: expectedType
        });
        return passed;
    },
    
    // 断言数组包含
    assertContains: function(array, value, message) {
        var passed = false;
        if (array && array.length) {
            for (var i = 0; i < array.length; i++) {
                if (array[i] === value) {
                    passed = true;
                    break;
                }
            }
        }
        this.assertions.push({
            type: "assertContains",
            passed: passed,
            message: message || "",
            array: array,
            value: value
        });
        return passed;
    },
    
    // 断言数组长度
    assertLength: function(array, expectedLength, message) {
        var actualLength = array ? array.length : 0;
        var passed = actualLength === expectedLength;
        this.assertions.push({
            type: "assertLength",
            passed: passed,
            message: message || "",
            actual: actualLength,
            expected: expectedLength
        });
        return passed;
    },
    
    // 断言范围
    assertInRange: function(value, min, max, message) {
        var passed = value >= min && value <= max;
        this.assertions.push({
            type: "assertInRange",
            passed: passed,
            message: message || "",
            value: value,
            min: min,
            max: max
        });
        return passed;
    },
    
    // 断言对象有属性
    assertHasProperty: function(obj, prop, message) {
        var passed = obj && obj.hasOwnProperty && obj.hasOwnProperty(prop);
        if (!passed && obj) {
            passed = prop in obj;
        }
        this.assertions.push({
            type: "assertHasProperty",
            passed: passed,
            message: message || "",
            property: prop
        });
        return passed;
    },
    
    // 断言正则匹配
    assertMatches: function(str, regex, message) {
        var passed = regex.test(str);
        this.assertions.push({
            type: "assertMatches",
            passed: passed,
            message: message || "",
            string: str,
            pattern: regex.toString()
        });
        return passed;
    },
    
    // 断言抛出异常
    assertThrows: function(fn, message) {
        var passed = false;
        var error = null;
        try {
            fn();
        } catch (e) {
            passed = true;
            error = e.message;
        }
        this.assertions.push({
            type: "assertThrows",
            passed: passed,
            message: message || "",
            error: error
        });
        return passed;
    },
    
    // 检查所有断言是否通过
    allPassed: function() {
        for (var i = 0; i < this.assertions.length; i++) {
            if (!this.assertions[i].passed) {
                return false;
            }
        }
        return this.assertions.length > 0;
    }
};

// ===== 验证器 =====

var Validator = {
    // 验证元素结构
    validateElement: function(elem) {
        var errors = [];
        
        // 必需字段
        var requiredFields = ["id", "type", "typename", "position", "size", "bounds"];
        for (var i = 0; i < requiredFields.length; i++) {
            var field = requiredFields[i];
            if (!elem.hasOwnProperty(field)) {
                errors.push("缺少必需字段: " + field);
            }
        }
        
        // ID 格式验证
        if (elem.id && !/^[a-zA-Z0-9_-]+$/.test(elem.id)) {
            errors.push("ID格式无效: " + elem.id);
        }
        
        // 坐标验证
        if (elem.position) {
            if (typeof elem.position.x !== "number" || isNaN(elem.position.x)) {
                errors.push("position.x 不是有效数字");
            }
            if (typeof elem.position.y !== "number" || isNaN(elem.position.y)) {
                errors.push("position.y 不是有效数字");
            }
        }
        
        // 尺寸验证
        if (elem.size) {
            if (typeof elem.size.width !== "number" || elem.size.width < 0) {
                errors.push("size.width 无效");
            }
            if (typeof elem.size.height !== "number" || elem.size.height < 0) {
                errors.push("size.height 无效");
            }
        }
        
        // 边界验证
        if (elem.bounds) {
            if (elem.bounds.width < 0 || elem.bounds.height < 0) {
                errors.push("bounds 尺寸为负");
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    },
    
    // 验证文档结构
    validateStructure: function(structure) {
        var errors = [];
        var warnings = [];
        
        // meta 验证
        if (!structure.meta) {
            errors.push("缺少 meta 信息");
        } else {
            if (!structure.meta.version) errors.push("缺少版本号");
            if (!structure.meta.exportTime) errors.push("缺少导出时间");
        }
        
        // document 验证
        if (!structure.document) {
            errors.push("缺少 document 信息");
        } else {
            if (!structure.document.name) warnings.push("文档无名称");
            if (!structure.document.width || !structure.document.height) {
                errors.push("文档尺寸无效");
            }
        }
        
        // elements 验证
        if (!structure.elements || !structure.elements.length) {
            warnings.push("元素列表为空");
        } else {
            // 验证每个元素
            var idSet = {};
            for (var i = 0; i < structure.elements.length; i++) {
                var elem = structure.elements[i];
                var elemResult = this.validateElement(elem);
                
                if (!elemResult.valid) {
                    errors.push("元素 " + i + " 验证失败: " + elemResult.errors.join(", "));
                }
                
                // ID 唯一性检查
                if (elem.id) {
                    if (idSet[elem.id]) {
                        errors.push("重复ID: " + elem.id);
                    }
                    idSet[elem.id] = true;
                }
            }
        }
        
        // 统计验证
        if (structure.statistics) {
            if (structure.statistics.totalElements !== structure.elements.length) {
                warnings.push("统计的元素数量与实际不符");
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    },
    
    // 验证 JSON 格式
    validateJson: function(jsonStr) {
        try {
            var obj = eval("(" + jsonStr + ")");
            return { valid: true, data: obj };
        } catch (e) {
            return { valid: false, error: e.message };
        }
    }
};

// ===== 内置测试用例（延迟注册） =====
// 测试用例在调用 registerBuiltinTests() 时才注册，避免引用未定义变量

TestFramework.registerBuiltinTests = function() {
    // 检查依赖是否已加载
    if (typeof IdGenerator === "undefined") return;
    
    // 测试 IdGenerator
    this.register("IdGenerator.reset", function(ctx) {
        IdGenerator.reset();
        ctx.assertEqual(IdGenerator.counter, 0, "重置后计数器应为0");
    }, "utils");

    this.register("IdGenerator.generateSequentialId", function(ctx) {
        IdGenerator.reset();
        var id1 = IdGenerator.generateSequentialId("text");
        var id2 = IdGenerator.generateSequentialId("text");
        ctx.assertNotEqual(id1, id2, "两次生成的ID应不同");
        ctx.assertMatches(id1, /^text_/, "ID应以类型前缀开头");
    }, "utils");

    this.register("IdGenerator.simpleHash", function(ctx) {
        var hash1 = IdGenerator.simpleHash("test");
        var hash2 = IdGenerator.simpleHash("test");
        var hash3 = IdGenerator.simpleHash("different");
        ctx.assertEqual(hash1, hash2, "相同输入应产生相同哈希");
        ctx.assertNotEqual(hash1, hash3, "不同输入应产生不同哈希");
    }, "utils");

    // 测试 CoordinateSystem
    this.register("CoordinateSystem.round", function(ctx) {
        ctx.assertEqual(CoordinateSystem.round(1.234567), 1.23, "应保留2位小数");
        ctx.assertEqual(CoordinateSystem.round(1.999), 2, "应正确四舍五入");
        ctx.assertEqual(CoordinateSystem.round(NaN), 0, "NaN应返回0");
    }, "utils");

    // 测试 ColorProcessor
    this.register("ColorProcessor.rgbToHex", function(ctx) {
        ctx.assertEqual(ColorProcessor.rgbToHex(255, 0, 0), "#ff0000", "红色转换");
        ctx.assertEqual(ColorProcessor.rgbToHex(0, 255, 0), "#00ff00", "绿色转换");
        ctx.assertEqual(ColorProcessor.rgbToHex(0, 0, 255), "#0000ff", "蓝色转换");
        ctx.assertEqual(ColorProcessor.rgbToHex(255, 255, 255), "#ffffff", "白色转换");
    }, "utils");

    this.register("ColorProcessor.cmykToRgb", function(ctx) {
        var rgb = ColorProcessor.cmykToRgb(0, 100, 100, 0);
        ctx.assertInRange(rgb.r, 250, 255, "红色R值");
        ctx.assertInRange(rgb.g, 0, 5, "红色G值");
        ctx.assertInRange(rgb.b, 0, 5, "红色B值");
    }, "utils");

    // 测试 PrefixParser
    if (typeof PrefixParser !== "undefined") {
        this.register("PrefixParser.parse", function(ctx) {
            var result = PrefixParser.parse("txt_标题");
            ctx.assertNotNull(result, "应解析出前缀");
            ctx.assertEqual(result.prefix, "txt_", "前缀应为txt_");
            ctx.assertEqual(result.baseName, "标题", "基础名应为标题");
            ctx.assertTrue(result.replaceable, "应标记为可替换");
        }, "utils");

        this.register("PrefixParser.parse_无前缀", function(ctx) {
            var result = PrefixParser.parse("普通元素");
            ctx.assertNull(result, "无前缀应返回null");
        }, "utils");
    }

    // 测试 JsonSerializer
    this.register("JsonSerializer.stringify", function(ctx) {
        var obj = { name: "test", value: 123 };
        var json = JsonSerializer.stringify(obj);
        ctx.assertNotNull(json, "应生成JSON字符串");
        ctx.assertContains(json, "test", "应包含name值");
        ctx.assertContains(json, "123", "应包含value值");
    }, "utils");

    // 测试 Validator
    this.register("Validator.validateElement_有效", function(ctx) {
        var elem = {
            id: "test_001",
            type: "text",
            typename: "TextFrame",
            position: { x: 100, y: 200 },
            size: { width: 300, height: 50 },
            bounds: { left: 100, top: 200, right: 400, bottom: 250, width: 300, height: 50 }
        };
        var result = Validator.validateElement(elem);
        ctx.assertTrue(result.valid, "有效元素应通过验证");
    }, "validation");

    this.register("Validator.validateElement_缺失字段", function(ctx) {
        var elem = { id: "test", type: "text" };
        var result = Validator.validateElement(elem);
        ctx.assertFalse(result.valid, "缺失字段应验证失败");
        ctx.assertTrue(result.errors.length > 0, "应有错误信息");
    }, "validation");

    // 测试语义分析
    if (typeof TextParser !== "undefined") {
        this.register("TextParser.analyzeSemantics_手机号", function(ctx) {
            var result = TextParser.analyzeSemantics("联系电话：13812345678");
            ctx.assertContains(result.hints, "phone", "应识别手机号");
            ctx.assertEqual(result.role, "contact", "角色应为contact");
        }, "semantics");

        this.register("TextParser.analyzeSemantics_邮箱", function(ctx) {
            var result = TextParser.analyzeSemantics("邮箱：test@example.com");
            ctx.assertContains(result.hints, "email", "应识别邮箱");
        }, "semantics");

        this.register("TextParser.analyzeSemantics_日期", function(ctx) {
            var result = TextParser.analyzeSemantics("活动时间：2024-12-25");
            ctx.assertContains(result.hints, "date", "应识别日期");
        }, "semantics");

        this.register("TextParser.analyzeSemantics_中文名", function(ctx) {
            var result = TextParser.analyzeSemantics("张三");
            ctx.assertContains(result.hints, "name", "应识别中文名");
            ctx.assertEqual(result.role, "person_name", "角色应为person_name");
        }, "semantics");
    }
};
