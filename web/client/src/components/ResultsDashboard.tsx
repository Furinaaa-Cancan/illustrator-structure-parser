import { useMemo, useState, useRef, useEffect } from 'react';
import { Download, CheckCircle, FileText, Layers, BarChart3, ChevronDown, Users, Sparkles, Brain, Network, Cpu, FolderOpen, Play } from 'lucide-react';
import { ParsingResult, DocumentInfo, IntegrityCheck, Variable } from '@/types';
import { LayerVisualizer } from './LayerVisualizer';

interface ResultsDashboardProps {
  result: ParsingResult;
  taskId: string;
  onReset: () => void;
  onLoadLocal?: () => void;
  onBatchGenerate?: () => void;
}

export function ResultsDashboard({ result, taskId, onReset, onLoadLocal, onBatchGenerate }: ResultsDashboardProps) {
  const [downloading, setDownloading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);


  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 下载 JSON 文件
  const handleDownloadJSON = async () => {
    if (downloading) return;
    setDownloading(true);
    setShowMenu(false);
    
    try {
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `parsing_result_${taskId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载失败:', error);
    } finally {
      setDownloading(false);
    }
  };

  // 下载 ZIP 文件（服务端打包）
  const handleDownloadZIP = async () => {
    if (downloading) return;
    setDownloading(true);
    setShowMenu(false);
    
    try {
      const a = document.createElement('a');
      a.href = `/api/download/${taskId}`;
      a.download = `parsing_result_${taskId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('下载失败:', error);
    } finally {
      // ZIP 下载是异步的，延迟重置状态
      setTimeout(() => setDownloading(false), 1000);
    }
  };

  const { structure, variables, patterns, integrity_report } = result.files;
  const elements = structure?.elements || [];
  const docInfo: DocumentInfo = structure?.document || { name: '', width: 0, height: 0, colorSpace: '', artboards: [] };
  
  // 从 variables.variables 或 byType 获取变量列表
  let vars: Variable[] = [];
  if (variables?.variables && Array.isArray(variables.variables) && variables.variables.length > 0) {
    vars = variables.variables;
  } else if (variables?.byType) {
    // 从 byType 提取所有变量
    vars = Object.values(variables.byType).flat() as Variable[];
  }
  
  const patternList = patterns?.patterns || [];
  const integrity: IntegrityCheck = integrity_report?.integrityCheck || { idCheck: { unique: true, totalIds: 0, duplicates: [] }, hierarchyCheck: { valid: true, issues: [] }, boundsCheck: { valid: true, outOfBounds: [] } };
  const validation = integrity_report?.validationReport || { valid: true, elementErrors: 0, elementWarnings: 0 };
  

  const stats = useMemo(() => {
    return {
      totalElements: elements.length,
      totalVariables: variables?.totalVariables || 0,
      textElements: elements.filter(e => e.type === 'text').length,
      imageElements: elements.filter(e => e.type?.includes('image')).length,
    };
  }, [elements, variables]);

  const elementTypes = useMemo(() => {
    const types: Record<string, number> = {};
    elements.forEach(e => {
      types[e.type] = (types[e.type] || 0) + 1;
    });
    return Object.entries(types).sort((a, b) => b[1] - a[1]);
  }, [elements]);
  
  const varTypes = useMemo(() => {
    const types: Record<string, number> = {};
    vars.forEach(v => {
      const t = v.variableLabel || v.variableType || 'unknown';
      types[t] = (types[t] || 0) + 1;
    });
    return Object.entries(types).sort((a, b) => b[1] - a[1]);
  }, [vars]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* 顶部标题卡片 */}
      <div className="bg-white rounded-2xl p-6 mb-6 border border-[#e8dfd3] shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#c17f59] to-[#8b5a3c] flex items-center justify-center shadow-lg">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs text-[#8b7355] uppercase tracking-widest mb-1">解析结果</p>
              <h2 className="text-[#3d2314] font-serif text-xl">{docInfo.name || '文档分析'}</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onReset}
              className="px-4 py-2 text-sm text-[#3d2314] border border-[#d4c4b0] rounded-lg hover:bg-[#f5f0e8] transition-all"
            >
              重新解析
            </button>
            {onLoadLocal && taskId !== 'local' && (
              <button 
                onClick={onLoadLocal}
                className="px-4 py-2 text-sm text-[#6b5d4d] border border-[#d4c4b0] rounded-lg hover:bg-[#f5f0e8] transition-all flex items-center gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                加载本地
              </button>
            )}
            {onBatchGenerate && vars.length > 0 && (
              <button 
                onClick={onBatchGenerate}
                className="px-4 py-2 text-sm bg-gradient-to-r from-[#6b8e6b] to-[#4a6741] text-white rounded-lg hover:opacity-90 transition-all flex items-center gap-2 shadow-md"
              >
                <Play className="w-4 h-4" />
                批量生成
              </button>
            )}
            <div className="relative" ref={menuRef}>
              <button 
                onClick={() => setShowMenu(!showMenu)}
                disabled={downloading}
                className="px-4 py-2 text-sm bg-gradient-to-r from-[#3d2314] to-[#5a3a2a] text-white rounded-lg hover:opacity-90 transition-all flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className={`w-4 h-4 ${downloading ? 'animate-bounce' : ''}`} />
                {downloading ? '下载中...' : '下载结果'}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg border border-[#e8dfd3] py-1 z-10">
                  <button
                    onClick={handleDownloadJSON}
                    className="w-full px-4 py-2 text-left text-sm text-[#3d2314] hover:bg-[#f5f0e8] transition-colors"
                  >
                    下载 JSON
                  </button>
                  <button
                    onClick={handleDownloadZIP}
                    className="w-full px-4 py-2 text-left text-sm text-[#3d2314] hover:bg-[#f5f0e8] transition-colors"
                  >
                    下载 ZIP
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 快速统计 */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            <QuickStat icon={Layers} label="总元素" value={stats.totalElements} color="#3d2314" />
            <QuickStat icon={FileText} label="文本元素" value={stats.textElements} color="#c17f59" />
            <QuickStat icon={BarChart3} label="图片元素" value={stats.imageElements} color="#8b9a6b" />
            <QuickStat icon={CheckCircle} label="变量数量" value={vars.length} color="#6b8e6b" />
            <QuickStat icon={Users} label="复合模式" value={patternList.length} color="#8b5a9b" />
          </div>

          {/* 主卡片区域 - 左右两列等高布局 */}
          <div className="flex gap-5">
            {/* 左侧：变量列表 */}
            <div className="w-7/12">
              <div className="bg-gradient-to-br from-[#d4e4d1] to-[#c5d4c2] rounded-2xl p-6 shadow-sm flex flex-col h-[600px]">
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/50 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-[#3d2314]" />
                    </div>
                    <h3 className="text-[#3d2314] font-medium tracking-wide text-sm">检测到的变量</h3>
                  </div>
                  <span className="text-xs text-[#6b5d4d] bg-white/50 px-3 py-1.5 rounded-full font-medium">
                    共 {vars.length} 个
                  </span>
                </div>
                
                {/* 变量列表 - 可滚动 */}
                <div className="bg-white/50 rounded-xl p-4 overflow-y-auto backdrop-blur-sm flex-1 min-h-0">
                  {vars.map((v, i) => (
                    <div 
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-[#3d2314]/8 last:border-0 hover:bg-white/30 px-2 -mx-2 rounded transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${25 + i * 8}, 50%, ${45 + i * 2}%)` }} />
                        <span className="text-xs text-[#6b5d4d] font-medium uppercase tracking-wide">
                          {v.variableLabel || v.variableType}
                        </span>
                      </div>
                      <span className="text-sm text-[#3d2314] truncate max-w-[220px] font-medium">
                        {v.currentValue || '-'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 类型分布 - 固定底部 */}
                <div className="mt-4 pt-4 border-t border-[#3d2314]/10 flex-shrink-0">
                  <p className="text-xs text-[#6b5d4d] uppercase tracking-widest mb-3 font-medium">变量类型分布</p>
                  <div className="space-y-2">
                    {varTypes.slice(0, 4).map(([type, count], i) => (
                      <div key={type} className="flex items-center gap-3">
                        <span className="text-xs text-[#6b5d4d] w-20 truncate">{type}</span>
                        <div className="flex-1 h-2 bg-white/30 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all"
                            style={{ 
                              width: `${(count / vars.length) * 100}%`,
                              backgroundColor: i === 0 ? '#8b5a3c' : i === 1 ? '#c17f59' : i === 2 ? '#8b9a6b' : '#a08060'
                            }}
                          />
                        </div>
                        <span className="text-xs text-[#3d2314] font-medium w-8 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧：信息卡片组 */}
            <div className="w-5/12 flex flex-col gap-4 h-[600px] overflow-y-auto">
              {/* 文档信息 */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-[#e8dfd3] flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md bg-[#3d2314]/10 flex items-center justify-center">
                    <FileText className="w-3 h-3 text-[#3d2314]" />
                  </div>
                  <h4 className="text-xs text-[#8b7355] uppercase tracking-widest">文档信息</h4>
                </div>
                <div className="space-y-2">
                  <InfoRow label="尺寸" value={`${docInfo.width || 0} × ${docInfo.height || 0}`} />
                  <InfoRow label="颜色空间" value={docInfo.colorSpace || 'RGB'} />
                  <InfoRow label="画板数" value={String((docInfo.artboards || []).length)} />
                </div>
              </div>

              {/* 元素分布 */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-[#e8dfd3] flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md bg-[#c17f59]/10 flex items-center justify-center">
                    <BarChart3 className="w-3 h-3 text-[#c17f59]" />
                  </div>
                  <h4 className="text-xs text-[#8b7355] uppercase tracking-widest">元素类型分布</h4>
                </div>
                <div className="space-y-2">
                  {elementTypes.slice(0, 6).map(([type, count], i) => (
                    <div key={type} className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ['#8b5a3c', '#c17f59', '#8b9a6b', '#a08060', '#6b8e6b', '#d4a574'][i] || '#8b7355' }} />
                      <span className="text-xs text-[#6b5d4d] flex-1">{type}</span>
                      <span className="text-sm font-medium text-[#3d2314]">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ML 分析 */}
              <div className="bg-gradient-to-br from-[#e8e4f0] to-[#d8d4e8] rounded-xl p-5 shadow-sm flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md bg-white/50 flex items-center justify-center">
                    <Brain className="w-3 h-3 text-[#6b5a8b]" />
                  </div>
                  <h4 className="text-xs text-[#5d5d6d] uppercase tracking-widest">ML 层次分析</h4>
                  <span className="ml-auto text-xs bg-white/50 px-2 py-0.5 rounded-full text-[#6b5a8b]">GNN 模型</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-white/40 rounded-lg px-3 py-2">
                    <Network className="w-3 h-3 text-[#6b5a8b]" />
                    <span className="text-xs text-[#5d5d6d] flex-1">层级角色分类</span>
                    <span className="text-xs text-[#6b5a8b] font-medium">8 类</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/40 rounded-lg px-3 py-2">
                    <Cpu className="w-3 h-3 text-[#6b5a8b]" />
                    <span className="text-xs text-[#5d5d6d] flex-1">结构模式识别</span>
                    <span className="text-xs text-[#6b5a8b] font-medium">12 种</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/40 rounded-lg px-3 py-2">
                    <Users className="w-3 h-3 text-[#6b5a8b]" />
                    <span className="text-xs text-[#5d5d6d] flex-1">逻辑分组推断</span>
                    <span className="text-xs text-[#6b5a8b] font-medium">自动</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/30">
                  <p className="text-xs text-[#8b7355]">
                    ML 服务: <span className="text-[#a05a4a]">未连接</span>
                    <a href="http://localhost:8765/docs" target="_blank" className="ml-2 text-[#6b5a8b] underline">启动服务</a>
                  </p>
                </div>
              </div>

              {/* 完整性检查 */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-[#e8dfd3] flex-shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md bg-[#8b9a6b]/10 flex items-center justify-center">
                    <CheckCircle className="w-3 h-3 text-[#8b9a6b]" />
                  </div>
                  <h4 className="text-xs text-[#8b7355] uppercase tracking-widest">完整性状态</h4>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <LegendItem color="#8b5a3c" label="ID 唯一性" status={integrity.idCheck?.unique ?? true} />
                  <LegendItem color="#c17f59" label="层级关系" status={integrity.hierarchyCheck?.valid ?? true} />
                  <LegendItem color="#8b9a6b" label="边界检查" status={integrity.boundsCheck?.valid ?? true} />
                  <LegendItem color="#a08060" label="结构验证" status={validation.valid ?? true} />
                </div>
                {integrity.boundsCheck?.artboardSize && (
                  <div className="mt-3 pt-3 border-t border-[#e8dfd3] text-xs text-[#8b7355] space-y-1">
                    <p>画板尺寸: {integrity.boundsCheck.artboardSize.width} × {integrity.boundsCheck.artboardSize.height}</p>
                    {integrity.boundsCheck.fullyVisible !== undefined && <p>画板内元素: {integrity.boundsCheck.fullyVisible} 个</p>}
                    {integrity.boundsCheck.partiallyVisible && integrity.boundsCheck.partiallyVisible.length > 0 && (
                      <p className="text-[#c17f59]">部分可见: {integrity.boundsCheck.partiallyVisible.length} 个</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 图层结构可视化 */}
          <div className="mt-6">
            <LayerVisualizer 
              treeData={structure?.tree || []} 
              elements={elements}
              docWidth={docInfo.width || 1280}
              docHeight={docInfo.height || 720}
              previewImage={structure?.previewImage ? (taskId === 'local' ? `/api/local-output/${structure.previewImage}` : `/api/result/${taskId}/${structure.previewImage}`) : undefined}
              previewSVG={structure?.previewSVG ? (taskId === 'local' ? `/api/local-output/${structure.previewSVG}` : `/api/result/${taskId}/${structure.previewSVG}`) : undefined}
            />
          </div>
    </div>
  );
}

function QuickStat({ icon: Icon, label, value, color }: { icon: typeof Layers; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-[#e8dfd3] shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <span className="text-xs text-[#8b7355] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-light pl-11" style={{ color }}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#f0e8dc] last:border-0">
      <span className="text-xs text-[#8b7355]">{label}</span>
      <span className="text-sm text-[#3d2314] font-medium">{value}</span>
    </div>
  );
}

function LegendItem({ color, label, status }: { color: string; label: string; status: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs text-[#6b5d4d] flex-1">{label}</span>
      <CheckCircle className={`w-3.5 h-3.5 ${status ? 'text-[#8b9a6b]' : 'text-[#c17f59]'}`} />
    </div>
  );
}
