"""
AI Template Parser - 视觉特征编码器
使用预训练 CNN 提取元素视觉特征
"""

import torch
import torch.nn as nn
from typing import List, Optional, Tuple, TYPE_CHECKING, Any
import numpy as np

if TYPE_CHECKING:
    from PIL import Image

try:
    import timm
    from PIL import Image
    from torchvision import transforms
    TIMM_AVAILABLE = True
except ImportError:
    TIMM_AVAILABLE = False
    transforms = None
    print("Warning: timm not available, visual encoding disabled")


class VisualEncoder(nn.Module):
    """
    视觉特征编码器
    使用 MobileNetV3 或 EfficientNet 提取图像特征
    """
    
    def __init__(
        self,
        model_name: str = "mobilenetv3_small_100",
        pretrained: bool = True,
        feature_dim: int = 576,
        output_dim: int = 256,
        freeze_backbone: bool = True
    ):
        """
        Args:
            model_name: timm 模型名称
            pretrained: 是否使用预训练权重
            feature_dim: 骨干网络输出维度
            output_dim: 最终特征维度
            freeze_backbone: 是否冻结骨干网络
        """
        super().__init__()
        
        self.model_name = model_name
        self.feature_dim = feature_dim
        self.output_dim = output_dim
        
        if not TIMM_AVAILABLE:
            self.backbone = None
            self.projector = nn.Linear(feature_dim, output_dim)
            return
        
        # 加载预训练模型（移除分类头）
        self.backbone = timm.create_model(
            model_name,
            pretrained=pretrained,
            num_classes=0,  # 移除分类头
            global_pool='avg'
        )
        
        # 冻结骨干网络
        if freeze_backbone:
            for param in self.backbone.parameters():
                param.requires_grad = False
        
        # 特征投影层
        self.projector = nn.Sequential(
            nn.Linear(feature_dim, output_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(output_dim, output_dim)
        )
        
        # 图像预处理
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        前向传播
        
        Args:
            x: 输入图像张量 [B, C, H, W]
            
        Returns:
            特征向量 [B, output_dim]
        """
        if self.backbone is None:
            # 无 timm 时返回随机特征（仅用于测试）
            return torch.randn(x.size(0), self.output_dim)
        
        # 提取骨干网络特征
        features = self.backbone(x)  # [B, feature_dim]
        
        # 投影到目标维度
        output = self.projector(features)  # [B, output_dim]
        
        return output
    
    def encode_image(self, image: "Image.Image") -> np.ndarray:
        """
        编码单张图像
        
        Args:
            image: PIL Image
            
        Returns:
            特征向量 numpy array
        """
        # 确保 RGB 模式
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # 预处理
        x = self.transform(image).unsqueeze(0)
        
        # 推理
        self.eval()
        with torch.no_grad():
            features = self.forward(x)
        
        return features.squeeze(0).numpy()
    
    def encode_batch(self, images: List["Image.Image"]) -> np.ndarray:
        """
        批量编码图像
        
        Args:
            images: PIL Image 列表
            
        Returns:
            特征矩阵 [N, output_dim]
        """
        # 预处理所有图像
        tensors = []
        for img in images:
            if img.mode != 'RGB':
                img = img.convert('RGB')
            tensors.append(self.transform(img))
        
        x = torch.stack(tensors)
        
        # 推理
        self.eval()
        with torch.no_grad():
            features = self.forward(x)
        
        return features.numpy()
    
    def encode_element_crop(
        self,
        full_image: "Image.Image",
        bounds: Tuple[float, float, float, float],
        padding: int = 10
    ) -> np.ndarray:
        """
        编码元素裁剪区域
        
        Args:
            full_image: 完整文档图像
            bounds: 边界框 (x, y, width, height)
            padding: 裁剪边距
            
        Returns:
            特征向量
        """
        x, y, w, h = bounds
        
        # 添加边距
        x1 = max(0, int(x - padding))
        y1 = max(0, int(y - padding))
        x2 = min(full_image.width, int(x + w + padding))
        y2 = min(full_image.height, int(y + h + padding))
        
        # 裁剪
        crop = full_image.crop((x1, y1, x2, y2))
        
        return self.encode_image(crop)


class ElementVisualAnalyzer:
    """
    元素视觉分析器
    分析元素的视觉特征（边缘、纹理、颜色等）
    """
    
    def __init__(self):
        self.encoder = VisualEncoder() if TIMM_AVAILABLE else None
    
    def analyze(self, image: "Image.Image") -> dict:
        """
        分析图像的视觉特征
        
        Args:
            image: PIL Image
            
        Returns:
            特征字典
        """
        import cv2
        
        # 转换为 numpy
        img_array = np.array(image)
        
        # 如果是 RGBA，转换为 RGB
        if img_array.shape[-1] == 4:
            img_rgb = img_array[:, :, :3]
        else:
            img_rgb = img_array
        
        # 转换为灰度图
        img_gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        
        # 1. 边缘密度
        edges = cv2.Canny(img_gray, 50, 150)
        edge_density = np.sum(edges > 0) / edges.size
        
        # 2. 纹理复杂度（使用 Laplacian 方差）
        laplacian = cv2.Laplacian(img_gray, cv2.CV_64F)
        texture_complexity = laplacian.var()
        
        # 3. 颜色方差
        color_variance = np.mean([
            np.var(img_rgb[:, :, 0]),
            np.var(img_rgb[:, :, 1]),
            np.var(img_rgb[:, :, 2])
        ])
        
        # 4. 对比度
        contrast = img_gray.std()
        
        # 5. 主色调（简化版）
        pixels = img_rgb.reshape(-1, 3)
        # 取最常见的颜色
        unique, counts = np.unique(pixels, axis=0, return_counts=True)
        dominant_idx = np.argsort(counts)[-5:]  # Top 5
        dominant_colors = [
            "#{:02x}{:02x}{:02x}".format(*unique[i])
            for i in dominant_idx
        ]
        
        # 6. CNN 特征（如果可用）
        feature_vector = None
        if self.encoder:
            feature_vector = self.encoder.encode_image(image).tolist()
        
        return {
            "edge_density": float(edge_density),
            "texture_complexity": float(texture_complexity),
            "color_variance": float(color_variance),
            "contrast": float(contrast),
            "dominant_colors": dominant_colors,
            "feature_vector": feature_vector
        }


def create_encoder(config: dict = None) -> VisualEncoder:
    """
    工厂函数：创建视觉编码器
    """
    if config is None:
        config = {}
    
    return VisualEncoder(
        model_name=config.get("model_name", "mobilenetv3_small_100"),
        pretrained=config.get("pretrained", True),
        feature_dim=config.get("feature_dim", 576),
        output_dim=config.get("output_dim", 256),
        freeze_backbone=config.get("freeze_backbone", True)
    )
