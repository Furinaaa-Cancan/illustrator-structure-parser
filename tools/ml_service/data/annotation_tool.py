"""
AI Template Parser - 标注工具
用于人工标注层次结构数据的命令行/Web 工具
"""

import json
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime
import argparse

from .schema import (
    DocumentGraph, ElementNode, LogicalGroup,
    HierarchyRole, StructurePattern, AnnotationTask
)
from .converter import StructureToGraphConverter


class AnnotationManager:
    """标注管理器"""
    
    def __init__(self, data_dir: str = "ml_data"):
        self.data_dir = Path(data_dir)
        self.annotations_dir = self.data_dir / "annotations"
        self.tasks_dir = self.data_dir / "tasks"
        self.exports_dir = self.data_dir / "exports"
        
        # 创建目录
        for d in [self.annotations_dir, self.tasks_dir, self.exports_dir]:
            d.mkdir(parents=True, exist_ok=True)
        
        self.converter = StructureToGraphConverter()
    
    def import_structure(self, structure_path: str) -> DocumentGraph:
        """
        导入 structure.json 并创建标注任务
        """
        doc_graph = self.converter.convert(structure_path)
        
        # 保存转换后的图结构
        graph_path = self.annotations_dir / f"{doc_graph.doc_id}_graph.json"
        with open(graph_path, 'w', encoding='utf-8') as f:
            f.write(doc_graph.model_dump_json(indent=2))
        
        # 创建标注任务
        task = AnnotationTask(
            task_id=f"task_{doc_graph.doc_id}",
            doc_id=doc_graph.doc_id,
            task_type="full",
            status="pending"
        )
        
        task_path = self.tasks_dir / f"{task.task_id}.json"
        with open(task_path, 'w', encoding='utf-8') as f:
            f.write(task.model_dump_json(indent=2))
        
        print(f"Imported: {structure_path}")
        print(f"  Doc ID: {doc_graph.doc_id}")
        print(f"  Elements: {len(doc_graph.nodes)}")
        print(f"  Edges: {len(doc_graph.edges)}")
        print(f"  Task created: {task.task_id}")
        
        return doc_graph
    
    def annotate_element(
        self,
        doc_id: str,
        element_id: str,
        hierarchy_role: Optional[str] = None,
        logical_group_id: Optional[str] = None,
        semantic_tags: Optional[List[str]] = None
    ) -> bool:
        """
        标注单个元素
        """
        # 加载图结构
        graph_path = self.annotations_dir / f"{doc_id}_graph.json"
        if not graph_path.exists():
            print(f"Error: Document {doc_id} not found")
            return False
        
        with open(graph_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        doc_graph = DocumentGraph(**data)
        
        # 查找并更新元素
        element_found = False
        for node in doc_graph.nodes:
            if node.id == element_id:
                if hierarchy_role:
                    node.hierarchy_role = HierarchyRole(hierarchy_role)
                    node.hierarchy_confidence = 1.0  # 人工标注置信度为 1
                if logical_group_id:
                    node.logical_group_id = logical_group_id
                if semantic_tags:
                    node.semantic_tags = semantic_tags
                element_found = True
                break
        
        if not element_found:
            print(f"Error: Element {element_id} not found in document {doc_id}")
            return False
        
        # 更新标注状态
        annotated_count = sum(1 for n in doc_graph.nodes if n.hierarchy_role is not None)
        if annotated_count == len(doc_graph.nodes):
            doc_graph.annotation_status = "complete"
        elif annotated_count > 0:
            doc_graph.annotation_status = "partial"
        
        doc_graph.annotation_time = datetime.now()
        
        # 保存
        with open(graph_path, 'w', encoding='utf-8') as f:
            f.write(doc_graph.model_dump_json(indent=2))
        
        print(f"Annotated element {element_id}: role={hierarchy_role}, group={logical_group_id}")
        return True
    
    def create_logical_group(
        self,
        doc_id: str,
        group_id: str,
        element_ids: List[str],
        pattern: Optional[str] = None,
        name: Optional[str] = None
    ) -> bool:
        """
        创建逻辑分组
        """
        graph_path = self.annotations_dir / f"{doc_id}_graph.json"
        if not graph_path.exists():
            print(f"Error: Document {doc_id} not found")
            return False
        
        with open(graph_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        doc_graph = DocumentGraph(**data)
        
        # 验证元素存在
        node_ids = {n.id for n in doc_graph.nodes}
        for eid in element_ids:
            if eid not in node_ids:
                print(f"Error: Element {eid} not found")
                return False
        
        # 创建分组
        group = LogicalGroup(
            id=group_id,
            name=name,
            element_ids=element_ids,
            pattern=StructurePattern(pattern) if pattern else None,
            pattern_confidence=1.0 if pattern else None
        )
        
        # 计算分组边界
        group_nodes = [n for n in doc_graph.nodes if n.id in element_ids]
        if group_nodes:
            from .schema import BoundingBox
            min_x = min(n.bounds.x for n in group_nodes)
            min_y = min(n.bounds.y for n in group_nodes)
            max_x = max(n.bounds.x + n.bounds.width for n in group_nodes)
            max_y = max(n.bounds.y + n.bounds.height for n in group_nodes)
            group.bounds = BoundingBox(
                x=min_x, y=min_y,
                width=max_x - min_x,
                height=max_y - min_y
            )
        
        # 添加到文档
        doc_graph.logical_groups.append(group)
        
        # 更新元素的分组引用
        for node in doc_graph.nodes:
            if node.id in element_ids:
                node.logical_group_id = group_id
        
        # 保存
        with open(graph_path, 'w', encoding='utf-8') as f:
            f.write(doc_graph.model_dump_json(indent=2))
        
        print(f"Created group {group_id} with {len(element_ids)} elements, pattern={pattern}")
        return True
    
    def export_training_data(self, output_path: str) -> Dict[str, Any]:
        """
        导出所有已标注数据为训练格式
        """
        training_data = {
            "version": "1.0",
            "exported_at": datetime.now().isoformat(),
            "documents": [],
            "statistics": {
                "total_documents": 0,
                "total_nodes": 0,
                "total_edges": 0,
                "total_groups": 0,
                "annotated_nodes": 0,
                "role_distribution": {},
                "pattern_distribution": {}
            }
        }
        
        # 收集所有已标注的文档
        for graph_file in self.annotations_dir.glob("*_graph.json"):
            with open(graph_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            doc_graph = DocumentGraph(**data)
            
            # 只导出已标注的文档
            if doc_graph.annotation_status in ["partial", "complete"]:
                training_data["documents"].append(data)
                
                # 更新统计
                training_data["statistics"]["total_documents"] += 1
                training_data["statistics"]["total_nodes"] += len(doc_graph.nodes)
                training_data["statistics"]["total_edges"] += len(doc_graph.edges)
                training_data["statistics"]["total_groups"] += len(doc_graph.logical_groups)
                
                for node in doc_graph.nodes:
                    if node.hierarchy_role:
                        training_data["statistics"]["annotated_nodes"] += 1
                        role = node.hierarchy_role.value
                        training_data["statistics"]["role_distribution"][role] = \
                            training_data["statistics"]["role_distribution"].get(role, 0) + 1
                
                for group in doc_graph.logical_groups:
                    if group.pattern:
                        pattern = group.pattern.value
                        training_data["statistics"]["pattern_distribution"][pattern] = \
                            training_data["statistics"]["pattern_distribution"].get(pattern, 0) + 1
        
        # 保存
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(training_data, f, ensure_ascii=False, indent=2)
        
        print(f"Exported training data to {output_path}")
        print(f"  Documents: {training_data['statistics']['total_documents']}")
        print(f"  Annotated nodes: {training_data['statistics']['annotated_nodes']}")
        print(f"  Groups: {training_data['statistics']['total_groups']}")
        
        return training_data
    
    def get_annotation_progress(self, doc_id: str) -> Dict[str, Any]:
        """
        获取标注进度
        """
        graph_path = self.annotations_dir / f"{doc_id}_graph.json"
        if not graph_path.exists():
            return {"error": f"Document {doc_id} not found"}
        
        with open(graph_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        doc_graph = DocumentGraph(**data)
        
        total = len(doc_graph.nodes)
        annotated = sum(1 for n in doc_graph.nodes if n.hierarchy_role is not None)
        
        return {
            "doc_id": doc_id,
            "status": doc_graph.annotation_status,
            "total_elements": total,
            "annotated_elements": annotated,
            "progress_percent": round(annotated / total * 100, 1) if total > 0 else 0,
            "logical_groups": len(doc_graph.logical_groups)
        }
    
    def list_pending_elements(self, doc_id: str, limit: int = 20) -> List[Dict]:
        """
        列出待标注元素
        """
        graph_path = self.annotations_dir / f"{doc_id}_graph.json"
        if not graph_path.exists():
            return []
        
        with open(graph_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        doc_graph = DocumentGraph(**data)
        
        pending = []
        for node in doc_graph.nodes:
            if node.hierarchy_role is None:
                pending.append({
                    "id": node.id,
                    "type": node.element_type,
                    "name": node.name,
                    "bounds": node.bounds.model_dump() if node.bounds else None,
                    "text_content": node.text_content[:50] if node.text_content else None,
                    "semantic_tags": node.semantic_tags
                })
                if len(pending) >= limit:
                    break
        
        return pending


def interactive_annotate(manager: AnnotationManager, doc_id: str):
    """
    交互式标注（命令行）
    """
    print("\n" + "=" * 60)
    print("AI Template Parser - 交互式标注工具")
    print("=" * 60)
    
    roles = list(HierarchyRole)
    patterns = list(StructurePattern)
    
    print("\n可用的层级角色:")
    for i, role in enumerate(roles):
        print(f"  {i}: {role.value}")
    
    print("\n命令:")
    print("  r <element_id> <role_index>  - 标注层级角色")
    print("  g <group_id> <elem1,elem2,...> [pattern_index]  - 创建分组")
    print("  p  - 显示进度")
    print("  l  - 列出待标注元素")
    print("  q  - 退出")
    
    while True:
        progress = manager.get_annotation_progress(doc_id)
        print(f"\n[进度: {progress['progress_percent']}%] ", end="")
        
        try:
            cmd = input("> ").strip()
        except EOFError:
            break
        
        if not cmd:
            continue
        
        parts = cmd.split()
        action = parts[0].lower()
        
        if action == 'q':
            break
        elif action == 'p':
            print(json.dumps(progress, indent=2, ensure_ascii=False))
        elif action == 'l':
            pending = manager.list_pending_elements(doc_id)
            for elem in pending:
                print(f"  {elem['id']}: {elem['type']} - {elem.get('text_content') or elem.get('name') or '(unnamed)'}")
        elif action == 'r' and len(parts) >= 3:
            elem_id = parts[1]
            role_idx = int(parts[2])
            if 0 <= role_idx < len(roles):
                manager.annotate_element(doc_id, elem_id, roles[role_idx].value)
            else:
                print("Invalid role index")
        elif action == 'g' and len(parts) >= 3:
            group_id = parts[1]
            elem_ids = parts[2].split(',')
            pattern_idx = int(parts[3]) if len(parts) > 3 else None
            pattern = patterns[pattern_idx].value if pattern_idx is not None and 0 <= pattern_idx < len(patterns) else None
            manager.create_logical_group(doc_id, group_id, elem_ids, pattern)
        else:
            print("Unknown command. Type 'q' to quit.")
    
    print("\n标注会话结束")


def main():
    """命令行入口"""
    parser = argparse.ArgumentParser(description='AI Template Parser 标注工具')
    subparsers = parser.add_subparsers(dest='command', help='子命令')
    
    # import 命令
    import_parser = subparsers.add_parser('import', help='导入 structure.json')
    import_parser.add_argument('path', help='structure.json 文件路径')
    import_parser.add_argument('--data-dir', default='ml_data', help='数据目录')
    
    # annotate 命令
    annotate_parser = subparsers.add_parser('annotate', help='交互式标注')
    annotate_parser.add_argument('doc_id', help='文档 ID')
    annotate_parser.add_argument('--data-dir', default='ml_data', help='数据目录')
    
    # export 命令
    export_parser = subparsers.add_parser('export', help='导出训练数据')
    export_parser.add_argument('-o', '--output', default='training_data.json', help='输出文件')
    export_parser.add_argument('--data-dir', default='ml_data', help='数据目录')
    
    # progress 命令
    progress_parser = subparsers.add_parser('progress', help='查看标注进度')
    progress_parser.add_argument('doc_id', help='文档 ID')
    progress_parser.add_argument('--data-dir', default='ml_data', help='数据目录')
    
    args = parser.parse_args()
    
    if args.command == 'import':
        manager = AnnotationManager(args.data_dir)
        manager.import_structure(args.path)
    
    elif args.command == 'annotate':
        manager = AnnotationManager(args.data_dir)
        interactive_annotate(manager, args.doc_id)
    
    elif args.command == 'export':
        manager = AnnotationManager(args.data_dir)
        manager.export_training_data(args.output)
    
    elif args.command == 'progress':
        manager = AnnotationManager(args.data_dir)
        progress = manager.get_annotation_progress(args.doc_id)
        print(json.dumps(progress, indent=2, ensure_ascii=False))
    
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
