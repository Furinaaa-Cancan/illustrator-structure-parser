"""
AI Template Parser - 模型训练脚本
训练层次结构分析的 GNN 模型
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import random

import numpy as np

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from config import get_config, HIERARCHY_ROLES, STRUCTURE_PATTERNS

# 尝试导入 PyTorch
try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import Dataset, DataLoader
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("Warning: PyTorch not available")

# 尝试导入 PyG
try:
    from torch_geometric.data import Data, Batch
    PYG_AVAILABLE = True
except ImportError:
    PYG_AVAILABLE = False


class HierarchyDataset(Dataset):
    """层次结构数据集"""
    
    def __init__(self, data_path: str, config: dict = None):
        """
        Args:
            data_path: 训练数据 JSON 文件路径
            config: 配置字典
        """
        self.config = config or {}
        self.samples = []
        
        # 加载数据
        with open(data_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 处理每个文档
        for doc_data in data.get('documents', []):
            sample = self._process_document(doc_data)
            if sample is not None:
                self.samples.append(sample)
        
        print(f"Loaded {len(self.samples)} documents from {data_path}")
    
    def _process_document(self, doc_data: Dict) -> Optional[Dict]:
        """处理单个文档数据"""
        nodes = doc_data.get('nodes', [])
        edges = doc_data.get('edges', [])
        
        if len(nodes) == 0:
            return None
        
        # 构建节点特征
        node_features = []
        node_labels = []
        node_id_to_idx = {}
        
        doc_width = doc_data.get('doc_width', 1920)
        doc_height = doc_data.get('doc_height', 1080)
        
        type_map = {
            "text": 0, "image_embedded": 1, "image_linked": 1, 
            "group": 2, "clip_group": 2, "path": 3, "compound_path": 3
        }
        
        role_map = {role: idx for idx, role in HIERARCHY_ROLES.items()}
        
        for i, node in enumerate(nodes):
            node_id_to_idx[node['id']] = i
            
            # 提取特征
            bounds = node.get('bounds', {})
            x = bounds.get('x', 0)
            y = bounds.get('y', 0)
            w = bounds.get('width', 0)
            h = bounds.get('height', 0)
            
            features = [
                x / doc_width if doc_width > 0 else 0,  # 归一化 x
                y / doc_height if doc_height > 0 else 0,  # 归一化 y
                w / doc_width if doc_width > 0 else 0,  # 归一化宽度
                h / doc_height if doc_height > 0 else 0,  # 归一化高度
                node.get('depth', 0) / 10.0,  # 归一化深度
                type_map.get(node.get('element_type', ''), 4) / 5.0,  # 类型编码
                node.get('opacity', 100) / 100.0,  # 不透明度
                1.0 if node.get('is_replaceable', False) else 0.0,  # 可替换标志
            ]
            
            # 填充到目标维度
            target_dim = self.config.get('node_feature_dim', 256)
            features.extend([0.0] * (target_dim - len(features)))
            node_features.append(features[:target_dim])
            
            # 提取标签
            hierarchy_role = node.get('hierarchy_role')
            if hierarchy_role:
                label = role_map.get(hierarchy_role, -1)
            else:
                label = -1  # 未标注
            node_labels.append(label)
        
        # 构建边索引
        edge_src = []
        edge_tgt = []
        
        for edge in edges:
            src_id = edge.get('source_id')
            tgt_id = edge.get('target_id')
            
            if src_id in node_id_to_idx and tgt_id in node_id_to_idx:
                edge_src.append(node_id_to_idx[src_id])
                edge_tgt.append(node_id_to_idx[tgt_id])
        
        # 如果没有边，添加自环
        if not edge_src:
            edge_src = list(range(len(nodes)))
            edge_tgt = list(range(len(nodes)))
        
        return {
            'doc_id': doc_data.get('doc_id', ''),
            'node_features': np.array(node_features, dtype=np.float32),
            'node_labels': np.array(node_labels, dtype=np.int64),
            'edge_index': np.array([edge_src, edge_tgt], dtype=np.int64),
            'num_nodes': len(nodes)
        }
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        sample = self.samples[idx]
        
        if TORCH_AVAILABLE:
            return {
                'doc_id': sample['doc_id'],
                'node_features': torch.tensor(sample['node_features']),
                'node_labels': torch.tensor(sample['node_labels']),
                'edge_index': torch.tensor(sample['edge_index']),
                'num_nodes': sample['num_nodes']
            }
        
        return sample


def collate_fn(batch: List[Dict]) -> Dict:
    """
    批处理函数
    将多个样本合并为一个批次
    """
    if not TORCH_AVAILABLE:
        return batch
    
    # 合并节点特征
    all_features = []
    all_labels = []
    all_edges_src = []
    all_edges_tgt = []
    batch_indices = []
    
    node_offset = 0
    
    for i, sample in enumerate(batch):
        num_nodes = sample['num_nodes']
        
        all_features.append(sample['node_features'])
        all_labels.append(sample['node_labels'])
        
        # 调整边索引
        edges = sample['edge_index']
        all_edges_src.append(edges[0] + node_offset)
        all_edges_tgt.append(edges[1] + node_offset)
        
        # 批次索引
        batch_indices.extend([i] * num_nodes)
        
        node_offset += num_nodes
    
    return {
        'node_features': torch.cat(all_features, dim=0),
        'node_labels': torch.cat(all_labels, dim=0),
        'edge_index': torch.stack([
            torch.cat(all_edges_src),
            torch.cat(all_edges_tgt)
        ]),
        'batch': torch.tensor(batch_indices, dtype=torch.long),
        'num_graphs': len(batch)
    }


class Trainer:
    """模型训练器"""
    
    def __init__(
        self,
        model: nn.Module,
        config: dict,
        device: str = "cpu"
    ):
        self.model = model.to(device)
        self.config = config
        self.device = device
        
        # 优化器
        self.optimizer = optim.Adam(
            model.parameters(),
            lr=config.get('learning_rate', 1e-4),
            weight_decay=config.get('weight_decay', 1e-5)
        )
        
        # 学习率调度器
        self.scheduler = optim.lr_scheduler.ReduceLROnPlateau(
            self.optimizer,
            mode='min',
            factor=0.5,
            patience=5,
            verbose=True
        )
        
        # 损失函数（忽略未标注的样本，label=-1）
        self.criterion = nn.CrossEntropyLoss(ignore_index=-1)
        
        # 训练历史
        self.history = {
            'train_loss': [],
            'val_loss': [],
            'train_acc': [],
            'val_acc': []
        }
    
    def train_epoch(self, dataloader: DataLoader) -> Tuple[float, float]:
        """训练一个 epoch"""
        self.model.train()
        total_loss = 0
        correct = 0
        total = 0
        
        for batch in dataloader:
            # 移动到设备
            node_features = batch['node_features'].to(self.device)
            node_labels = batch['node_labels'].to(self.device)
            edge_index = batch['edge_index'].to(self.device)
            
            # 前向传播
            self.optimizer.zero_grad()
            outputs = self.model(node_features, edge_index)
            
            # 计算损失
            logits = outputs['hierarchy_logits']
            loss = self.criterion(logits, node_labels)
            
            # 反向传播
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
            self.optimizer.step()
            
            total_loss += loss.item()
            
            # 计算准确率（只计算有标签的样本）
            mask = node_labels >= 0
            if mask.sum() > 0:
                preds = logits[mask].argmax(dim=-1)
                correct += (preds == node_labels[mask]).sum().item()
                total += mask.sum().item()
        
        avg_loss = total_loss / len(dataloader)
        accuracy = correct / total if total > 0 else 0
        
        return avg_loss, accuracy
    
    @torch.no_grad()
    def evaluate(self, dataloader: DataLoader) -> Tuple[float, float]:
        """评估模型"""
        self.model.eval()
        total_loss = 0
        correct = 0
        total = 0
        
        for batch in dataloader:
            node_features = batch['node_features'].to(self.device)
            node_labels = batch['node_labels'].to(self.device)
            edge_index = batch['edge_index'].to(self.device)
            
            outputs = self.model(node_features, edge_index)
            logits = outputs['hierarchy_logits']
            
            loss = self.criterion(logits, node_labels)
            total_loss += loss.item()
            
            mask = node_labels >= 0
            if mask.sum() > 0:
                preds = logits[mask].argmax(dim=-1)
                correct += (preds == node_labels[mask]).sum().item()
                total += mask.sum().item()
        
        avg_loss = total_loss / len(dataloader) if len(dataloader) > 0 else 0
        accuracy = correct / total if total > 0 else 0
        
        return avg_loss, accuracy
    
    def train(
        self,
        train_loader: DataLoader,
        val_loader: Optional[DataLoader] = None,
        epochs: int = 50,
        save_dir: str = "checkpoints"
    ) -> Dict:
        """
        完整训练流程
        """
        save_path = Path(save_dir)
        save_path.mkdir(parents=True, exist_ok=True)
        
        best_val_loss = float('inf')
        best_epoch = 0
        
        print("\n" + "=" * 60)
        print("Starting training...")
        print(f"  Epochs: {epochs}")
        print(f"  Device: {self.device}")
        print("=" * 60)
        
        for epoch in range(epochs):
            # 训练
            train_loss, train_acc = self.train_epoch(train_loader)
            self.history['train_loss'].append(train_loss)
            self.history['train_acc'].append(train_acc)
            
            # 验证
            if val_loader:
                val_loss, val_acc = self.evaluate(val_loader)
                self.history['val_loss'].append(val_loss)
                self.history['val_acc'].append(val_acc)
                
                # 学习率调度
                self.scheduler.step(val_loss)
                
                # 保存最佳模型
                if val_loss < best_val_loss:
                    best_val_loss = val_loss
                    best_epoch = epoch
                    torch.save({
                        'epoch': epoch,
                        'model_state_dict': self.model.state_dict(),
                        'optimizer_state_dict': self.optimizer.state_dict(),
                        'val_loss': val_loss,
                        'val_acc': val_acc,
                        'config': self.config
                    }, save_path / "best_model.pt")
                
                print(f"Epoch {epoch+1:3d}/{epochs} | "
                      f"Train Loss: {train_loss:.4f} | Train Acc: {train_acc:.4f} | "
                      f"Val Loss: {val_loss:.4f} | Val Acc: {val_acc:.4f}")
            else:
                print(f"Epoch {epoch+1:3d}/{epochs} | "
                      f"Train Loss: {train_loss:.4f} | Train Acc: {train_acc:.4f}")
            
            # 定期保存检查点
            if (epoch + 1) % 10 == 0:
                torch.save({
                    'epoch': epoch,
                    'model_state_dict': self.model.state_dict(),
                    'optimizer_state_dict': self.optimizer.state_dict(),
                    'history': self.history,
                    'config': self.config
                }, save_path / f"checkpoint_epoch_{epoch+1}.pt")
        
        print("\n" + "=" * 60)
        print(f"Training completed!")
        if val_loader:
            print(f"Best validation loss: {best_val_loss:.4f} at epoch {best_epoch+1}")
        print("=" * 60)
        
        return self.history


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='训练层次结构分析模型')
    parser.add_argument('--data', required=True, help='训练数据路径')
    parser.add_argument('--val-data', help='验证数据路径')
    parser.add_argument('--output', default='checkpoints', help='输出目录')
    parser.add_argument('--epochs', type=int, default=50, help='训练轮数')
    parser.add_argument('--batch-size', type=int, default=4, help='批次大小')
    parser.add_argument('--lr', type=float, default=1e-4, help='学习率')
    parser.add_argument('--hidden-dim', type=int, default=256, help='隐藏层维度')
    parser.add_argument('--device', default='auto', help='设备 (auto/cpu/cuda/mps)')
    
    args = parser.parse_args()
    
    if not TORCH_AVAILABLE:
        print("Error: PyTorch is required for training")
        sys.exit(1)
    
    # 确定设备
    if args.device == 'auto':
        if torch.cuda.is_available():
            device = 'cuda'
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            device = 'mps'
        else:
            device = 'cpu'
    else:
        device = args.device
    
    print(f"Using device: {device}")
    
    # 配置
    config = {
        'node_feature_dim': args.hidden_dim,
        'hidden_dim': args.hidden_dim,
        'output_dim': 128,
        'num_hierarchy_classes': len(HIERARCHY_ROLES),
        'num_pattern_classes': len(STRUCTURE_PATTERNS),
        'learning_rate': args.lr,
        'weight_decay': 1e-5
    }
    
    # 加载数据
    print("\nLoading training data...")
    train_dataset = HierarchyDataset(args.data, config)
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        shuffle=True,
        collate_fn=collate_fn
    )
    
    val_loader = None
    if args.val_data:
        print("Loading validation data...")
        val_dataset = HierarchyDataset(args.val_data, config)
        val_loader = DataLoader(
            val_dataset,
            batch_size=args.batch_size,
            shuffle=False,
            collate_fn=collate_fn
        )
    
    # 创建模型
    print("\nCreating model...")
    from models.graph_model import HierarchyGNN
    model = HierarchyGNN(
        node_feature_dim=config['node_feature_dim'],
        hidden_dim=config['hidden_dim'],
        output_dim=config['output_dim'],
        num_hierarchy_classes=config['num_hierarchy_classes'],
        num_pattern_classes=config['num_pattern_classes']
    )
    
    # 训练
    trainer = Trainer(model, config, device)
    history = trainer.train(
        train_loader,
        val_loader,
        epochs=args.epochs,
        save_dir=args.output
    )
    
    # 保存训练历史
    with open(Path(args.output) / 'training_history.json', 'w') as f:
        json.dump(history, f, indent=2)
    
    print(f"\nModel saved to {args.output}/")


if __name__ == '__main__':
    main()
