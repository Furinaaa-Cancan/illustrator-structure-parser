import { useState, useMemo, useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet, Play, Download, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Variable } from '@/types';

interface CSVRow {
  [key: string]: string;
}

interface BatchGeneratorProps {
  variables: Variable[];
  taskId: string;
  onBack: () => void;
}

export function BatchGenerator({ variables, taskId, onBack }: BatchGeneratorProps) {
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ success: number; failed: number; files: string[] } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 按类型分组变量
  const groupedVariables = useMemo(() => {
    const groups: Record<string, Variable[]> = {};
    variables.forEach(v => {
      const groupKey = v.variableType || 'other';
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(v);
    });
    return groups;
  }, [variables]);

  // 解析 CSV
  const handleCSVUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) return;

      const headers = parseCSVLine(lines[0]);
      setCsvHeaders(headers);

      const rows: CSVRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row: CSVRow = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });
        rows.push(row);
      }
      setCsvData(rows);

      // 自动映射（按名称匹配）
      const autoMapping: Record<string, string> = {};
      variables.forEach(v => {
        const matchHeader = headers.find(h => 
          h.toLowerCase() === v.variableKey.toLowerCase() ||
          h.toLowerCase() === v.variableLabel.toLowerCase() ||
          h.toLowerCase().includes(v.variableType.toLowerCase())
        );
        if (matchHeader) {
          autoMapping[v.variableKey] = matchHeader;
        }
      });
      setMapping(autoMapping);
    };
    reader.readAsText(file);
  }, [variables]);

  // 解析 CSV 行（处理引号）
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // 更新映射
  const updateMapping = (varId: string, header: string) => {
    setMapping(prev => ({
      ...prev,
      [varId]: header
    }));
  };

  // 批量生成
  const handleGenerate = async () => {
    if (csvData.length === 0) return;
    
    setGenerating(true);
    setProgress(0);
    setResults(null);

    try {
      const response = await fetch('/api/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          mapping,
          data: csvData
        })
      });

      if (!response.ok) throw new Error('生成失败');

      // 模拟进度
      for (let i = 0; i <= 100; i += 10) {
        setProgress(i);
        await new Promise(r => setTimeout(r, 200));
      }

      const result = await response.json();
      setResults(result);
    } catch (error) {
      console.error('批量生成失败:', error);
    } finally {
      setGenerating(false);
    }
  };

  // 下载结果
  const handleDownloadAll = async () => {
    const a = document.createElement('a');
    a.href = `/api/batch-download/${taskId}`;
    a.download = `batch_result_${taskId}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const mappedCount = Object.keys(mapping).length;
  const totalVars = variables.length;

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif text-[#3d2314]">批量生成</h2>
          <p className="text-sm text-[#8b7355] mt-1">上传 CSV 数据，自动映射变量并批量生成文件</p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-[#8b7355] hover:text-[#3d2314] transition-colors"
        >
          ← 返回结果
        </button>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 左侧：变量列表 */}
        <div className="col-span-5 bg-white rounded-xl border border-[#e8dfd3] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e8dfd3] bg-[#faf8f5]">
            <h3 className="text-sm font-medium text-[#3d2314]">检测到的变量</h3>
            <p className="text-xs text-[#8b7355] mt-0.5">{totalVars} 个变量，已映射 {mappedCount} 个</p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {Object.entries(groupedVariables).map(([groupId, vars]) => (
              <div key={groupId} className="border-b border-[#f0e8dc] last:border-0">
                <button
                  onClick={() => toggleGroup(groupId)}
                  className="w-full px-4 py-3 flex items-center gap-2 hover:bg-[#faf8f5] transition-colors"
                >
                  {expandedGroups.has(groupId) ? (
                    <ChevronDown className="w-4 h-4 text-[#8b7355]" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[#8b7355]" />
                  )}
                  <span className="text-sm text-[#3d2314] font-medium">
                    {groupId === 'ungrouped' ? '未分组' : groupId}
                  </span>
                  <span className="text-xs text-[#8b7355] ml-auto">{vars.length} 个</span>
                </button>
                {expandedGroups.has(groupId) && (
                  <div className="px-4 pb-3 space-y-2">
                    {vars.map(v => (
                      <div key={v.variableKey} className="flex items-center gap-3 p-2 rounded-lg bg-[#faf8f5]">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#3d2314] truncate">{v.variableKey}</p>
                          <p className="text-[10px] text-[#8b7355] truncate">{v.currentValue || '(空)'}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          v.variableType === 'name' ? 'bg-[#d4e4d1] text-[#4a6741]' :
                          v.variableType === 'date' ? 'bg-[#e4d4c4] text-[#8b6b4a]' :
                          v.variableType === 'image' ? 'bg-[#d4d4e4] text-[#4a4a6b]' :
                          'bg-[#e8e8e8] text-[#666]'
                        }`}>
                          {v.variableLabel}
                        </span>
                        {mapping[v.variableKey] && (
                          <Check className="w-4 h-4 text-[#6b8e6b]" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：CSV 上传和映射 */}
        <div className="col-span-7 space-y-4">
          {/* CSV 上传区域 */}
          <div className="bg-white rounded-xl border border-[#e8dfd3] p-5">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="w-5 h-5 text-[#8b5a3c]" />
              <h3 className="text-sm font-medium text-[#3d2314]">上传 CSV 数据</h3>
            </div>
            
            {csvData.length === 0 ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#e8dfd3] rounded-xl p-8 text-center cursor-pointer hover:border-[#c17f59] hover:bg-[#faf8f5] transition-all"
                >
                  <Upload className="w-8 h-8 text-[#c17f59] mx-auto mb-3" />
                  <p className="text-sm text-[#3d2314] mb-1">点击上传 CSV 文件</p>
                  <p className="text-xs text-[#8b7355]">第一行为列名，后续为数据</p>
                </div>
              </>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-[#6b8e6b]">
                    ✓ 已加载 {csvData.length} 行数据
                  </span>
                  <button
                    onClick={() => { setCsvData([]); setCsvHeaders([]); setMapping({}); }}
                    className="text-xs text-[#c17f59] hover:underline"
                  >
                    重新上传
                  </button>
                </div>
                <div className="text-xs text-[#8b7355]">
                  列：{csvHeaders.join(', ')}
                </div>
              </div>
            )}
          </div>

          {/* 映射配置 */}
          {csvData.length > 0 && (
            <div className="bg-white rounded-xl border border-[#e8dfd3] p-5">
              <h3 className="text-sm font-medium text-[#3d2314] mb-4">变量映射</h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {variables.map(v => (
                  <div key={v.variableKey} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#3d2314] truncate">{v.variableKey}</p>
                    </div>
                    <span className="text-xs text-[#8b7355]">→</span>
                    <select
                      value={mapping[v.variableKey] || ''}
                      onChange={(e) => updateMapping(v.variableKey, e.target.value)}
                      className="flex-1 text-xs border border-[#e8dfd3] rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-[#c17f59]"
                    >
                      <option value="">-- 选择 CSV 列 --</option>
                      {csvHeaders.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 生成按钮 */}
          {csvData.length > 0 && (
            <div className="flex items-center gap-4">
              <button
                onClick={handleGenerate}
                disabled={generating || mappedCount === 0}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#3d2314] text-white rounded-xl hover:bg-[#2d1a0f] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {generating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    生成中... {progress}%
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    生成 {csvData.length} 份文件
                  </>
                )}
              </button>
            </div>
          )}

          {/* 生成结果 */}
          {results && (
            <div className="bg-[#d4e4d1] rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <Check className="w-5 h-5 text-[#4a6741]" />
                <h3 className="text-sm font-medium text-[#3d2314]">生成完成</h3>
              </div>
              <p className="text-sm text-[#4a6741] mb-4">
                成功生成 {results.success} 份，失败 {results.failed} 份
              </p>
              <button
                onClick={handleDownloadAll}
                className="flex items-center gap-2 px-4 py-2 bg-white text-[#3d2314] rounded-lg hover:bg-[#faf8f5] transition-all text-sm"
              >
                <Download className="w-4 h-4" />
                下载全部结果 (ZIP)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CSV 预览 */}
      {csvData.length > 0 && (
        <div className="bg-white rounded-xl border border-[#e8dfd3] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#e8dfd3] bg-[#faf8f5]">
            <h3 className="text-sm font-medium text-[#3d2314]">数据预览</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#faf8f5]">
                <tr>
                  <th className="px-4 py-2 text-left text-[#8b7355] font-medium">#</th>
                  {csvHeaders.map(h => (
                    <th key={h} className="px-4 py-2 text-left text-[#8b7355] font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvData.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t border-[#f0e8dc]">
                    <td className="px-4 py-2 text-[#8b7355]">{i + 1}</td>
                    {csvHeaders.map(h => (
                      <td key={h} className="px-4 py-2 text-[#3d2314] truncate max-w-32">{row[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {csvData.length > 5 && (
              <div className="px-4 py-2 text-xs text-[#8b7355] text-center border-t border-[#f0e8dc]">
                ... 还有 {csvData.length - 5} 行
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
