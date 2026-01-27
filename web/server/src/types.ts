export interface TaskInfo {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  outputDir?: string;
}

export interface UploadResponse {
  taskId: string;
  filename: string;
  status: string;
}

export interface ProcessResponse {
  taskId: string;
  status: 'completed' | 'failed';
  error?: string;
}

export interface ResultResponse {
  taskId: string;
  files: Record<string, unknown>;
}

export interface FileInfo {
  name: string;
  icon: string;
  description: string;
}

export const OUTPUT_FILES: Record<string, FileInfo> = {
  structure: { name: 'structure.json', icon: 'Package', description: 'Complete structure data' },
  elements: { name: 'elements.json', icon: 'Layers', description: 'Elements list' },
  variables: { name: 'variables.json', icon: 'Target', description: 'Variable detection results' },
  variable_template: { name: 'variable_template.json', icon: 'FileText', description: 'Replacement template' },
  tree: { name: 'tree.json', icon: 'GitBranch', description: 'Hierarchy tree' },
  integrity_report: { name: 'integrity_report.json', icon: 'Shield', description: 'Integrity report' },
  audit_log: { name: 'audit_log.json', icon: 'Scroll', description: 'Audit log' },
};
