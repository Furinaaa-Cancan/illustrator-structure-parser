"""
AI Template Parser - ML Service
深度学习层次结构分析 FastAPI 服务
"""

import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import json
import asyncio

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

from config import get_config, HIERARCHY_ROLES, STRUCTURE_PATTERNS
from data.schema import DocumentGraph, ElementNode, HierarchyRole, StructurePattern
from data.converter import StructureToGraphConverter

# 尝试导入 ML 模块
try:
    import torch
    from models.visual_encoder import VisualEncoder, ElementVisualAnalyzer
    from models.graph_model import HierarchyGNN, create_graph_model
    ML_AVAILABLE = True
except ImportError as e:
    print(f"Warning: ML modules not fully available: {e}")
    ML_AVAILABLE = False


# ========== 配置 ==========

config = get_config()
app = FastAPI(
    title="AI Template Parser - ML Service",
    description="深度学习层次结构分析服务",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========== 全局状态 ==========

class ServiceState:
    """服务状态"""
    def __init__(self):
        self.visual_encoder = None
        self.graph_model = None
        self.converter = StructureToGraphConverter()
        self.is_initialized = False
        self.device = "cpu"
    
    def initialize(self):
        """初始化模型"""
        if not ML_AVAILABLE:
            print("ML modules not available, running in limited mode")
            self.is_initialized = True
            return
        
        # 检测设备
        if torch.cuda.is_available() and config.use_gpu:
            self.device = "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            self.device = "mps"
        else:
            self.device = "cpu"
        
        print(f"Using device: {self.device}")
        
        # 初始化视觉编码器
        try:
            self.visual_encoder = VisualEncoder(
                model_name=config.visual_encoder,
                output_dim=config.graph_hidden_dim
            )
            if self.device != "cpu":
                self.visual_encoder = self.visual_encoder.to(self.device)
            self.visual_encoder.eval()
            print("Visual encoder initialized")
        except Exception as e:
            print(f"Failed to initialize visual encoder: {e}")
        
        # 初始化图模型
        try:
            self.graph_model = create_graph_model({
                "node_feature_dim": config.graph_hidden_dim,
                "hidden_dim": config.graph_hidden_dim,
                "output_dim": config.graph_output_dim,
                "num_hierarchy_classes": config.num_hierarchy_classes,
                "num_pattern_classes": config.num_pattern_classes
            })
            if self.device != "cpu":
                self.graph_model = self.graph_model.to(self.device)
            self.graph_model.eval()
            print("Graph model initialized")
        except Exception as e:
            print(f"Failed to initialize graph model: {e}")
        
        self.is_initialized = True


state = ServiceState()


# ========== 请求/响应模型 ==========

class ConvertRequest(BaseModel):
    """转换请求"""
    structure_json: Dict[str, Any]
    
class ConvertResponse(BaseModel):
    """转换响应"""
    doc_id: str
    success: bool
    graph: Optional[Dict] = None
    error: Optional[str] = None

class AnalyzeRequest(BaseModel):
    """分析请求"""
    structure_json: Dict[str, Any]
    include_visual_features: bool = False
    
class HierarchyPrediction(BaseModel):
    """层级预测结果"""
    element_id: str
    predicted_role: str
    confidence: float
    all_probabilities: Dict[str, float]

class AnalyzeResponse(BaseModel):
    """分析响应"""
    doc_id: str
    success: bool
    hierarchy_predictions: List[HierarchyPrediction] = []
    pattern_predictions: List[Dict] = []
    suggested_groups: List[Dict] = []
    processing_time_ms: float = 0
    error: Optional[str] = None

class AnnotateRequest(BaseModel):
    """标注请求"""
    doc_id: str
    element_id: str
    hierarchy_role: Optional[str] = None
    logical_group_id: Optional[str] = None
    semantic_tags: Optional[List[str]] = None

class AnnotateResponse(BaseModel):
    """标注响应"""
    success: bool
    message: str


# ========== API 端点 ==========

@app.on_event("startup")
async def startup():
    """启动时初始化"""
    state.initialize()


@app.get("/")
async def root():
    """根端点"""
    return {
        "service": "AI Template Parser - ML Service",
        "version": "1.0.0",
        "status": "running",
        "ml_available": ML_AVAILABLE,
        "device": state.device,
        "initialized": state.is_initialized
    }


@app.get("/health")
async def health():
    """健康检查"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "ml_available": ML_AVAILABLE,
        "models_loaded": {
            "visual_encoder": state.visual_encoder is not None,
            "graph_model": state.graph_model is not None
        }
    }


@app.post("/convert", response_model=ConvertResponse)
async def convert_structure(request: ConvertRequest):
    """
    将 structure.json 转换为图结构数据
    """
    try:
        # 保存临时文件
        temp_path = config.cache_dir / f"temp_{datetime.now().timestamp()}.json"
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(request.structure_json, f)
        
        # 转换
        doc_graph = state.converter.convert(str(temp_path))
        
        # 清理临时文件
        temp_path.unlink()
        
        return ConvertResponse(
            doc_id=doc_graph.doc_id,
            success=True,
            graph=doc_graph.model_dump()
        )
        
    except Exception as e:
        return ConvertResponse(
            doc_id="",
            success=False,
            error=str(e)
        )


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_hierarchy(request: AnalyzeRequest):
    """
    分析文档层次结构
    """
    start_time = datetime.now()
    
    try:
        # 1. 转换为图结构
        temp_path = config.cache_dir / f"temp_{datetime.now().timestamp()}.json"
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(request.structure_json, f)
        
        doc_graph = state.converter.convert(str(temp_path))
        temp_path.unlink()
        
        # 如果 ML 不可用，返回基于规则的分析
        if not ML_AVAILABLE or state.graph_model is None:
            predictions = _rule_based_hierarchy_prediction(doc_graph)
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            
            return AnalyzeResponse(
                doc_id=doc_graph.doc_id,
                success=True,
                hierarchy_predictions=predictions,
                processing_time_ms=processing_time
            )
        
        # 2. 构建图数据
        node_features, edge_index = _build_graph_tensors(doc_graph, state.device)
        
        # 3. 模型推理
        state.graph_model.eval()
        with torch.no_grad():
            outputs = state.graph_model(node_features, edge_index)
            probs = state.graph_model.predict_hierarchy(outputs)
        
        # 4. 解析预测结果
        predictions = []
        probs_np = probs.cpu().numpy()
        
        for i, node in enumerate(doc_graph.nodes):
            pred_idx = int(probs_np[i].argmax())
            pred_role = HIERARCHY_ROLES.get(pred_idx, "unknown")
            conf = float(probs_np[i].max())
            
            all_probs = {
                HIERARCHY_ROLES.get(j, f"class_{j}"): float(probs_np[i, j])
                for j in range(probs_np.shape[1])
            }
            
            predictions.append(HierarchyPrediction(
                element_id=node.id,
                predicted_role=pred_role,
                confidence=conf,
                all_probabilities=all_probs
            ))
        
        processing_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return AnalyzeResponse(
            doc_id=doc_graph.doc_id,
            success=True,
            hierarchy_predictions=predictions,
            processing_time_ms=processing_time
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return AnalyzeResponse(
            doc_id="",
            success=False,
            error=str(e)
        )


@app.post("/annotate", response_model=AnnotateResponse)
async def save_annotation(request: AnnotateRequest):
    """
    保存标注数据
    """
    try:
        # 创建标注目录
        annotation_dir = config.data_dir / "annotations"
        annotation_dir.mkdir(parents=True, exist_ok=True)
        
        # 加载或创建标注文件
        annotation_file = annotation_dir / f"{request.doc_id}_annotations.json"
        
        if annotation_file.exists():
            with open(annotation_file, 'r', encoding='utf-8') as f:
                annotations = json.load(f)
        else:
            annotations = {"doc_id": request.doc_id, "elements": {}}
        
        # 更新标注
        elem_annotation = annotations["elements"].get(request.element_id, {})
        
        if request.hierarchy_role:
            elem_annotation["hierarchy_role"] = request.hierarchy_role
        if request.logical_group_id:
            elem_annotation["logical_group_id"] = request.logical_group_id
        if request.semantic_tags:
            elem_annotation["semantic_tags"] = request.semantic_tags
        
        elem_annotation["updated_at"] = datetime.now().isoformat()
        annotations["elements"][request.element_id] = elem_annotation
        
        # 保存
        with open(annotation_file, 'w', encoding='utf-8') as f:
            json.dump(annotations, f, ensure_ascii=False, indent=2)
        
        return AnnotateResponse(
            success=True,
            message=f"Annotation saved for element {request.element_id}"
        )
        
    except Exception as e:
        return AnnotateResponse(
            success=False,
            message=str(e)
        )


@app.get("/hierarchy-roles")
async def get_hierarchy_roles():
    """获取所有层级角色定义"""
    return {
        "roles": [
            {"id": k, "name": v, "description": _get_role_description(v)}
            for k, v in HIERARCHY_ROLES.items()
        ]
    }


@app.get("/structure-patterns")
async def get_structure_patterns():
    """获取所有结构模式定义"""
    return {
        "patterns": [
            {"id": k, "name": v, "description": _get_pattern_description(v)}
            for k, v in STRUCTURE_PATTERNS.items()
        ]
    }


# ========== 辅助函数 ==========

def _rule_based_hierarchy_prediction(doc_graph: DocumentGraph) -> List[HierarchyPrediction]:
    """
    基于规则的层级预测（ML 不可用时的降级方案）
    """
    predictions = []
    doc_height = doc_graph.doc_height or 1080
    
    for node in doc_graph.nodes:
        # 基于位置的简单规则
        y_ratio = node.bounds.y / doc_height if doc_height > 0 else 0
        
        if y_ratio < 0.15:
            role = "branding" if node.element_type in ["image_linked", "image_embedded"] else "navigation"
            conf = 0.6
        elif y_ratio > 0.85:
            role = "navigation"
            conf = 0.5
        elif node.element_type == "text":
            if node.font_size and node.font_size > 24:
                role = "content_primary"
                conf = 0.7
            else:
                role = "content_secondary"
                conf = 0.5
        elif node.element_type in ["image_linked", "image_embedded"]:
            if node.bounds.area > doc_graph.doc_width * doc_graph.doc_height * 0.1:
                role = "content_primary"
                conf = 0.6
            else:
                role = "decoration"
                conf = 0.4
        elif node.element_type == "group":
            role = "content_container"
            conf = 0.5
        else:
            role = "decoration"
            conf = 0.3
        
        predictions.append(HierarchyPrediction(
            element_id=node.id,
            predicted_role=role,
            confidence=conf,
            all_probabilities={role: conf}
        ))
    
    return predictions


def _build_graph_tensors(doc_graph: DocumentGraph, device: str):
    """
    构建 PyTorch 图张量
    """
    import torch
    
    num_nodes = len(doc_graph.nodes)
    
    # 简单的节点特征（位置 + 大小 + 类型编码）
    node_features = []
    type_map = {"text": 0, "image_embedded": 1, "image_linked": 1, "group": 2, "path": 3}
    
    for node in doc_graph.nodes:
        features = [
            node.bounds.x / (doc_graph.doc_width or 1),
            node.bounds.y / (doc_graph.doc_height or 1),
            node.bounds.width / (doc_graph.doc_width or 1),
            node.bounds.height / (doc_graph.doc_height or 1),
            node.depth / 10.0,
            type_map.get(node.element_type, 4) / 5.0,
            node.opacity / 100.0,
            1.0 if node.is_replaceable else 0.0
        ]
        # 填充到目标维度
        features.extend([0.0] * (config.graph_hidden_dim - len(features)))
        node_features.append(features[:config.graph_hidden_dim])
    
    node_features = torch.tensor(node_features, dtype=torch.float32, device=device)
    
    # 边索引
    edge_src = []
    edge_tgt = []
    for edge in doc_graph.edges:
        src_idx = next((i for i, n in enumerate(doc_graph.nodes) if n.id == edge.source_id), None)
        tgt_idx = next((i for i, n in enumerate(doc_graph.nodes) if n.id == edge.target_id), None)
        if src_idx is not None and tgt_idx is not None:
            edge_src.append(src_idx)
            edge_tgt.append(tgt_idx)
    
    if not edge_src:
        # 如果没有边，添加自环
        edge_src = list(range(num_nodes))
        edge_tgt = list(range(num_nodes))
    
    edge_index = torch.tensor([edge_src, edge_tgt], dtype=torch.long, device=device)
    
    return node_features, edge_index


def _get_role_description(role: str) -> str:
    """获取角色描述"""
    descriptions = {
        "background": "背景层，通常是最底层的装饰元素",
        "decoration": "装饰性元素，如线条、形状、图案等",
        "content_container": "内容容器，包含其他元素的分组",
        "content_primary": "主要内容，如标题、主图等重要元素",
        "content_secondary": "次要内容，如正文、说明文字等",
        "navigation": "导航元素，如菜单、按钮、链接等",
        "branding": "品牌元素，如 Logo、口号等",
        "interactive": "交互元素，如按钮、输入框等"
    }
    return descriptions.get(role, "")


def _get_pattern_description(pattern: str) -> str:
    """获取模式描述"""
    descriptions = {
        "single_element": "单独的元素",
        "card": "卡片布局",
        "card_grid": "卡片网格",
        "list_vertical": "垂直列表",
        "list_horizontal": "水平列表",
        "form": "表单布局",
        "timeline": "时间线",
        "hero_section": "英雄区/主视觉区",
        "header": "页头",
        "footer": "页脚",
        "sidebar": "侧边栏",
        "gallery": "图库/相册"
    }
    return descriptions.get(pattern, "")


# ========== 主入口 ==========

def main():
    """启动服务"""
    print("=" * 60)
    print("  AI Template Parser - ML Service")
    print("=" * 60)
    print(f"  ML Available: {ML_AVAILABLE}")
    print(f"  Data Dir: {config.data_dir}")
    print(f"  Models Dir: {config.models_dir}")
    print(f"  Server: http://{config.host}:{config.port}")
    print("=" * 60)
    
    uvicorn.run(
        "server:app",
        host=config.host,
        port=config.port,
        reload=config.debug
    )


if __name__ == "__main__":
    main()
