import { useMemo, useState } from 'react';
import { Maximize2, Minimize2, ChevronRight, ChevronDown, Folder, FileText, Image, Box, Layers, Circle, ZoomIn, ZoomOut, Move } from 'lucide-react';
import type { Bounds, TreeNode, Element } from '@/types';

interface LayerVisualizerProps {
  treeData: TreeNode[];
  elements: Element[];
  docWidth: number;
  docHeight: number;
  previewImage?: string;
  previewSVG?: string;
}

const TYPE_ICONS: Record<string, typeof Folder> = {
  layer: Layers, group: Folder, clip_group: Folder, text: FileText,
  image_embedded: Image, image_linked: Image, path: Circle, compound_path: Circle, symbol: Box,
};

// 棕色系配色方案（与网站风格统一）
const TYPE_COLORS: Record<string, { stroke: string; fill: string }> = {
  text: { stroke: '#8b5a3c', fill: '#f5ebe0' },           // 深棕 - 文本
  image_embedded: { stroke: '#c17f59', fill: '#fdf4ed' }, // 橙棕 - 图片
  image_linked: { stroke: '#c17f59', fill: '#fdf4ed' },
  path: { stroke: '#a08060', fill: '#faf8f5' },           // 浅棕 - 路径
  compound_path: { stroke: '#a08060', fill: '#faf8f5' },
  symbol: { stroke: '#6b5d4d', fill: '#f5f0e8' },         // 灰棕 - 符号
  plugin: { stroke: '#3d2314', fill: '#e8dfd3' },         // 深棕 - 插件
};

function TreeNodeItem({ node, depth = 0, selectedId, onSelect, hoveredId, onHover }: { 
  node: TreeNode; depth?: number; selectedId: string | null;
  onSelect: (id: string | null) => void; hoveredId: string | null; onHover: (id: string | null) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const Icon = TYPE_ICONS[node.type] || Box;
  const colorDef = TYPE_COLORS[node.type] || { stroke: '#6b5d4d', fill: '#f5f5f5' };
  const stroke = colorDef.stroke;
  const isSelected = selectedId === node.id;
  const isHovered = hoveredId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer transition-all text-xs ${
          isSelected ? 'bg-[#c17f59]/20 ring-1 ring-[#c17f59]' : isHovered ? 'bg-[#f5f0e8]' : 'hover:bg-[#f5f0e8]'
        }`}
        style={{ paddingLeft: depth * 10 + 4 }}
        onClick={(e) => { e.stopPropagation(); onSelect(isSelected ? null : node.id); }}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
      >
        <span className="flex-shrink-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); hasChildren && setIsExpanded(!isExpanded); }}>
          {hasChildren ? (isExpanded ? <ChevronDown className="w-3 h-3 text-[#8b7355]" /> : <ChevronRight className="w-3 h-3 text-[#8b7355]" />) : <span className="w-3 h-3" />}
        </span>
        <Icon className="w-3 h-3 flex-shrink-0" style={{ color: stroke }} />
        <span className="text-[#3d2314] truncate">{node.name || node.type}</span>
      </div>
      {hasChildren && isExpanded && node.children!.map((child, i) => (
        <TreeNodeItem key={child.id || i} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} hoveredId={hoveredId} onHover={onHover} />
      ))}
    </div>
  );
}

export function LayerVisualizer({ treeData, elements, docWidth, docHeight }: LayerVisualizerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });

  const elementMap = useMemo(() => {
    const map: Record<string, Element> = {};
    elements.forEach(el => { map[el.id] = el; });
    return map;
  }, [elements]);

  const activeId = selectedId || hoveredId;
  const activeElement = activeId ? elementMap[activeId] : null;

  // 画布尺寸 - 完整显示文档（按高度适配容器）
  const containerHeight = isFullscreen ? 600 : 420;
  const baseScale = containerHeight / docHeight;
  const displayScale = baseScale * zoom;
  const canvasWidth = docWidth * displayScale;
  const canvasHeight = docHeight * displayScale;

  // 缩放控制
  const handleZoomIn = () => setZoom(z => Math.min(z * 1.3, 5));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.3, 0.3));
  const handleResetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // 拖拽平移
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { setIsPanning(true); setLastMouse({ x: e.clientX, y: e.clientY }); }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan(p => ({ x: p.x + e.clientX - lastMouse.x, y: p.y + e.clientY - lastMouse.y }));
      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  };
  const handleMouseUp = () => setIsPanning(false);

  // 将元素坐标转换为画布坐标，并裁剪到文档范围内
  const toCanvasCoords = (bounds: Bounds) => {
    // 裁剪到文档范围
    const clampedLeft = Math.max(0, bounds.left);
    const clampedTop = Math.max(0, bounds.top);
    const clampedRight = Math.min(docWidth, bounds.left + bounds.width);
    const clampedBottom = Math.min(docHeight, bounds.top + bounds.height);
    
    return {
      x: clampedLeft * displayScale,
      y: clampedTop * displayScale,
      width: Math.max(0, clampedRight - clampedLeft) * displayScale,
      height: Math.max(0, clampedBottom - clampedTop) * displayScale,
    };
  };

  const containerClass = isFullscreen 
    ? 'fixed inset-0 z-50 bg-white p-6 flex flex-col overflow-auto' 
    : 'relative w-full bg-white rounded-xl border border-[#e8dfd3] shadow-sm';

  return (
    <div className={containerClass}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between p-3 border-b border-[#e8dfd3]">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#3d2314]" />
          <span className="text-sm font-medium text-[#3d2314]">图层结构可视化</span>
          <span className="text-xs text-[#8b7355]">({docWidth}×{docHeight}, {elements.length}元素)</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 缩放控制 */}
          <div className="flex items-center gap-1 border-l border-[#e8dfd3] pl-2 ml-1">
            <button onClick={handleZoomOut} className="p-1 hover:bg-[#f5f0e8] rounded" title="缩小">
              <ZoomOut className="w-4 h-4 text-[#6b5d4d]" />
            </button>
            <span className="text-xs text-[#8b7355] w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={handleZoomIn} className="p-1 hover:bg-[#f5f0e8] rounded" title="放大">
              <ZoomIn className="w-4 h-4 text-[#6b5d4d]" />
            </button>
            <button onClick={handleResetView} className="p-1 hover:bg-[#f5f0e8] rounded" title="重置视图">
              <Move className="w-4 h-4 text-[#6b5d4d]" />
            </button>
          </div>
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 hover:bg-[#f5f0e8] rounded transition-colors">
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-[#6b5d4d]" /> : <Maximize2 className="w-4 h-4 text-[#6b5d4d]" />}
          </button>
        </div>
      </div>

      <div className="flex">
        {/* 左侧：树形结构 */}
        <div className={`w-60 flex-shrink-0 border-r border-[#e8dfd3] overflow-auto ${isFullscreen ? 'h-[calc(100vh-120px)]' : 'h-[460px]'}`}>
          <div className="p-1">
            {(treeData || []).length > 0 ? treeData.map((node, i) => (
              <TreeNodeItem key={node.id || i} node={node} depth={0} selectedId={selectedId} onSelect={setSelectedId} hoveredId={hoveredId} onHover={setHoveredId} />
            )) : <div className="text-center text-xs text-[#8b7355] py-4">暂无数据</div>}
          </div>
        </div>

        {/* 右侧：结构图 */}
        <div className={`flex-1 flex items-center justify-center p-4 bg-[#faf8f5] overflow-auto ${isFullscreen ? 'h-[calc(100vh-120px)]' : 'h-[460px]'}`}>
          <div className="flex flex-col items-center">
            <div className="text-xs text-[#8b7355] mb-2 font-medium">元素结构图（可拖拽平移）</div>
              <div 
                className="overflow-auto bg-white shadow-md rounded border border-[#e8dfd3] cursor-grab active:cursor-grabbing"
                style={{ maxWidth: isFullscreen ? '80vw' : 500, maxHeight: isFullscreen ? '70vh' : 420 }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
              <svg 
                width={canvasWidth} 
                height={canvasHeight}
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, display: 'block' }}
              >
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f0f0f0" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                
                {/* 所有元素 - 按面积从大到小排序，小元素在上层更容易点击 */}
                {elements.filter(el => {
                  if (!el.bounds || el.bounds.width <= 0 || el.bounds.height <= 0) return false;
                  const b = el.bounds;
                  const inBounds = b.left < docWidth && b.top < docHeight && (b.left + b.width) > 0 && (b.top + b.height) > 0;
                  const isLeaf = !['group', 'layer', 'clip_group'].includes(el.type);
                  return inBounds && isLeaf;
                }).sort((a, b) => {
                  // 按面积从大到小排序，大元素先渲染（在下层），小元素后渲染（在上层）
                  const areaA = (a.bounds?.width || 0) * (a.bounds?.height || 0);
                  const areaB = (b.bounds?.width || 0) * (b.bounds?.height || 0);
                  return areaB - areaA;
                }).map((el) => {
                  const coords = toCanvasCoords(el.bounds!);
                  const isActive = activeElement?.id === el.id;
                  // 使用统一棕色系配色
                  const colorDef = TYPE_COLORS[el.type] || { stroke: '#a08060', fill: '#faf8f5' };
                  const stroke = colorDef.stroke;
                  
                  return (
                    <rect
                      key={el.id}
                      x={coords.x}
                      y={coords.y}
                      width={coords.width}
                      height={coords.height}
                      fill={isActive ? '#c17f59' : 'transparent'}
                      fillOpacity={isActive ? 0.3 : 0}
                      stroke={isActive ? '#c17f59' : stroke}
                      strokeWidth={isActive ? 2 : (el.type === 'text' || el.type.includes('image') ? 2 : 0.5)}
                      className="cursor-pointer"
                      onClick={() => setSelectedId(el.id)}
                      onMouseEnter={() => setHoveredId(el.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    />
                  );
                })}
                
                {activeElement?.bounds && (() => {
                  const coords = toCanvasCoords(activeElement.bounds);
                  return (
                    <rect
                      x={coords.x}
                      y={coords.y}
                      width={coords.width}
                      height={coords.height}
                      fill="none"
                      stroke="#c17f59"
                      strokeWidth="3"
                      strokeDasharray="5,3"
                      pointerEvents="none"
                    />
                  );
                })()}
              </svg>
              </div>
          </div>
        </div>
      </div>

      {/* 底部信息栏 */}
      {activeElement && (
        <div className="p-2 border-t border-[#e8dfd3] bg-[#faf8f5] flex items-center gap-3 text-xs flex-wrap">
          <span className="text-[#8b7355]">选中:</span>
          <span className="font-medium text-[#3d2314]">{activeElement.name || activeElement.id}</span>
          <span className="px-1.5 py-0.5 rounded text-white text-xs" style={{ backgroundColor: TYPE_COLORS[activeElement.type]?.stroke || '#6b5d4d' }}>{activeElement.type}</span>
          {activeElement.bounds && (
            <span className="text-[#8b7355]">
              位置: ({Math.round(activeElement.bounds.left)}, {Math.round(activeElement.bounds.top)}) | 
              尺寸: {Math.round(activeElement.bounds.width)} × {Math.round(activeElement.bounds.height)}
            </span>
          )}
        </div>
      )}

      {isFullscreen && (
        <button onClick={() => setIsFullscreen(false)} className="fixed bottom-6 right-6 px-4 py-2 bg-[#3d2314] text-white rounded-lg shadow-lg text-sm hover:bg-[#5a3a2a]">
          关闭全屏
        </button>
      )}
    </div>
  );
}
