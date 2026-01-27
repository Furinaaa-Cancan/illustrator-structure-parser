"""
AI Template Parser - 数据转换器
将 AI_Template_Parser 输出的 JSON 转换为 ML 训练数据格式
"""

import json
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import hashlib

from .schema import (
    DocumentGraph, ElementNode, EdgeRelation, LogicalGroup,
    BoundingBox, ColorInfo, EdgeType, HierarchyRole
)


class StructureToGraphConverter:
    """将 structure.json 转换为图结构数据"""
    
    def __init__(self, alignment_threshold: float = 10.0, overlap_threshold: float = 0.1):
        """
        Args:
            alignment_threshold: 对齐检测阈值（像素）
            overlap_threshold: 重叠检测阈值（比例）
        """
        self.alignment_threshold = alignment_threshold
        self.overlap_threshold = overlap_threshold
    
    def convert(self, structure_path: str) -> DocumentGraph:
        """
        转换 structure.json 为 DocumentGraph
        
        Args:
            structure_path: structure.json 文件路径
            
        Returns:
            DocumentGraph 对象
        """
        with open(structure_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 提取文档信息
        doc_info = data.get('document', {})
        doc_id = self._generate_doc_id(structure_path, doc_info.get('name', ''))
        
        # 转换节点
        nodes = self._convert_elements(data.get('elements', []))
        
        # 生成边关系
        edges = self._generate_edges(nodes, doc_info)
        
        # 构建文档图
        doc_graph = DocumentGraph(
            doc_id=doc_id,
            doc_name=doc_info.get('name', 'Unknown'),
            doc_width=doc_info.get('width', 0),
            doc_height=doc_info.get('height', 0),
            source_file=structure_path,
            export_time=datetime.now(),
            parser_version=data.get('meta', {}).get('version', '3.0'),
            nodes=nodes,
            edges=edges,
            layers=data.get('layers', []),
            annotation_status='pending'
        )
        
        return doc_graph
    
    def _generate_doc_id(self, path: str, name: str) -> str:
        """生成文档唯一ID"""
        content = f"{path}_{name}_{datetime.now().isoformat()}"
        return hashlib.md5(content.encode()).hexdigest()[:12]
    
    def _convert_elements(self, elements: List[Dict]) -> List[ElementNode]:
        """转换元素列表"""
        nodes = []
        
        for elem in elements:
            node = self._convert_single_element(elem)
            if node:
                nodes.append(node)
        
        return nodes
    
    def _convert_single_element(self, elem: Dict) -> Optional[ElementNode]:
        """转换单个元素"""
        try:
            # 提取边界框
            bounds_data = elem.get('bounds', {})
            if not bounds_data:
                pos = elem.get('position', {})
                size = elem.get('size', {})
                bounds = BoundingBox(
                    x=pos.get('x', 0),
                    y=pos.get('y', 0),
                    width=size.get('width', 0),
                    height=size.get('height', 0)
                )
            else:
                bounds = BoundingBox(
                    x=bounds_data.get('left', 0),
                    y=bounds_data.get('top', 0),
                    width=bounds_data.get('width', 0),
                    height=bounds_data.get('height', 0)
                )
            
            # 提取颜色信息
            fill_color = None
            if 'fillColor' in elem:
                fill_color = self._extract_color(elem['fillColor'])
            elif 'style' in elem and 'fillColor' in elem['style']:
                fill_color = self._extract_color(elem['style']['fillColor'])
            
            # 构建节点
            node = ElementNode(
                id=elem.get('id', ''),
                element_type=elem.get('type', 'unknown'),
                name=elem.get('name', ''),
                layer_index=elem.get('layerIndex', 0),
                layer_name=elem.get('layer', ''),
                depth=elem.get('depth', 0),
                parent_id=elem.get('parentId'),
                children_ids=[],  # 稍后填充
                bounds=bounds,
                z_index=elem.get('path', '0').count('/'),
                opacity=elem.get('opacity', 100),
                blend_mode=elem.get('blendMode', 'NORMAL'),
                fill_color=fill_color,
                text_content=elem.get('content'),
                font_size=elem.get('style', {}).get('fontSize'),
                font_name=elem.get('style', {}).get('fontName'),
                # 初步语义标签（从现有分析结果）
                semantic_tags=self._extract_semantic_tags(elem),
                is_replaceable=self._check_replaceable(elem),
                variable_type=self._extract_variable_type(elem)
            )
            
            return node
            
        except Exception as e:
            print(f"Warning: Failed to convert element {elem.get('id', 'unknown')}: {e}")
            return None
    
    def _extract_color(self, color_data: Dict) -> Optional[ColorInfo]:
        """提取颜色信息"""
        if not color_data:
            return None
        
        return ColorInfo(
            hex=color_data.get('hex'),
            rgb=tuple(color_data.get('rgb', {}).values()) if 'rgb' in color_data else None
        )
    
    def _extract_semantic_tags(self, elem: Dict) -> List[str]:
        """提取语义标签"""
        tags = []
        
        # 从 semantics 字段
        semantics = elem.get('semantics', {})
        if semantics:
            hints = semantics.get('hints', [])
            tags.extend(hints)
            if semantics.get('role'):
                tags.append(semantics['role'])
        
        # 从 prefixMark 字段
        prefix = elem.get('prefixMark', {})
        if prefix and prefix.get('role'):
            tags.append(prefix['role'])
        
        # 从 variable 字段
        variable = elem.get('variable', {})
        if variable:
            if variable.get('primaryType'):
                tags.append(variable['primaryType'])
            if variable.get('allTags'):
                tags.extend(variable['allTags'])
        
        return list(set(tags))  # 去重
    
    def _check_replaceable(self, elem: Dict) -> bool:
        """检查是否可替换"""
        if elem.get('replaceable'):
            return True
        if elem.get('semantics', {}).get('replaceable'):
            return True
        if elem.get('imageAnalysis', {}).get('replaceable'):
            return True
        if elem.get('prefixMark', {}).get('replaceable'):
            return True
        return False
    
    def _extract_variable_type(self, elem: Dict) -> Optional[str]:
        """提取变量类型"""
        variable = elem.get('variable', {})
        if variable:
            return variable.get('primaryType')
        
        prefix = elem.get('prefixMark', {})
        if prefix:
            return prefix.get('type')
        
        return None
    
    def _generate_edges(self, nodes: List[ElementNode], doc_info: Dict) -> List[EdgeRelation]:
        """生成边关系"""
        edges = []
        node_map = {n.id: n for n in nodes}
        
        for i, node in enumerate(nodes):
            # 1. 包含关系（父子）
            if node.parent_id and node.parent_id in node_map:
                edges.append(EdgeRelation(
                    source_id=node.parent_id,
                    target_id=node.id,
                    edge_type=EdgeType.CONTAINS,
                    weight=1.0
                ))
            
            # 2. 同级关系
            siblings = [n for n in nodes if n.parent_id == node.parent_id and n.id != node.id]
            for sibling in siblings:
                if node.id < sibling.id:  # 避免重复边
                    edges.append(EdgeRelation(
                        source_id=node.id,
                        target_id=sibling.id,
                        edge_type=EdgeType.SIBLING,
                        weight=1.0
                    ))
            
            # 3. 空间关系（只检查同层或相邻元素）
            for j in range(i + 1, min(i + 20, len(nodes))):  # 限制检查范围
                other = nodes[j]
                
                # 重叠检测
                overlap = self._calculate_overlap(node.bounds, other.bounds)
                if overlap > self.overlap_threshold:
                    edges.append(EdgeRelation(
                        source_id=node.id,
                        target_id=other.id,
                        edge_type=EdgeType.OVERLAPS,
                        weight=overlap,
                        overlap_ratio=overlap
                    ))
                
                # 对齐检测
                h_aligned, v_aligned, offset = self._check_alignment(node.bounds, other.bounds)
                if h_aligned:
                    edges.append(EdgeRelation(
                        source_id=node.id,
                        target_id=other.id,
                        edge_type=EdgeType.ALIGNED_H,
                        weight=1.0 - abs(offset) / 100,
                        alignment_offset=offset
                    ))
                if v_aligned:
                    edges.append(EdgeRelation(
                        source_id=node.id,
                        target_id=other.id,
                        edge_type=EdgeType.ALIGNED_V,
                        weight=1.0 - abs(offset) / 100,
                        alignment_offset=offset
                    ))
                
                # 尺寸相似检测
                size_sim = self._calculate_size_similarity(node.bounds, other.bounds)
                if size_sim > 0.8:
                    edges.append(EdgeRelation(
                        source_id=node.id,
                        target_id=other.id,
                        edge_type=EdgeType.SIMILAR_SIZE,
                        weight=size_sim
                    ))
        
        return edges
    
    def _calculate_overlap(self, b1: BoundingBox, b2: BoundingBox) -> float:
        """计算重叠比例"""
        x_overlap = max(0, min(b1.x + b1.width, b2.x + b2.width) - max(b1.x, b2.x))
        y_overlap = max(0, min(b1.y + b1.height, b2.y + b2.height) - max(b1.y, b2.y))
        
        overlap_area = x_overlap * y_overlap
        min_area = min(b1.area, b2.area)
        
        if min_area == 0:
            return 0
        
        return overlap_area / min_area
    
    def _check_alignment(self, b1: BoundingBox, b2: BoundingBox) -> Tuple[bool, bool, float]:
        """检查对齐关系"""
        threshold = self.alignment_threshold
        
        # 水平对齐（Y坐标接近）
        h_aligned = (
            abs(b1.y - b2.y) < threshold or  # 顶部对齐
            abs((b1.y + b1.height) - (b2.y + b2.height)) < threshold or  # 底部对齐
            abs(b1.center[1] - b2.center[1]) < threshold  # 中心对齐
        )
        h_offset = b1.center[1] - b2.center[1]
        
        # 垂直对齐（X坐标接近）
        v_aligned = (
            abs(b1.x - b2.x) < threshold or  # 左对齐
            abs((b1.x + b1.width) - (b2.x + b2.width)) < threshold or  # 右对齐
            abs(b1.center[0] - b2.center[0]) < threshold  # 中心对齐
        )
        v_offset = b1.center[0] - b2.center[0]
        
        return h_aligned, v_aligned, h_offset if h_aligned else v_offset
    
    def _calculate_size_similarity(self, b1: BoundingBox, b2: BoundingBox) -> float:
        """计算尺寸相似度"""
        if b1.area == 0 or b2.area == 0:
            return 0
        
        width_sim = min(b1.width, b2.width) / max(b1.width, b2.width) if max(b1.width, b2.width) > 0 else 0
        height_sim = min(b1.height, b2.height) / max(b1.height, b2.height) if max(b1.height, b2.height) > 0 else 0
        
        return (width_sim + height_sim) / 2


def convert_structure_file(input_path: str, output_path: Optional[str] = None) -> DocumentGraph:
    """
    便捷函数：转换单个 structure.json 文件
    
    Args:
        input_path: 输入文件路径
        output_path: 输出文件路径（可选）
        
    Returns:
        DocumentGraph 对象
    """
    converter = StructureToGraphConverter()
    doc_graph = converter.convert(input_path)
    
    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(doc_graph.model_dump_json(indent=2))
    
    return doc_graph


def batch_convert(input_dir: str, output_dir: str) -> List[DocumentGraph]:
    """
    批量转换目录下的所有 structure.json 文件
    
    Args:
        input_dir: 输入目录
        output_dir: 输出目录
        
    Returns:
        DocumentGraph 列表
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    results = []
    converter = StructureToGraphConverter()
    
    for json_file in input_path.glob("**/structure.json"):
        try:
            doc_graph = converter.convert(str(json_file))
            
            # 保存转换结果
            out_file = output_path / f"{doc_graph.doc_id}_graph.json"
            with open(out_file, 'w', encoding='utf-8') as f:
                f.write(doc_graph.model_dump_json(indent=2))
            
            results.append(doc_graph)
            print(f"Converted: {json_file.name} -> {out_file.name}")
            
        except Exception as e:
            print(f"Error converting {json_file}: {e}")
    
    return results
