"""
AI Template Parser - 数据标注格式定义
用于深度学习训练的标准化数据结构
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Tuple, Any
from enum import Enum
from datetime import datetime


# ========== 枚举定义 ==========

class HierarchyRole(str, Enum):
    """层级角色"""
    BACKGROUND = "background"
    DECORATION = "decoration"
    CONTENT_CONTAINER = "content_container"
    CONTENT_PRIMARY = "content_primary"
    CONTENT_SECONDARY = "content_secondary"
    NAVIGATION = "navigation"
    BRANDING = "branding"
    INTERACTIVE = "interactive"


class StructurePattern(str, Enum):
    """结构模式"""
    SINGLE_ELEMENT = "single_element"
    CARD = "card"
    CARD_GRID = "card_grid"
    LIST_VERTICAL = "list_vertical"
    LIST_HORIZONTAL = "list_horizontal"
    FORM = "form"
    TIMELINE = "timeline"
    HERO_SECTION = "hero_section"
    HEADER = "header"
    FOOTER = "footer"
    SIDEBAR = "sidebar"
    GALLERY = "gallery"


class EdgeType(str, Enum):
    """边类型"""
    CONTAINS = "contains"
    SIBLING = "sibling"
    OVERLAPS = "overlaps"
    ALIGNED_H = "aligned_h"
    ALIGNED_V = "aligned_v"
    SIMILAR_VISUAL = "similar_visual"
    SIMILAR_SIZE = "similar_size"
    SEMANTIC_RELATED = "semantic_related"


# ========== 基础数据结构 ==========

class BoundingBox(BaseModel):
    """边界框"""
    x: float
    y: float
    width: float
    height: float
    
    @property
    def center(self) -> Tuple[float, float]:
        return (self.x + self.width / 2, self.y + self.height / 2)
    
    @property
    def area(self) -> float:
        return self.width * self.height


class ColorInfo(BaseModel):
    """颜色信息"""
    hex: Optional[str] = None
    rgb: Optional[Tuple[int, int, int]] = None
    dominant_colors: Optional[List[str]] = None  # 主色调列表


class VisualFeatures(BaseModel):
    """视觉特征（由 CNN 提取）"""
    feature_vector: Optional[List[float]] = None  # 特征向量
    edge_density: Optional[float] = None          # 边缘密度
    texture_complexity: Optional[float] = None    # 纹理复杂度
    color_variance: Optional[float] = None        # 颜色方差
    contrast_score: Optional[float] = None        # 对比度分数


# ========== 元素数据结构 ==========

class ElementNode(BaseModel):
    """元素节点 - 训练数据的核心单元"""
    
    # 基础标识
    id: str = Field(..., description="元素唯一ID")
    element_type: str = Field(..., description="元素类型: text/image/path/group等")
    name: Optional[str] = Field(None, description="元素名称")
    
    # 层级信息
    layer_index: int = Field(..., description="图层索引")
    layer_name: str = Field("", description="图层名称")
    depth: int = Field(0, description="嵌套深度")
    parent_id: Optional[str] = Field(None, description="父元素ID")
    children_ids: List[str] = Field(default_factory=list, description="子元素ID列表")
    
    # 空间信息
    bounds: BoundingBox = Field(..., description="边界框")
    z_index: int = Field(0, description="Z轴顺序（堆叠顺序）")
    
    # 样式信息
    opacity: float = Field(100.0, description="不透明度")
    blend_mode: str = Field("NORMAL", description="混合模式")
    fill_color: Optional[ColorInfo] = None
    stroke_color: Optional[ColorInfo] = None
    
    # 内容信息（文本元素）
    text_content: Optional[str] = None
    font_size: Optional[float] = None
    font_name: Optional[str] = None
    
    # 视觉特征（由 ML 模型提取）
    visual_features: Optional[VisualFeatures] = None
    
    # ========== 标注信息（需要人工标注）==========
    
    # 层级角色标注
    hierarchy_role: Optional[HierarchyRole] = Field(
        None, 
        description="层级角色标注"
    )
    hierarchy_confidence: Optional[float] = Field(
        None,
        description="标注置信度 (0-1)"
    )
    
    # 所属逻辑分组
    logical_group_id: Optional[str] = Field(
        None,
        description="所属逻辑分组ID"
    )
    
    # 语义标签
    semantic_tags: List[str] = Field(
        default_factory=list,
        description="语义标签列表"
    )
    
    # 是否可替换
    is_replaceable: bool = Field(False, description="是否为可替换变量")
    variable_type: Optional[str] = Field(None, description="变量类型")


class EdgeRelation(BaseModel):
    """边关系 - 描述两个元素之间的关系"""
    
    source_id: str = Field(..., description="源元素ID")
    target_id: str = Field(..., description="目标元素ID")
    edge_type: EdgeType = Field(..., description="边类型")
    weight: float = Field(1.0, description="边权重")
    
    # 可选的附加信息
    distance: Optional[float] = None  # 空间距离
    overlap_ratio: Optional[float] = None  # 重叠比例
    alignment_offset: Optional[float] = None  # 对齐偏移


class LogicalGroup(BaseModel):
    """逻辑分组 - 描述一组相关元素"""
    
    id: str = Field(..., description="分组ID")
    name: Optional[str] = Field(None, description="分组名称")
    element_ids: List[str] = Field(..., description="包含的元素ID列表")
    
    # 结构模式标注
    pattern: Optional[StructurePattern] = Field(
        None,
        description="结构模式标注"
    )
    pattern_confidence: Optional[float] = Field(
        None,
        description="模式标注置信度"
    )
    
    # 分组边界
    bounds: Optional[BoundingBox] = None
    
    # 父分组（支持嵌套）
    parent_group_id: Optional[str] = None
    children_group_ids: List[str] = Field(default_factory=list)


# ========== 文档级数据结构 ==========

class DocumentGraph(BaseModel):
    """文档图结构 - 完整的训练样本"""
    
    # 元数据
    doc_id: str = Field(..., description="文档ID")
    doc_name: str = Field(..., description="文档名称")
    doc_width: float = Field(..., description="文档宽度")
    doc_height: float = Field(..., description="文档高度")
    
    # 来源信息
    source_file: str = Field(..., description="源AI文件路径")
    export_time: datetime = Field(default_factory=datetime.now)
    parser_version: str = Field("3.0", description="解析器版本")
    
    # 图结构数据
    nodes: List[ElementNode] = Field(..., description="所有元素节点")
    edges: List[EdgeRelation] = Field(default_factory=list, description="边关系列表")
    
    # 逻辑分组
    logical_groups: List[LogicalGroup] = Field(
        default_factory=list,
        description="逻辑分组列表"
    )
    
    # 图层信息
    layers: List[Dict[str, Any]] = Field(default_factory=list)
    
    # 标注状态
    annotation_status: str = Field(
        "pending",
        description="标注状态: pending/partial/complete"
    )
    annotator: Optional[str] = Field(None, description="标注者")
    annotation_time: Optional[datetime] = None
    
    # 验证
    is_validated: bool = Field(False, description="是否已验证")
    validation_notes: Optional[str] = None


# ========== 训练批次数据 ==========

class TrainingBatch(BaseModel):
    """训练批次"""
    
    batch_id: str
    documents: List[DocumentGraph]
    created_at: datetime = Field(default_factory=datetime.now)
    
    # 统计信息
    total_nodes: int = 0
    total_edges: int = 0
    total_groups: int = 0
    
    def compute_stats(self):
        """计算统计信息"""
        self.total_nodes = sum(len(doc.nodes) for doc in self.documents)
        self.total_edges = sum(len(doc.edges) for doc in self.documents)
        self.total_groups = sum(len(doc.logical_groups) for doc in self.documents)


# ========== 标注任务 ==========

class AnnotationTask(BaseModel):
    """标注任务"""
    
    task_id: str
    doc_id: str
    task_type: str = Field(
        "full",
        description="任务类型: full/hierarchy/grouping/review"
    )
    
    # 任务范围
    element_ids: Optional[List[str]] = Field(
        None,
        description="需要标注的元素ID（None表示全部）"
    )
    
    # 状态
    status: str = Field("pending", description="pending/in_progress/completed")
    assigned_to: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    
    # 标注结果
    annotations: Dict[str, Any] = Field(default_factory=dict)
