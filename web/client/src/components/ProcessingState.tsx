import { Check, Clock } from 'lucide-react';

interface ProcessingStateProps {
  progress: number;
  message: string;
}

const steps = [
  { key: 'upload', label: '上传文件' },
  { key: 'parse', label: '解析中' },
  { key: 'complete', label: '完成' },
];

export function ProcessingState({ progress, message }: ProcessingStateProps) {
  const currentStep = progress < 50 ? 0 : progress < 100 ? 1 : 2;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Clock className="w-4 h-4 text-[#1e3a5f]" />
          <h3 className="font-medium text-gray-800">处理进度</h3>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span className="animate-pulse-soft">{message}</span>
            <span className="text-gray-400 font-medium">{progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isActive = index === currentStep;

            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className="step">
                  <div
                    className={`
                      step-circle
                      ${isCompleted ? 'completed' : ''}
                      ${isActive ? 'active' : ''}
                      ${!isCompleted && !isActive ? 'pending' : ''}
                    `}
                  >
                    {isCompleted ? <Check className="w-3 h-3" /> : index + 1}
                  </div>
                  <span className={isActive ? 'step-label active' : 'step-label inactive'}>
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className="flex-1 h-px bg-gray-200 mx-3" />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            Adobe Illustrator 正在解析您的文件，请耐心等待...
          </p>
        </div>
      </div>
    </div>
  );
}
