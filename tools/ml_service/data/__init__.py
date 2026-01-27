"""
AI Template Parser - ML Data Module
数据标注和处理模块
"""

from .schema import (
    # 枚举
    HierarchyRole,
    StructurePattern,
    EdgeType,
    
    # 基础结构
    BoundingBox,
    ColorInfo,
    VisualFeatures,
    
    # 核心结构
    ElementNode,
    EdgeRelation,
    LogicalGroup,
    DocumentGraph,
    
    # 训练结构
    TrainingBatch,
    AnnotationTask,
)

__all__ = [
    "HierarchyRole",
    "StructurePattern", 
    "EdgeType",
    "BoundingBox",
    "ColorInfo",
    "VisualFeatures",
    "ElementNode",
    "EdgeRelation",
    "LogicalGroup",
    "DocumentGraph",
    "TrainingBatch",
    "AnnotationTask",
]
