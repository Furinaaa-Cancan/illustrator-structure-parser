#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 模板解析器 v3.0 - LOO 差异分析工具
用于对比基准图像和留一法导出图像，生成精确的视觉影响报告

依赖: pip install pillow numpy opencv-python scikit-image
"""

import os
import sys
import json
import argparse
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional, Tuple
import numpy as np

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFilter
    import cv2
    from skimage.metrics import structural_similarity as ssim
except ImportError as e:
    print(f"缺少依赖: {e}")
    print("请运行: pip install pillow numpy opencv-python scikit-image")
    sys.exit(1)


@dataclass
class DiffResult:
    """差异分析结果"""
    element_id: str
    baseline_path: str
    loo_path: str
    
    # 像素差异
    changed_pixels: int
    total_pixels: int
    change_percent: float
    
    # 结构相似度
    ssim_score: float
    
    # 差异区域
    diff_bbox: Optional[Tuple[int, int, int, int]]  # (x, y, w, h)
    diff_area: int
    diff_centroid: Optional[Tuple[int, int]]
    
    # 影响评分
    impact_score: float
    
    # 输出文件
    diff_image_path: Optional[str] = None
    heatmap_path: Optional[str] = None


class LOODiffAnalyzer:
    """留一法差异分析器"""
    
    def __init__(self, output_dir: str):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.results: List[DiffResult] = []
    
    def analyze(self, baseline_path: str, loo_path: str, element_id: str) -> DiffResult:
        """分析两张图片的差异"""
        # 加载图像
        baseline = Image.open(baseline_path).convert('RGBA')
        loo_img = Image.open(loo_path).convert('RGBA')
        
        # 确保尺寸一致
        if baseline.size != loo_img.size:
            loo_img = loo_img.resize(baseline.size, Image.Resampling.LANCZOS)
        
        # 计算差异
        diff = ImageChops.difference(baseline, loo_img)
        diff_array = np.array(diff)
        
        # 像素级分析
        changed_mask = np.any(diff_array > 10, axis=2)  # 阈值过滤噪声
        changed_pixels = int(np.sum(changed_mask))
        total_pixels = baseline.size[0] * baseline.size[1]
        change_percent = (changed_pixels / total_pixels) * 100 if total_pixels > 0 else 0
        
        # 结构相似度 (SSIM)
        baseline_gray = cv2.cvtColor(np.array(baseline), cv2.COLOR_RGBA2GRAY)
        loo_gray = cv2.cvtColor(np.array(loo_img), cv2.COLOR_RGBA2GRAY)
        ssim_score = ssim(baseline_gray, loo_gray)
        
        # 差异区域分析
        diff_bbox, diff_area, diff_centroid = self._analyze_diff_region(changed_mask)
        
        # 计算影响评分
        impact_score = self._calculate_impact_score(
            change_percent, ssim_score, diff_area, total_pixels
        )
        
        # 生成差异图像
        diff_image_path = self._save_diff_image(diff, element_id)
        heatmap_path = self._save_heatmap(changed_mask, element_id)
        
        result = DiffResult(
            element_id=element_id,
            baseline_path=baseline_path,
            loo_path=loo_path,
            changed_pixels=changed_pixels,
            total_pixels=total_pixels,
            change_percent=round(change_percent, 4),
            ssim_score=round(ssim_score, 4),
            diff_bbox=diff_bbox,
            diff_area=diff_area,
            diff_centroid=diff_centroid,
            impact_score=round(impact_score, 2),
            diff_image_path=diff_image_path,
            heatmap_path=heatmap_path
        )
        
        self.results.append(result)
        return result
    
    def _analyze_diff_region(self, mask: np.ndarray) -> Tuple[Optional[Tuple], int, Optional[Tuple]]:
        """分析差异区域"""
        if not np.any(mask):
            return None, 0, None
        
        # 找到差异区域的边界框
        rows = np.any(mask, axis=1)
        cols = np.any(mask, axis=0)
        
        if not np.any(rows) or not np.any(cols):
            return None, 0, None
        
        y_min, y_max = np.where(rows)[0][[0, -1]]
        x_min, x_max = np.where(cols)[0][[0, -1]]
        
        bbox = (int(x_min), int(y_min), int(x_max - x_min), int(y_max - y_min))
        area = int(np.sum(mask))
        
        # 计算质心
        y_coords, x_coords = np.where(mask)
        centroid = (int(np.mean(x_coords)), int(np.mean(y_coords))) if len(x_coords) > 0 else None
        
        return bbox, area, centroid
    
    def _calculate_impact_score(self, change_percent: float, ssim_score: float, 
                                 diff_area: int, total_pixels: int) -> float:
        """计算影响评分 (0-100)"""
        score = 0
        
        # 基于变化百分比 (最高40分)
        score += min(change_percent * 4, 40)
        
        # 基于SSIM (最高30分，SSIM越低分数越高)
        score += (1 - ssim_score) * 30
        
        # 基于差异区域面积占比 (最高30分)
        if total_pixels > 0:
            area_ratio = diff_area / total_pixels
            score += min(area_ratio * 300, 30)
        
        return min(score, 100)
    
    def _save_diff_image(self, diff: Image.Image, element_id: str) -> str:
        """保存差异图像"""
        path = self.output_dir / f"diff_{element_id}.png"
        
        # 增强差异可见性
        enhanced = diff.point(lambda x: min(x * 3, 255))
        enhanced.save(path)
        
        return str(path)
    
    def _save_heatmap(self, mask: np.ndarray, element_id: str) -> str:
        """保存热力图"""
        path = self.output_dir / f"heatmap_{element_id}.png"
        
        # 转换为热力图
        heatmap = np.zeros((*mask.shape, 3), dtype=np.uint8)
        heatmap[mask] = [255, 0, 0]  # 红色表示变化区域
        
        # 应用高斯模糊使热力图更平滑
        heatmap = cv2.GaussianBlur(heatmap, (15, 15), 0)
        
        Image.fromarray(heatmap).save(path)
        return str(path)
    
    def batch_analyze(self, baseline_path: str, loo_exports_dir: str) -> List[DiffResult]:
        """批量分析所有LOO导出图像"""
        loo_dir = Path(loo_exports_dir)
        
        for loo_file in loo_dir.glob("loo_*.png"):
            # 从文件名提取元素ID
            parts = loo_file.stem.split("_", 2)
            if len(parts) >= 3:
                element_id = parts[2]
            else:
                element_id = loo_file.stem
            
            self.analyze(baseline_path, str(loo_file), element_id)
        
        return self.results
    
    def generate_report(self, output_path: str) -> Dict:
        """生成分析报告"""
        report = {
            "total_analyzed": len(self.results),
            "results": [asdict(r) for r in self.results],
            "summary": self._generate_summary()
        }
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        
        return report
    
    def _generate_summary(self) -> Dict:
        """生成汇总信息"""
        if not self.results:
            return {"error": "无分析结果"}
        
        scores = [r.impact_score for r in self.results]
        
        high_impact = [r.element_id for r in self.results if r.impact_score >= 70]
        medium_impact = [r.element_id for r in self.results if 40 <= r.impact_score < 70]
        low_impact = [r.element_id for r in self.results if r.impact_score < 40]
        
        return {
            "avg_impact_score": round(np.mean(scores), 2),
            "max_impact_score": round(max(scores), 2),
            "min_impact_score": round(min(scores), 2),
            "high_impact_count": len(high_impact),
            "medium_impact_count": len(medium_impact),
            "low_impact_count": len(low_impact),
            "high_impact_elements": high_impact[:10],  # 只显示前10个
            "avg_change_percent": round(np.mean([r.change_percent for r in self.results]), 4),
            "avg_ssim": round(np.mean([r.ssim_score for r in self.results]), 4)
        }


def main():
    parser = argparse.ArgumentParser(description='LOO差异分析工具')
    parser.add_argument('baseline', help='基准图像路径')
    parser.add_argument('loo_dir', help='LOO导出图像目录')
    parser.add_argument('-o', '--output', default='loo_analysis_report.json', help='输出报告路径')
    parser.add_argument('-d', '--diff-dir', default='diff_output', help='差异图像输出目录')
    
    args = parser.parse_args()
    
    analyzer = LOODiffAnalyzer(args.diff_dir)
    analyzer.batch_analyze(args.baseline, args.loo_dir)
    report = analyzer.generate_report(args.output)
    
    print(f"分析完成: {report['total_analyzed']} 个元素")
    print(f"高影响: {report['summary']['high_impact_count']} 个")
    print(f"平均影响分数: {report['summary']['avg_impact_score']}")
    print(f"报告已保存: {args.output}")


if __name__ == '__main__':
    main()
