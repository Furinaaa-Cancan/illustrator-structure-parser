"""
AI Template Parser - 图神经网络模型
用于学习文档层次结构的 GNN 模型
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Optional, Tuple
import numpy as np

# 尝试导入 PyTorch Geometric
try:
    from torch_geometric.nn import (
        GATConv, SAGEConv, GCNConv, 
        global_mean_pool, global_max_pool
    )
    from torch_geometric.data import Data, Batch
    PYG_AVAILABLE = True
except ImportError:
    PYG_AVAILABLE = False
    print("Warning: torch_geometric not available, using simplified GNN")


class SimpleGNN(nn.Module):
    """
    简化版 GNN（不依赖 PyG）
    用于在 PyG 不可用时的降级方案
    """
    
    def __init__(
        self,
        input_dim: int,
        hidden_dim: int,
        output_dim: int,
        num_layers: int = 3
    ):
        super().__init__()
        
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        
        self.layers = nn.ModuleList([
            nn.Linear(hidden_dim, hidden_dim)
            for _ in range(num_layers)
        ])
        
        self.output_proj = nn.Linear(hidden_dim, output_dim)
        self.dropout = nn.Dropout(0.1)
    
    def forward(
        self,
        node_features: torch.Tensor,
        adjacency: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            node_features: [N, input_dim]
            adjacency: [N, N] 邻接矩阵
        """
        # 输入投影
        x = F.relu(self.input_proj(node_features))
        
        # 消息传递层
        for layer in self.layers:
            # 简化的消息聚合：邻接矩阵乘法
            neighbor_features = torch.matmul(adjacency, x)
            x = F.relu(layer(x + neighbor_features))
            x = self.dropout(x)
        
        # 输出投影
        output = self.output_proj(x)
        
        return output


class HierarchyGNN(nn.Module):
    """
    层次结构图神经网络
    用于学习文档元素的层级角色和结构模式
    """
    
    def __init__(
        self,
        node_feature_dim: int = 256,
        edge_feature_dim: int = 8,
        hidden_dim: int = 256,
        output_dim: int = 128,
        num_hierarchy_classes: int = 8,
        num_pattern_classes: int = 12,
        num_layers: int = 3,
        heads: int = 4,
        dropout: float = 0.1
    ):
        """
        Args:
            node_feature_dim: 节点特征维度（来自视觉编码器）
            edge_feature_dim: 边类型数量
            hidden_dim: 隐藏层维度
            output_dim: 输出嵌入维度
            num_hierarchy_classes: 层级角色类别数
            num_pattern_classes: 结构模式类别数
            num_layers: GNN 层数
            heads: 注意力头数
            dropout: Dropout 比例
        """
        super().__init__()
        
        self.node_feature_dim = node_feature_dim
        self.hidden_dim = hidden_dim
        self.output_dim = output_dim
        self.num_layers = num_layers
        
        # 节点特征投影
        self.node_encoder = nn.Sequential(
            nn.Linear(node_feature_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim)
        )
        
        # 边类型嵌入
        self.edge_embedding = nn.Embedding(edge_feature_dim, hidden_dim // 4)
        
        if PYG_AVAILABLE:
            # 使用 Graph Attention Network
            self.gnn_layers = nn.ModuleList()
            for i in range(num_layers):
                in_dim = hidden_dim if i == 0 else hidden_dim * heads
                self.gnn_layers.append(
                    GATConv(
                        in_channels=in_dim,
                        out_channels=hidden_dim,
                        heads=heads,
                        dropout=dropout,
                        concat=True if i < num_layers - 1 else False
                    )
                )
        else:
            # 降级到简化版 GNN
            self.simple_gnn = SimpleGNN(
                input_dim=hidden_dim,
                hidden_dim=hidden_dim,
                output_dim=hidden_dim,
                num_layers=num_layers
            )
        
        # 输出投影
        self.output_proj = nn.Sequential(
            nn.Linear(hidden_dim * heads if PYG_AVAILABLE else hidden_dim, output_dim),
            nn.ReLU(),
            nn.Dropout(dropout)
        )
        
        # 层级角色分类头
        self.hierarchy_classifier = nn.Sequential(
            nn.Linear(output_dim, output_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(output_dim // 2, num_hierarchy_classes)
        )
        
        # 结构模式分类头（用于分组）
        self.pattern_classifier = nn.Sequential(
            nn.Linear(output_dim * 2, output_dim),  # 拼接全局特征
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(output_dim, num_pattern_classes)
        )
        
        # 边预测头（用于学习元素关联）
        self.edge_predictor = nn.Sequential(
            nn.Linear(output_dim * 2, output_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(output_dim, 1),
            nn.Sigmoid()
        )
    
    def forward(
        self,
        node_features: torch.Tensor,
        edge_index: torch.Tensor,
        edge_type: Optional[torch.Tensor] = None,
        batch: Optional[torch.Tensor] = None
    ) -> Dict[str, torch.Tensor]:
        """
        前向传播
        
        Args:
            node_features: 节点特征 [N, node_feature_dim]
            edge_index: 边索引 [2, E]
            edge_type: 边类型 [E]
            batch: 批次索引 [N]（用于图级池化）
            
        Returns:
            包含各种输出的字典
        """
        # 编码节点特征
        x = self.node_encoder(node_features)  # [N, hidden_dim]
        
        if PYG_AVAILABLE:
            # GAT 消息传递
            for i, gnn_layer in enumerate(self.gnn_layers):
                x = gnn_layer(x, edge_index)
                if i < self.num_layers - 1:
                    x = F.relu(x)
        else:
            # 简化版：构建邻接矩阵
            num_nodes = node_features.size(0)
            adj = torch.zeros(num_nodes, num_nodes, device=node_features.device)
            adj[edge_index[0], edge_index[1]] = 1
            adj = adj + adj.t()  # 无向图
            adj = adj / (adj.sum(dim=1, keepdim=True) + 1e-8)  # 归一化
            
            x = self.simple_gnn(x, adj)
        
        # 输出投影
        node_embeddings = self.output_proj(x)  # [N, output_dim]
        
        # 1. 层级角色分类
        hierarchy_logits = self.hierarchy_classifier(node_embeddings)  # [N, num_classes]
        
        # 2. 计算全局图特征（如果有批次信息）
        if batch is not None and PYG_AVAILABLE:
            global_features = global_mean_pool(node_embeddings, batch)  # [B, output_dim]
        else:
            global_features = node_embeddings.mean(dim=0, keepdim=True)  # [1, output_dim]
        
        return {
            "node_embeddings": node_embeddings,
            "hierarchy_logits": hierarchy_logits,
            "global_features": global_features
        }
    
    def predict_hierarchy(self, outputs: Dict[str, torch.Tensor]) -> torch.Tensor:
        """预测层级角色"""
        return F.softmax(outputs["hierarchy_logits"], dim=-1)
    
    def predict_grouping(
        self,
        node_embeddings: torch.Tensor,
        candidate_pairs: torch.Tensor
    ) -> torch.Tensor:
        """
        预测元素是否应该分为一组
        
        Args:
            node_embeddings: [N, output_dim]
            candidate_pairs: [P, 2] 候选配对索引
            
        Returns:
            分组概率 [P]
        """
        # 提取配对嵌入
        src_embeddings = node_embeddings[candidate_pairs[:, 0]]
        tgt_embeddings = node_embeddings[candidate_pairs[:, 1]]
        
        # 拼接
        pair_features = torch.cat([src_embeddings, tgt_embeddings], dim=-1)
        
        # 预测
        probs = self.edge_predictor(pair_features).squeeze(-1)
        
        return probs
    
    def classify_group_pattern(
        self,
        node_embeddings: torch.Tensor,
        group_node_indices: List[torch.Tensor]
    ) -> torch.Tensor:
        """
        分类组的结构模式
        
        Args:
            node_embeddings: [N, output_dim]
            group_node_indices: 每个组的节点索引列表
            
        Returns:
            模式 logits [G, num_pattern_classes]
        """
        group_features = []
        
        for indices in group_node_indices:
            # 聚合组内节点特征
            group_emb = node_embeddings[indices].mean(dim=0)  # [output_dim]
            # 添加全局上下文
            global_emb = node_embeddings.mean(dim=0)
            combined = torch.cat([group_emb, global_emb], dim=-1)
            group_features.append(combined)
        
        group_features = torch.stack(group_features)  # [G, output_dim * 2]
        
        return self.pattern_classifier(group_features)


class HierarchyLoss(nn.Module):
    """
    层次结构学习的复合损失函数
    """
    
    def __init__(
        self,
        hierarchy_weight: float = 1.0,
        grouping_weight: float = 0.5,
        pattern_weight: float = 0.5,
        contrastive_weight: float = 0.3
    ):
        super().__init__()
        
        self.hierarchy_weight = hierarchy_weight
        self.grouping_weight = grouping_weight
        self.pattern_weight = pattern_weight
        self.contrastive_weight = contrastive_weight
        
        self.hierarchy_loss = nn.CrossEntropyLoss()
        self.grouping_loss = nn.BCELoss()
        self.pattern_loss = nn.CrossEntropyLoss()
    
    def forward(
        self,
        outputs: Dict[str, torch.Tensor],
        hierarchy_labels: Optional[torch.Tensor] = None,
        grouping_labels: Optional[torch.Tensor] = None,
        grouping_pairs: Optional[torch.Tensor] = None,
        pattern_labels: Optional[torch.Tensor] = None,
        group_indices: Optional[List[torch.Tensor]] = None
    ) -> Dict[str, torch.Tensor]:
        """
        计算复合损失
        """
        losses = {}
        total_loss = torch.tensor(0.0, device=outputs["node_embeddings"].device)
        
        # 1. 层级角色分类损失
        if hierarchy_labels is not None:
            h_loss = self.hierarchy_loss(outputs["hierarchy_logits"], hierarchy_labels)
            losses["hierarchy_loss"] = h_loss
            total_loss = total_loss + self.hierarchy_weight * h_loss
        
        # 2. 分组预测损失
        if grouping_labels is not None and grouping_pairs is not None:
            # 计算分组预测
            model = outputs.get("model")
            if model is not None:
                group_probs = model.predict_grouping(
                    outputs["node_embeddings"],
                    grouping_pairs
                )
                g_loss = self.grouping_loss(group_probs, grouping_labels.float())
                losses["grouping_loss"] = g_loss
                total_loss = total_loss + self.grouping_weight * g_loss
        
        # 3. 模式分类损失
        if pattern_labels is not None and group_indices is not None:
            model = outputs.get("model")
            if model is not None:
                pattern_logits = model.classify_group_pattern(
                    outputs["node_embeddings"],
                    group_indices
                )
                p_loss = self.pattern_loss(pattern_logits, pattern_labels)
                losses["pattern_loss"] = p_loss
                total_loss = total_loss + self.pattern_weight * p_loss
        
        losses["total_loss"] = total_loss
        
        return losses


def create_graph_model(config: dict = None) -> HierarchyGNN:
    """
    工厂函数：创建图模型
    """
    if config is None:
        config = {}
    
    return HierarchyGNN(
        node_feature_dim=config.get("node_feature_dim", 256),
        edge_feature_dim=config.get("edge_feature_dim", 8),
        hidden_dim=config.get("hidden_dim", 256),
        output_dim=config.get("output_dim", 128),
        num_hierarchy_classes=config.get("num_hierarchy_classes", 8),
        num_pattern_classes=config.get("num_pattern_classes", 12),
        num_layers=config.get("num_layers", 3),
        heads=config.get("heads", 4),
        dropout=config.get("dropout", 0.1)
    )
