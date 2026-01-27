# AI Template Parser - ML Service

深度学习层次结构分析服务，用于增强 AI 文件的层级理解和图层关系分析。

## 架构概述

```
ml_service/
├── config.py              # 服务配置
├── server.py              # FastAPI 服务入口
├── requirements.txt       # Python 依赖
├── data/
│   ├── schema.py          # 数据结构定义
│   ├── converter.py       # structure.json → 图结构转换
│   └── annotation_tool.py # 标注工具
├── models/
│   ├── visual_encoder.py  # CNN 视觉特征提取
│   └── graph_model.py     # GNN 层次分析模型
└── training/
    └── train.py           # 模型训练脚本
```

## 快速开始

### 1. 安装依赖

```bash
cd tools/ml_service
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python server.py
```

服务默认运行在 `http://127.0.0.1:8765`

### 3. 测试 API

```bash
# 健康检查
curl http://127.0.0.1:8765/health

# 分析层次结构
curl -X POST http://127.0.0.1:8765/analyze \
  -H "Content-Type: application/json" \
  -d @output/structure.json
```

## 数据标注流程

### 1. 导入文档

```bash
python -m data.annotation_tool import output/structure.json
```

### 2. 交互式标注

```bash
python -m data.annotation_tool annotate <doc_id>
```

### 3. 导出训练数据

```bash
python -m data.annotation_tool export -o training_data.json
```

## 模型训练

```bash
python -m training.train \
  --data training_data.json \
  --epochs 50 \
  --batch-size 4 \
  --output checkpoints/
```

## API 文档

### POST /analyze

分析文档层次结构

**请求体:**
```json
{
  "structure_json": { ... },  // AI_Template_Parser 输出的 structure.json
  "include_visual_features": false
}
```

**响应:**
```json
{
  "doc_id": "abc123",
  "success": true,
  "hierarchy_predictions": [
    {
      "element_id": "text_xxx",
      "predicted_role": "content_primary",
      "confidence": 0.85,
      "all_probabilities": { ... }
    }
  ],
  "processing_time_ms": 123.4
}
```

### POST /convert

转换 structure.json 为图结构

### POST /annotate

保存标注数据

### GET /hierarchy-roles

获取所有层级角色定义

### GET /structure-patterns

获取所有结构模式定义

## 层级角色定义

| ID | 角色 | 描述 |
|----|------|------|
| 0 | background | 背景层 |
| 1 | decoration | 装饰元素 |
| 2 | content_container | 内容容器 |
| 3 | content_primary | 主要内容 |
| 4 | content_secondary | 次要内容 |
| 5 | navigation | 导航元素 |
| 6 | branding | 品牌元素 |
| 7 | interactive | 交互元素 |

## 结构模式定义

| ID | 模式 | 描述 |
|----|------|------|
| 0 | single_element | 单独元素 |
| 1 | card | 卡片 |
| 2 | card_grid | 卡片网格 |
| 3 | list_vertical | 垂直列表 |
| 4 | list_horizontal | 水平列表 |
| 5 | form | 表单 |
| 6 | timeline | 时间线 |
| 7 | hero_section | 英雄区 |
| 8 | header | 页头 |
| 9 | footer | 页脚 |
| 10 | sidebar | 侧边栏 |
| 11 | gallery | 图库 |

## 与 ExtendScript 集成

在 `lib/ml_bridge.jsx` 中提供了 ExtendScript 桥接模块：

```javascript
// 在 AI_Template_Parser 中使用
#include "lib/ml_bridge.jsx"

// 初始化 ML 客户端
MLServiceClient.init();

// 分析层次结构
var result = MLServiceClient.analyzeHierarchy(structureData);

// 增强元素信息
elements = HierarchyAnalyzer.enhanceElements(elements, structureData);
```

## 技术栈

- **Web 框架**: FastAPI
- **深度学习**: PyTorch
- **图神经网络**: PyTorch Geometric (可选)
- **视觉编码**: timm (MobileNetV3)
- **图像处理**: OpenCV, Pillow

## 未来计划

1. **Phase 2**: 集成视觉特征提取，提升分析准确度
2. **Phase 3**: 训练 GNN 模型，实现端到端层次理解
3. **Phase 4**: Web 标注界面，简化数据收集流程
