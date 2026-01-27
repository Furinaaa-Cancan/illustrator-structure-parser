import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Check, X, FolderOpen, History, Clock } from 'lucide-react';

interface HistoryTask {
  taskId: string;
  fileName: string;
  parsedAt: string;
  variableCount: number;
  elementCount: number;
}

interface DropzoneProps {
  onFileSelected: (file: File) => void;
  onLoadLocal?: () => void;
  onLoadHistory?: (taskId: string) => void;
  disabled?: boolean;
}

export function Dropzone({ onFileSelected, onLoadLocal, onLoadHistory, disabled }: DropzoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyTasks, setHistoryTasks] = useState<HistoryTask[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 加载历史记录
  const loadHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setHistoryTasks(data.tasks || []);
      setShowHistory(true);
    } catch (e) {
      console.error('加载历史失败:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setSelectedFile(file);
        onFileSelected(file);
      }
    },
    [onFileSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/illustrator': ['.ai'],
      'application/pdf': ['.ai'],
    },
    maxFiles: 1,
    disabled: disabled || selectedFile !== null,
  });0

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
  };

  if (selectedFile) {
    return (
      <div className="card p-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
            <Check className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{selectedFile.name}</p>
            <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
          </div>
          <button
            onClick={removeFile}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
        transition-all duration-300
        ${isDragActive
          ? 'border-[#1e3a5f] bg-[#1e3a5f]/5'
          : 'border-gray-300 hover:border-gray-400 bg-white'
        }
      `}
    >
      <input {...getInputProps()} />

      <div className={`
        w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4
        transition-all duration-300
        ${isDragActive ? 'bg-[#1e3a5f]' : 'bg-gray-100'}
      `}>
        <Upload className={`w-5 h-5 ${isDragActive ? 'text-white' : 'text-gray-500'}`} />
      </div>

      <p className="text-sm text-gray-700 mb-1">
        <span className="link font-medium">点击选择文件</span>
        <span className="text-gray-500"> 或拖拽到此处</span>
      </p>
      <p className="text-xs text-gray-400 mb-4">支持 .ai 格式，最大 100MB</p>
      
      <div className="flex items-center gap-2 justify-center">
        {onLoadLocal && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onLoadLocal(); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#6b5d4d] hover:text-[#3d2314] bg-[#f5f0e8] hover:bg-[#e8dfd3] rounded-lg transition-all"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            加载本地结果
          </button>
        )}
        {onLoadHistory && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); loadHistory(); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#6b5d4d] hover:text-[#3d2314] bg-[#f5f0e8] hover:bg-[#e8dfd3] rounded-lg transition-all"
          >
            <History className="w-3.5 h-3.5" />
            {loadingHistory ? '加载中...' : '历史记录'}
          </button>
        )}
      </div>

      {/* 历史记录列表 */}
      {showHistory && historyTasks.length > 0 && (
        <div className="mt-4 max-h-48 overflow-y-auto border border-[#e8dfd3] rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
          {historyTasks.map((task) => (
            <button
              key={task.taskId}
              onClick={() => { onLoadHistory?.(task.taskId); setShowHistory(false); }}
              className="w-full px-4 py-2.5 text-left hover:bg-[#f5f0e8] border-b border-[#f0e8dc] last:border-0 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#3d2314] font-medium truncate max-w-[200px]">{task.fileName}</span>
                <span className="text-xs text-[#8b7355] flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDate(task.parsedAt)}
                </span>
              </div>
              <div className="text-xs text-[#a89780] mt-0.5">
                {task.variableCount} 变量 · {task.elementCount} 元素
              </div>
            </button>
          ))}
        </div>
      )}
      {showHistory && historyTasks.length === 0 && (
        <div className="mt-4 text-xs text-[#8b7355] text-center py-3 bg-[#f5f0e8] rounded-lg" onClick={(e) => e.stopPropagation()}>
          暂无历史记录
        </div>
      )}
    </div>
  );
}
