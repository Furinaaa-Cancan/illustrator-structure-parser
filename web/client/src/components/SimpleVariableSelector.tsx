import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Search, Check, X, ChevronRight, ChevronDown, Layers, Type, Image as ImageIcon, Hash, Calendar, User, Phone, MapPin, Tag, Sparkles, ZoomIn, ZoomOut, Maximize2, Move } from 'lucide-react';
import { Variable } from '@/types';

interface SimpleVariableSelectorProps {
  previewUrl: string;
  variables: Variable[];
  onConfirm?: (selected: Variable[]) => void;
  onBack?: () => void;
}

// 图片查看器 Hook - 简化版，只用 scale 控制缩放
function useImageViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const clampScale = (s: number) => Math.min(Math.max(s, 0.3), 4);

  // 使用 useEffect 添加非 passive 的滚轮事件监听
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale(s => clampScale(s * delta));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // 拖拽
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { 
      x: e.clientX, 
      y: e.clientY, 
      posX: position.x, 
      posY: position.y 
    };
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: dragStartRef.current.posX + dx,
      y: dragStartRef.current.posY + dy
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 双击重置
  const handleDoubleClick = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // 按钮控制
  const zoomIn = useCallback(() => setScale(s => clampScale(s * 1.3)), []);
  const zoomOut = useCallback(() => setScale(s => clampScale(s * 0.7)), []);
  const reset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  return {
    containerRef,
    scale,
    position,
    isDragging,
    handlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onDoubleClick: handleDoubleClick,
    },
    controls: { zoomIn, zoomOut, reset }
  };
}

const typeIcons: Record<string, typeof Type> = {
  'name': User, 'person_name': User, 'title': Type, 'date': Calendar,
  'time': Calendar, 'phone': Phone, 'address': MapPin, 'price': Tag,
  'number': Hash, 'image': ImageIcon, 'avatar': User, 'photo': ImageIcon,
  'logo': Sparkles, 'text': Type, 'bg_shape': Layers,
};

const typeLabels: Record<string, string> = {
  'name': '姓名', 'person_name': '人名', 'title': '标题', 'date': '日期',
  'time': '时间', 'phone': '电话', 'address': '地址', 'price': '价格',
  'number': '数字', 'image': '图片', 'avatar': '头像', 'photo': '照片',
  'logo': 'Logo', 'text': '文本', 'bg_shape': '背景',
};

const typeColors: Record<string, string> = {
  'name': '#6b8e23', 'person_name': '#6b8e23', 'title': '#4682b4',
  'date': '#daa520', 'time': '#daa520', 'phone': '#20b2aa',
  'address': '#cd853f', 'price': '#dc143c', 'number': '#9370db',
  'image': '#4169e1', 'avatar': '#32cd32', 'photo': '#4169e1',
  'logo': '#ff6347', 'text': '#708090', 'bg_shape': '#a0a0a0',
};

export function SimpleVariableSelector({
  previewUrl,
  variables,
  onConfirm,
  onBack
}: SimpleVariableSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['text', 'title', 'name', 'date']));
  
  // 图片查看器
  const viewer = useImageViewer();

  // 按类型分组（过滤掉形状类型，只保留可替换内容）
  const excludeTypes = useMemo(() => new Set(['shape', 'bg_shape', 'circle', 'line', 'path', 'compound_path']), []);
  const typePriority: Record<string, number> = useMemo(() => ({
    'text': 1, 'event_title': 2, 'slogan': 3, 'person_name': 4, 'person_title': 5,
    'date': 6, 'time': 7, 'phone': 8, 'address': 9, 'price': 10,
    'image': 11, 'avatar': 12, 'photo': 13, 'banner': 14, 'logo': 15, 'qrcode': 16
  }), []);
  
  const groupedVariables = useMemo(() => {
    if (!variables || variables.length === 0) {
      return [];
    }
    const groups: Record<string, Variable[]> = {};
    variables
      .filter(v => !excludeTypes.has(v.variableType || ''))
      .forEach(v => {
        const type = v.variableType || 'other';
        if (!groups[type]) groups[type] = [];
        groups[type].push(v);
      });
    return Object.entries(groups)
      .sort((a, b) => (typePriority[a[0]] || 99) - (typePriority[b[0]] || 99))
      .filter(([_, vars]) => vars.length > 0);
  }, [variables, excludeTypes, typePriority]);

  // 搜索过滤
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedVariables;
    const q = searchQuery.toLowerCase();
    return groupedVariables
      .map(([type, vars]) => [
        type,
        vars.filter(v =>
          v.variableKey?.toLowerCase().includes(q) ||
          v.currentValue?.toLowerCase().includes(q)
        )
      ] as [string, Variable[]])
      .filter(([_, vars]) => vars.length > 0);
  }, [groupedVariables, searchQuery]);

  const toggleSelection = (varKey: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(varKey)) {
      newSelected.delete(varKey);
    } else {
      newSelected.add(varKey);
    }
    setSelectedIds(newSelected);
  };

  const toggleGroup = (type: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedGroups(newExpanded);
  };

  const selectAllInGroup = (vars: Variable[]) => {
    const newSelected = new Set(selectedIds);
    const allSelected = vars.every(v => selectedIds.has(v.variableKey || ''));
    vars.forEach(v => {
      if (allSelected) {
        newSelected.delete(v.variableKey || '');
      } else {
        newSelected.add(v.variableKey || '');
      }
    });
    setSelectedIds(newSelected);
  };

  const totalFiltered = filteredGroups.reduce((sum, [_, vars]) => sum + vars.length, 0);
  const selectedVariables = variables.filter(v => selectedIds.has(v.variableKey || ''));

  return (
    <div className="flex h-[700px] bg-white rounded-2xl overflow-hidden border border-[#e8dfd3] shadow-lg">
      {/* 左侧：预览图查看器 */}
      <div className="flex-1 bg-[#1a1a1a] relative flex flex-col">
        {/* 控制栏 */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-xl px-2 py-1.5 shadow-lg">
          <button 
            onClick={viewer.controls.zoomOut} 
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <div className="px-3 py-1 min-w-[60px] text-center">
            <span className="text-white text-xs font-medium">{Math.round(viewer.scale * 100)}%</span>
          </div>
          <button 
            onClick={viewer.controls.zoomIn} 
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            title="放大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <button 
            onClick={viewer.controls.reset} 
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
            title="重置视图 (双击图片)"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
        
        {/* 图片容器 */}
        <div 
          ref={viewer.containerRef}
          className={`flex-1 overflow-hidden flex items-center justify-center ${viewer.isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          {...viewer.handlers}
        >
          <img
            src={previewUrl}
            alt="Template Preview"
            className="shadow-2xl rounded-lg select-none"
            style={{ 
              transform: `translate(${viewer.position.x}px, ${viewer.position.y}px) scale(${viewer.scale})`,
              transformOrigin: 'center center',
              transition: viewer.isDragging ? 'none' : 'transform 0.15s ease-out',
              maxHeight: '90%',
              maxWidth: '90%',
              objectFit: 'contain'
            }}
            draggable={false}
          />
        </div>

        {/* 提示 */}
        <div className="absolute bottom-4 left-4 right-4 bg-black/70 backdrop-blur-sm text-white text-xs rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2 text-gray-400">
            <Move className="w-3.5 h-3.5" />
            <span>拖拽平移</span>
          </div>
          <div className="w-px h-4 bg-white/20" />
          <div className="flex items-center gap-2 text-gray-400">
            <span>滚轮缩放</span>
          </div>
          <div className="w-px h-4 bg-white/20" />
          <div className="flex items-center gap-2 text-gray-400">
            <span>双击重置</span>
          </div>
          <div className="flex-1" />
          <span className="text-gray-300">从右侧选择变量</span>
        </div>
      </div>

      {/* 右侧：变量列表 */}
      <div className="w-[400px] flex flex-col border-l border-[#e8dfd3]">
        {/* 头部 */}
        <div className="p-4 border-b border-[#e8dfd3] bg-gradient-to-r from-[#f5f0e8] to-white">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-[#3d2314]">选择变量</h3>
            {onBack && (
              <button onClick={onBack} className="text-sm text-[#8b7355] hover:text-[#3d2314]">
                ← 返回
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索变量内容..."
              className="w-full pl-10 pr-4 py-2.5 bg-white rounded-lg text-sm border border-[#e8dfd3] focus:outline-none focus:ring-2 focus:ring-[#c17f59]/30"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 统计 */}
        <div className="px-4 py-2 bg-[#faf8f5] flex items-center justify-between text-xs border-b border-[#e8dfd3]">
          <span className="text-gray-500">
            共 {totalFiltered} 个变量
          </span>
          <span className="text-[#6b8e23] font-medium">
            已选 {selectedIds.size} 个
          </span>
        </div>

        {/* 变量列表 */}
        <div className="flex-1 overflow-y-auto">
          {filteredGroups.map(([type, vars]) => {
            const Icon = typeIcons[type] || Layers;
            const color = typeColors[type] || '#708090';
            const label = typeLabels[type] || type;
            const isExpanded = expandedGroups.has(type);
            const selectedInGroup = vars.filter(v => selectedIds.has(v.variableKey || '')).length;
            
            return (
              <div key={type} className="border-b border-[#e8dfd3] last:border-0">
                {/* 分组头 */}
                <div 
                  className="px-4 py-3 bg-[#faf8f5] flex items-center gap-2 cursor-pointer hover:bg-[#f0ebe3] transition-colors"
                  onClick={() => toggleGroup(type)}
                >
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                  <Icon className="w-4 h-4" style={{ color }} />
                  <span className="text-sm font-medium text-[#3d2314] flex-1">{label}</span>
                  <span className="text-xs text-gray-400">{vars.length}</span>
                  {selectedInGroup > 0 && (
                    <span className="text-xs bg-[#6b8e23] text-white px-1.5 py-0.5 rounded">{selectedInGroup}</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); selectAllInGroup(vars); }}
                    className="text-xs text-[#8b7355] hover:text-[#3d2314] ml-2"
                  >
                    {vars.every(v => selectedIds.has(v.variableKey || '')) ? '取消' : '全选'}
                  </button>
                </div>
                
                {/* 变量项 */}
                {isExpanded && vars.map(v => {
                  const isSelected = selectedIds.has(v.variableKey || '');
                  return (
                    <button
                      key={v.variableKey}
                      onClick={() => toggleSelection(v.variableKey || '')}
                      className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-[#f5f0e8] transition-colors ${isSelected ? 'bg-[#f0f5eb]' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${isSelected ? 'border-[#6b8e23] bg-[#6b8e23]' : 'border-gray-300'}`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm text-[#3d2314] truncate">{v.currentValue}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* 底部操作 */}
        <div className="p-4 border-t border-[#e8dfd3] bg-white">
          {selectedIds.size > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                {selectedVariables.slice(0, 6).map(v => (
                  <span key={v.variableKey} className="inline-flex items-center gap-1 px-2 py-1 bg-[#d4e4d1] text-[#3d5a3d] text-xs rounded-full max-w-[120px]">
                    <span className="truncate">{v.currentValue?.slice(0, 10)}</span>
                    <button onClick={(e) => { e.stopPropagation(); toggleSelection(v.variableKey || ''); }}>
                      <X className="w-3 h-3 flex-shrink-0" />
                    </button>
                  </span>
                ))}
                {selectedVariables.length > 6 && <span className="text-xs text-gray-400">+{selectedVariables.length - 6}</span>}
              </div>
              <button
                onClick={() => onConfirm?.(selectedVariables)}
                className="w-full py-3 bg-gradient-to-r from-[#6b8e23] to-[#556b2f] text-white rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                下一步：上传 CSV ({selectedIds.size} 个变量)
              </button>
            </div>
          ) : (
            <div className="text-center text-gray-400 text-sm py-4">
              从上方列表选择要批量替换的变量
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
