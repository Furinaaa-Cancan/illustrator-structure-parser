export interface Task {
  taskId: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  error?: string;
}

export interface DocumentInfo {
  name: string;
  width: number;
  height: number;
  colorSpace: string;
  artboards: Array<{ name: string; bounds: number[] }>;
}

// 边界框（画板相对坐标，Y轴向下为正）
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX?: number;
  centerY?: number;
}

// 组的语义角色
export interface GroupRole {
  type: 'generic' | 'card' | 'text_block' | 'decoration' | 'container';
  confidence: number;
  isCard: boolean;
  isRepeatable: boolean;
  suggestedPattern?: string;
}

// 剪切蒙版信息
export interface ClipInfo {
  hasClipMask: boolean;
  clipBounds?: Bounds;
  clipPathType?: string;
  maskedItemCount: number;
}

// 子元素摘要
export interface ChildrenSummary {
  total: number;
  byType: Record<string, number>;
  hasText: boolean;
  hasImage: boolean;
  hasPath: boolean;
  hasNestedGroup: boolean;
  textCount: number;
  imageCount: number;
}

export interface Element {
  id: string;
  name: string;
  type: string;
  typename?: string;
  category?: string;
  importance?: 'high' | 'medium' | 'low';
  variableKey?: string;
  variableType?: string;
  variableLabel?: string;
  currentValue?: string;
  bounds?: Bounds;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  parentId?: string;
  children?: Element[];
  // 组相关
  clipped?: boolean;
  clipInfo?: ClipInfo;
  childrenSummary?: ChildrenSummary;
  groupRole?: GroupRole;
  // ML 分析结果
  mlAnalysis?: {
    hierarchyRole: string;
    confidence: number;
    source: 'ml_service' | 'rule_based';
  };
}

export interface Variable {
  variableKey: string;
  variableLabel: string;
  variableType: string;
  currentValue: string;
  element?: Element;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  elementId?: string;
  elementPath?: string;
}

export interface IntegrityCheck {
  idCheck: {
    unique: boolean;
    totalIds: number;
    duplicates: string[];
  };
  hierarchyCheck: {
    valid: boolean;
    issues: string[];
  };
  boundsCheck: {
    valid: boolean;
    outOfBounds: Array<{
      elementId: string;
      elementType?: string;
      bounds?: Bounds;
      reason?: string;
    }>;
    partiallyVisible?: Array<{
      elementId: string;
      elementType?: string;
      bounds?: Bounds;
    }>;
    fullyVisible?: number;
    artboardSize?: { width: number; height: number };
  };
}

// 模式匹配结果
export interface PatternMatch {
  patternId: string;
  patternLabel: string;
  category: string;
  confidence: number;
  totalScore: number;
  repeatIndex?: number;
  repeatTotal?: number;
  fields: Record<string, {
    elementId: string;
    type: string;
    value: string;
    weight: number;
  }>;
}

export interface PatternAnalysis {
  patterns: PatternMatch[];
  summary: {
    totalPatterns: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    avgConfidence: number;
  };
  debug?: {
    candidateGroups: number;
    totalMatches: number;
    afterConflictResolution: number;
  };
  patternVariables?: Array<{
    variableId: string;
    patternId: string;
    fieldName: string;
    elementId: string;
    currentValue: string;
    confidence: number;
  }>;
}

// 树形结构节点
export interface TreeNode {
  id: string;
  type: string;
  name: string;
  children?: TreeNode[];
}

export interface ParsingResult {
  taskId: string;
  files: {
    structure?: {
      document: DocumentInfo;
      elements: Element[];
      tree?: TreeNode[];
      previewImage?: string;
      previewSVG?: string;
    };
    variables?: {
      variables: Variable[];
      totalVariables: number;
      byType: Record<string, Variable[]>;
    };
    variables_v2?: {
      variables: Variable[];
      totalVariables: number;
      byType: Record<string, Variable[]>;
      byCategory: Record<string, Variable[]>;
    };
    patterns?: PatternAnalysis;
    patterns_v2?: PatternAnalysis;
    integrity_report?: {
      integrityCheck: IntegrityCheck;
      validationReport: {
        valid: boolean;
        elementErrors: number;
        elementWarnings: number;
      };
    };
  };
}

export const VARIABLE_TYPE_COLORS: Record<string, string> = {
  text: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  date: 'bg-green-500/20 text-green-400 border-green-500/30',
  time: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  person_name: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  person_title: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  event_title: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  slogan: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  image: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  banner: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  avatar: 'bg-red-500/20 text-red-400 border-red-500/30',
  logo: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  shape: 'bg-gray-500-400 border-gray/20 text-gray-500/30',
  bg_shape: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  circle: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  line: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  symbol: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export const ELEMENT_TYPE_ICONS: Record<string, string> = {
  text: 'Type',
  rectangle: 'Square',
  ellipse: 'Circle',
  image: 'Image',
  group: 'Folder',
  artboard: 'Layout',
  path: 'Path',
  compoundPath: 'Layers',
  unknown: 'Question',
};
