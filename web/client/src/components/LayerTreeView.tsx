import { useMemo, useState } from 'react';
import { Maximize2, Minimize2, ChevronRight, ChevronDown, Folder, FileText, Image, Box, Layers, Circle } from 'lucide-react';

interface TreeNode {
  id: string;
  type: string;
  name: string;
  children?: TreeNode[];
}

interface LayerTreeViewProps {
  treeData: TreeNode[];
}

const TYPE_ICONS: Record<string, typeof Folder> = {
  layer: Layers, group: Folder, clip_group: Folder, text: FileText,
  image_embedded: Image, image_linked: Image, path: Circle, compound_path: Circle, symbol: Box,
};

const TYPE_COLORS: Record<string, string> = {
  layer: '#3d2314', group: '#8b5a3c', clip_group: '#c17f59', text: '#4a7c59',
  image_embedded: '#5a7c9a', image_linked: '#5a7c9a', path: '#8b7355', compound_path: '#a08060', symbol: '#8b5a9b',
};

function TreeNodeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const Icon = TYPE_ICONS[node.type] || Box;
  const color = TYPE_COLORS[node.type] || '#6b5d4d';

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 hover:bg-[#f5f0e8] rounded cursor-pointer transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => hasChildren && setIsExpanded(!isExpanded)}
      >
        {hasChildren ? (
          isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#8b7355] flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-[#8b7355] flex-shrink-0" />
        ) : <span className="w-3.5 h-3.5 flex-shrink-0" />}
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
        <span className="text-sm text-[#3d2314] truncate flex-1">{node.name || `<${node.type}>`}</span>
        <span className="text-xs text-[#8b7355] bg-[#f5f0e8] px-1.5 py-0.5 rounded">{node.type}</span>
        {hasChildren && <span className="text-xs text-[#c17f59] font-medium">{node.children!.length}</span>}
      </div>
      {hasChildren && isExpanded && (
        <div className="border-l border-[#e8dfd3] ml-4">
          {node.children!.map((child, i) => <TreeNodeItem key={child.id || i} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export function LayerTreeView({ treeData }: LayerTreeViewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const stats = useMemo(() => {
    let total = 0;
    const byType: Record<string, number> = {};
    function countNodes(nodes: TreeNode[]) {
      for (const node of nodes) {
        total++; byType[node.type] = (byType[node.type] || 0) + 1;
        if (node.children) countNodes(node.children);
      }
    }
    countNodes(treeData || []);
    return { total, byType };
  }, [treeData]);

  const filteredData = useMemo(() => {
    if (!searchTerm || !treeData) return treeData || [];
    function filterNodes(nodes: TreeNode[]): TreeNode[] {
      return nodes.map(node => {
        const matches = node.name?.toLowerCase().includes(searchTerm.toLowerCase()) || node.type.toLowerCase().includes(searchTerm.toLowerCase());
        const filteredChildren = node.children ? filterNodes(node.children) : [];
        if (matches || filteredChildren.length > 0) return { ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children };
        return null;
      }).filter(Boolean) as TreeNode[];
    }
    return filterNodes(treeData);
  }, [treeData, searchTerm]);

  const containerClass = isFullscreen ? 'fixed inset-0 z-50 bg-white p-4' : 'relative w-full bg-white rounded-xl border border-[#e8dfd3] shadow-sm';

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between p-4 border-b border-[#e8dfd3]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#3d2314]/10 flex items-center justify-center"><Layers className="w-4 h-4 text-[#3d2314]" /></div>
          <div><h3 className="text-sm font-medium text-[#3d2314]">图层结构可视化</h3><p className="text-xs text-[#8b7355]">共 {stats.total} 个元素</p></div>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" placeholder="搜索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="px-3 py-1.5 text-sm border border-[#e8dfd3] rounded-lg focus:outline-none focus:border-[#c17f59] w-40" />
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 hover:bg-[#f5f0e8] rounded-lg transition-colors" title={isFullscreen ? '退出全屏' : '全屏'}>
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-[#6b5d4d]" /> : <Maximize2 className="w-4 h-4 text-[#6b5d4d]" />}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 p-3 border-b border-[#e8dfd3] bg-[#faf8f5]">
        {Object.entries(TYPE_COLORS).slice(0, 8).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-[#6b5d4d]">{type}</span>
            {stats.byType[type] && <span className="text-xs text-[#8b7355]">({stats.byType[type]})</span>}
          </div>
        ))}
      </div>
      <div className={`overflow-auto ${isFullscreen ? 'h-[calc(100vh-180px)]' : 'h-[400px]'}`}>
        {filteredData.length > 0 ? (
          <div className="p-2">{filteredData.map((node, i) => <TreeNodeItem key={node.id || i} node={node} depth={0} />)}</div>
        ) : (
          <div className="flex items-center justify-center h-full text-[#8b7355]">{searchTerm ? '未找到匹配的元素' : '暂无数据'}</div>
        )}
      </div>
      {isFullscreen && <button onClick={() => setIsFullscreen(false)} className="absolute bottom-4 right-4 px-4 py-2 bg-[#3d2314] text-white rounded-lg shadow-lg hover:bg-[#5a3a2a] transition-colors">关闭全屏</button>}
    </div>
  );
}
