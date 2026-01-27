"""
AI Template Parser - ML Service Configuration
深度学习服务配置
"""

from pathlib import Path
from pydantic import BaseModel
from typing import Optional
import os


class MLServiceConfig(BaseModel):
    """ML服务配置"""
    
    # 服务配置
    host: str = "127.0.0.1"
    port: int = 8765
    debug: bool = True
    
    # 路径配置
    project_root: Path = Path(__file__).parent.parent.parent
    data_dir: Path = project_root / "ml_data"
    models_dir: Path = project_root / "ml_models"
    cache_dir: Path = project_root / "ml_cache"
    
    # 模型配置
    visual_encoder: str = "mobilenetv3_small_100"  # timm 模型名
    visual_feature_dim: int = 576  # MobileNetV3-Small 输出维度
    graph_hidden_dim: int = 256
    graph_output_dim: int = 128
    num_hierarchy_classes: int = 8  # 层级角色类别数
    num_pattern_classes: int = 12  # 结构模式类别数
    
    # 训练配置
    batch_size: int = 16
    learning_rate: float = 1e-4
    epochs: int = 50
    
    # 推理配置
    confidence_threshold: float = 0.7
    use_gpu: bool = True
    
    class Config:
        arbitrary_types_allowed = True


# 层级角色定义
HIERARCHY_ROLES = {
    0: "background",           # 背景层
    1: "decoration",           # 装饰元素
    2: "content_container",    # 内容容器
    3: "content_primary",      # 主要内容
    4: "content_secondary",    # 次要内容
    5: "navigation",           # 导航元素
    6: "branding",             # 品牌元素
    7: "interactive",          # 交互元素
}

# 结构模式定义
STRUCTURE_PATTERNS = {
    0: "single_element",       # 单独元素
    1: "card",                 # 卡片
    2: "card_grid",            # 卡片网格
    3: "list_vertical",        # 垂直列表
    4: "list_horizontal",      # 水平列表
    5: "form",                 # 表单
    6: "timeline",             # 时间线
    7: "hero_section",         # 英雄区
    8: "header",               # 页头
    9: "footer",               # 页脚
    10: "sidebar",             # 侧边栏
    11: "gallery",             # 图库
}

# 边类型定义
EDGE_TYPES = {
    "contains": 0,             # 包含关系
    "sibling": 1,              # 同级关系
    "overlaps": 2,             # 空间重叠
    "aligned_h": 3,            # 水平对齐
    "aligned_v": 4,            # 垂直对齐
    "similar_visual": 5,       # 视觉相似
    "similar_size": 6,         # 尺寸相似
    "semantic_related": 7,     # 语义关联
}


def get_config() -> MLServiceConfig:
    """获取配置实例"""
    config = MLServiceConfig()
    
    # 确保目录存在
    config.data_dir.mkdir(parents=True, exist_ok=True)
    config.models_dir.mkdir(parents=True, exist_ok=True)
    config.cache_dir.mkdir(parents=True, exist_ok=True)
    
    return config
