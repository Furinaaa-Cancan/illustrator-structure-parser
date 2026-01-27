import { useState } from 'react';
import { Upload, Target, Layers, Shield, Github, AlertCircle, RefreshCw } from 'lucide-react';
import { Dropzone } from './components/Dropzone';
import { ProcessingState } from './components/ProcessingState';
import { ResultsDashboard } from './components/ResultsDashboard';
import { BatchGenerator } from './components/BatchGenerator';
import { SimpleVariableSelector } from './components/SimpleVariableSelector';
import { ParsingResult, Variable } from '@/types';

interface Task {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error' | 'batch' | 'select';
  selectedVariables?: Variable[];
  progress: number;
  message: string;
  error?: string;
  taskId?: string;
  result?: ParsingResult;
}

function App() {
  const [task, setTask] = useState<Task>({
    status: 'idle',
    progress: 0,
    message: '',
  });

  const handleFileSelected = async (file: File) => {
    setTask({ status: 'uploading', progress: 10, message: '正在上传文件...' });

    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('上传失败');
      const uploadData = await uploadRes.json();
      const taskId = uploadData.taskId;

      setTask({
        status: 'processing',
        progress: 30,
        message: '正在解析 AI 文件...',
        taskId,
      });

      const processRes = await fetch(`/api/process/${taskId}`, {
        method: 'POST',
      });

      if (!processRes.ok) throw new Error('解析失败');
      await processRes.json();

      let attempts = 0;
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 3000));
        attempts++;

        const statusRes = await fetch(`/api/status/${taskId}`);
        const statusData = await statusRes.json();

        setTask(prev => ({
          ...prev,
          progress: 30 + (attempts / 60) * 60,
          message: statusData.status === 'completed' ? '正在加载结果...' : '解析中，请稍候...',
        }));

        if (statusData.status === 'completed') {
          const resultRes = await fetch(`/api/result/${taskId}`);
          const resultData = await resultRes.json();

          setTask({
            status: 'completed',
            progress: 100,
            message: '解析完成',
            taskId,
            result: resultData,
          });
          return;
        }
      }

      throw new Error('处理超时');
    } catch (err) {
      setTask(prev => ({
        ...prev,
        status: 'error',
        message: err instanceof Error ? err.message : '操作失败',
      }));
    }
  };

  const handleReset = () => {
    setTask({ status: 'idle', progress: 0, message: '' });
  };

  // 加载本地 output 目录的结果
  const handleLoadLocal = async () => {
    setTask({ status: 'processing', progress: 50, message: '正在加载本地结果...' });
    try {
      // 添加时间戳避免缓存
      const res = await fetch('/api/local-result?t=' + Date.now());
      if (!res.ok) throw new Error('本地结果不存在');
      const data = await res.json();
      setTask({
        status: 'completed',
        progress: 100,
        message: '加载完成',
        taskId: 'local',
        result: data,
      });
    } catch (error) {
      setTask({
        status: 'error',
        progress: 0,
        message: '',
        error: error instanceof Error ? error.message : '加载失败',
      });
    }
  };

  // 加载历史记录
  const handleLoadHistory = async (taskId: string) => {
    setTask({ status: 'processing', progress: 50, message: '正在加载历史记录...' });
    try {
      const res = await fetch(`/api/result/${taskId}?t=` + Date.now());
      if (!res.ok) throw new Error('历史记录不存在');
      const data = await res.json();
      setTask({
        status: 'completed',
        progress: 100,
        message: '加载完成',
        taskId,
        result: data,
      });
    } catch (error) {
      setTask({
        status: 'error',
        progress: 0,
        message: '',
        error: error instanceof Error ? error.message : '加载失败',
      });
    }
  };


  return (
    <div className="min-h-screen flex">
      {/* 左侧导航栏 */}
      <aside className="w-56 bg-gradient-to-b from-[#3d2314] to-[#2a180e] text-white shrink-0 flex flex-col fixed h-full shadow-xl">
        {/* Logo 区域 */}
        <div className="p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c17f59] to-[#8b5a3c] flex items-center justify-center shadow-lg">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-serif font-medium tracking-wide">AI Template</h1>
              <p className="text-[#c17f59] text-xs italic font-serif -mt-0.5">Parser</p>
            </div>
          </div>
          <div className="w-full h-px bg-gradient-to-r from-[#c17f59] via-[#c17f59]/50 to-transparent mt-4" />
        </div>
        
        {/* 导航菜单 */}
        <nav className="flex-1 px-3">
          <p className="text-[10px] text-white/40 uppercase tracking-widest px-3 mb-2">功能</p>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm rounded-lg bg-[#c17f59]/15 text-[#c17f59] border border-[#c17f59]/20 mb-2">
            <Upload className="w-4 h-4" />
            上传解析
          </button>
          
          <p className="text-[10px] text-white/40 uppercase tracking-widest px-3 mb-2 mt-6">链接</p>
          <a 
            href="https://github.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all"
          >
            <Github className="w-4 h-4" />
            GitHub 仓库
          </a>
          <a 
            href="mailto:contact@example.com" 
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all"
          >
            <Shield className="w-4 h-4" />
            联系我们
          </a>
        </nav>
        
        
        {/* 底部 */}
        <div className="p-5 border-t border-white/10">
          <div className="px-3">
            <p className="text-[10px] text-white/30 leading-relaxed">
              © 2024 AI Template Parser
            </p>
            <p className="text-[10px] text-[#c17f59]/60 mt-1">v3.0</p>
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 ml-56 bg-[#f5f0e8] min-h-screen">
        {/* 顶部标题栏 */}
        <div className="border-b border-[#e8dfd3] bg-gradient-to-r from-[#f5f0e8] to-[#f0ebe3] px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1 h-6 bg-gradient-to-b from-[#c17f59] to-[#8b5a3c]" />
              <div>
                <p className="text-sm text-[#8b7355] tracking-widest uppercase">
                  智能模板解析
                </p>
                <p className="text-[10px] text-[#a89780]">
                  Adobe Illustrator 模板自动化工具
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#d4e4d1]/50">
                <div className="w-2 h-2 rounded-full bg-[#8b9a6b] animate-pulse" />
                <span className="text-xs text-[#6b5d4d]">系统就绪</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8">
          {task.status === 'idle' && (
            <div className="max-w-4xl mx-auto">
              {/* 主卡片 */}
              <div className="bg-gradient-to-br from-[#d4e4d1] to-[#c5d4c2] rounded-2xl p-8 mb-8">
                <h2 className="text-[#3d2314] font-serif text-2xl mb-2">上传 AI 模板文件</h2>
                <p className="text-[#6b5d4d] text-sm mb-8">
                  支持 Adobe Illustrator 格式，自动解析变量和结构信息
                </p>
                
                <div className="bg-white/40 rounded-xl p-8">
                  <Dropzone onFileSelected={handleFileSelected} onLoadLocal={handleLoadLocal} onLoadHistory={handleLoadHistory} />
                </div>
              </div>

              {/* 功能说明 */}
              <div className="grid grid-cols-2 gap-6">
                {/* 左侧 - 支持的功能 */}
                <div className="bg-white rounded-xl p-6 border border-[#e8dfd3]">
                  <h4 className="text-xs text-[#8b7355] uppercase tracking-widest mb-5 font-medium">解析功能</h4>
                  <div className="space-y-4">
                    <FeatureRow icon={Target} label="变量检测" desc="自动识别文本、日期、图片等变量类型" />
                    <FeatureRow icon={Layers} label="结构分析" desc="解析图层、分组、画板层级关系" />
                    <FeatureRow icon={Shield} label="完整性检查" desc="验证 ID 唯一性、层级关系、边界" />
                  </div>
                </div>

                {/* 右侧 - 输出格式 */}
                <div className="bg-white rounded-xl p-6 border border-[#e8dfd3]">
                  <h4 className="text-xs text-[#8b7355] uppercase tracking-widest mb-5 font-medium">输出文件</h4>
                  <div className="space-y-3">
                    <OutputItem name="structure.json" desc="完整文档结构" />
                    <OutputItem name="variables.json" desc="变量检测结果" />
                    <OutputItem name="elements.json" desc="元素列表" />
                    <OutputItem name="integrity_report.json" desc="完整性报告" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {(task.status === 'uploading' || task.status === 'processing') && (
            <div className="max-w-2xl mx-auto">
              <div className="bg-gradient-to-br from-[#d4e4d1] to-[#c5d4c2] rounded-2xl p-8">
                <ProcessingState progress={task.progress} message={task.message} />
              </div>
            </div>
          )}

          {task.status === 'completed' && task.result && (
            <ResultsDashboard 
              result={task.result} 
              taskId={task.taskId!} 
              onReset={handleReset} 
              onLoadLocal={handleLoadLocal}
              onBatchGenerate={() => setTask(prev => ({ ...prev, status: 'select' }))}
            />
          )}

          {task.status === 'select' && task.result && (
            <SimpleVariableSelector
              previewUrl={task.taskId === 'local' ? '/api/local-preview' : `/api/preview/${task.taskId}`}
              variables={task.result.files?.variables?.variables || []}
              onConfirm={(selected: Variable[]) => setTask(prev => ({ ...prev, status: 'batch', selectedVariables: selected }))}
              onBack={() => setTask(prev => ({ ...prev, status: 'completed' }))}
            />
          )}

          {task.status === 'batch' && task.result && (
            <BatchGenerator
              variables={task.selectedVariables || task.result.files?.variables?.variables || []}
              taskId={task.taskId!}
              onBack={() => setTask(prev => ({ ...prev, status: 'select' }))}
            />
          )}

          {task.status === 'error' && (
            <div className="max-w-md mx-auto">
              <div className="bg-white rounded-xl p-8 text-center border border-[#e8dfd3]">
                <div className="w-12 h-12 rounded-full bg-[#c17f59]/10 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-6 h-6 text-[#c17f59]" />
                </div>
                <h3 className="font-serif text-[#3d2314] text-lg mb-2">处理失败</h3>
                <p className="text-sm text-[#8b7355] mb-6">{task.message}</p>
                <button 
                  onClick={handleReset} 
                  className="px-5 py-2.5 bg-[#3d2314] text-white text-sm rounded-lg hover:bg-[#2d1a0f] transition-all inline-flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  重新尝试
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}

function FeatureRow({ icon: Icon, label, desc }: { icon: typeof Target; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-8 h-8 rounded-lg bg-[#d4e4d1] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[#3d2314]" />
      </div>
      <div>
        <p className="text-sm font-medium text-[#3d2314] mb-0.5">{label}</p>
        <p className="text-xs text-[#8b7355]">{desc}</p>
      </div>
    </div>
  );
}

function OutputItem({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#f0e8dc] last:border-0">
      <span className="text-sm font-mono text-[#8b5a3c]">{name}</span>
      <span className="text-xs text-[#8b7355]">{desc}</span>
    </div>
  );
}

export default App;
