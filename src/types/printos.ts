export type ProductStage =
  | 'Idea'
  | 'Modeling'
  | 'Prototype'
  | 'Testing'
  | 'Finalizing'
  | 'Ready to Sell'
  | 'Published';

export const PRODUCT_STAGES: ProductStage[] = [
  'Idea',
  'Modeling',
  'Prototype',
  'Testing',
  'Finalizing',
  'Ready to Sell',
  'Published',
];

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  stage: ProductStage;
  category: string;
  dimensions: string; // e.g., "145 × 90 × 62 mm"
  colors: string[];
  filamentId: string; // Linked to FilamentSpool.id
  filamentMaterial: string;
  filamentGrams: number;
  printTimeMinutes: number;
  productionCostRp: number;
  sellingPriceRp: number;
  stockQuantity: number;
  unitsSold: number;
  stlFileName: string;
  stlFileSize: string;
  artworkPreset: 'dragon' | 'macropad' | 'planter' | 'headphone' | 'voron' | 'organizer' | 'custom';
  imageUrl?: string;
  notes: string;
  checklist: ChecklistItem[];
  updatedAt: string;
}

export type TaskStage = 'Backlog' | 'Today' | 'In Progress' | 'Review' | 'Completed';

export const TASK_STAGES: TaskStage[] = [
  'Backlog',
  'Today',
  'In Progress',
  'Review',
  'Completed',
];

export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface TaskItem {
  id: string;
  title: string;
  stage: TaskStage;
  priority: PriorityLevel;
  plannedStartDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD (Planned Due Date)
  actualStartDate?: string; // YYYY-MM-DD
  actualEndDate?: string; // YYYY-MM-DD (Actual Finished Date)
  linkedProductId?: string;
  category: 'Modeling' | 'Production' | 'Maintenance' | 'Marketing' | 'R&D';
  estimatedMinutes: number;
  checklist: ChecklistItem[];
  notes: string;
}

export type FilamentStage =
  | 'In Stock'
  | 'Loaded in Printer'
  | 'Low Stock'
  | 'Reorder Needed';

export const FILAMENT_STAGES: FilamentStage[] = [
  'In Stock',
  'Loaded in Printer',
  'Low Stock',
  'Reorder Needed',
];

export interface FilamentSpool {
  id: string;
  brand: string;
  name: string;
  material: 'PLA+' | 'Silk PLA' | 'PETG' | 'ASA' | 'TPU 95A' | 'CF-PETG' | 'ABS';
  colorName: string;
  colorHex: string;
  initialWeightGrams: number;
  remainingWeightGrams: number;
  purchasePriceRp: number;
  dryStatus: 'Dry (15% RH)' | 'Needs Drying' | 'In Dryer';
  assignedPrinter?: string;
  stage: FilamentStage;
  notes: string;
}

export type ProductionStage =
  | 'Queued'
  | 'Printing'
  | 'Post-Processing'
  | 'Quality Check'
  | 'Completed'
  | 'Failed / Reprint';

export const PRODUCTION_STAGES: ProductionStage[] = [
  'Queued',
  'Printing',
  'Post-Processing',
  'Quality Check',
  'Completed',
  'Failed / Reprint',
];

export interface PrintJob {
  id: string;
  jobTitle: string;
  productId?: string;
  printerId: string;
  filamentId: string;
  stage: ProductionStage;
  batchQuantity: number;
  printTimeMinutes: number;
  filamentGramsUsed: number;
  failureReason?: string;
  customerOrderRef?: string;
  assemblySteps: ChecklistItem[];
  notes: string;
  updatedAt: string;
}

export interface PrinterMachine {
  id: string;
  name: string;
  model: string;
  nozzleSize: string;
  status: 'Printing' | 'Idle' | 'Maintenance';
  totalHours: number;
  hoursSinceMaintenance: number;
  maintenanceChecklist: ChecklistItem[];
}

export type ResearchStage =
  | 'Idea Backlog'
  | 'Slicer Profiles'
  | 'Troubleshooting'
  | 'Verified Settings'
  | 'Links & References';

export const RESEARCH_STAGES: ResearchStage[] = [
  'Idea Backlog',
  'Slicer Profiles',
  'Troubleshooting',
  'Verified Settings',
  'Links & References',
];

export interface ResearchNote {
  id: string;
  title: string;
  stage: ResearchStage;
  linkedProductId?: string;
  printerModel: string;
  material: string;
  nozzleTemp: number;
  bedTemp: number;
  layerHeight: string;
  printSpeed: string;
  problemSummary: string;
  solutionSummary: string;
  referenceUrl?: string;
  tags: string[];
  checklist: ChecklistItem[];
  updatedAt: string;
}

export type OrderStage =
  | 'New Order'
  | 'Printing'
  | 'Packing & QC'
  | 'Shipped'
  | 'Completed';

export const ORDER_STAGES: OrderStage[] = [
  'New Order',
  'Printing',
  'Packing & QC',
  'Shipped',
  'Completed',
];

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  channel: 'Tokopedia' | 'Shopee' | 'Instagram' | 'Direct Custom' | 'TikTok Shop';
  productId: string;
  quantity: number;
  totalAmountRp: number;
  costAmountRp: number;
  stage: OrderStage;
  dueDate: string;
  customerNotes: string;
  checklist: ChecklistItem[];
}

export type FinancialCategory =
  | 'Sales Revenue'
  | 'Filament Purchase'
  | 'Equipment & Printers'
  | 'Spare Parts & Nozzle'
  | 'Packaging & Shipping'
  | 'Electricity & Ops'
  | 'Marketing & Ads';

export interface FinancialRecord {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: 'Income' | 'Expense';
  category: FinancialCategory;
  amountRp: number;
  linkedProductId?: string;
  notes: string;
}

export interface CostCalculatorInput {
  spoolPriceRp: number;
  spoolWeightGrams: number;
  partWeightGrams: number;
  wastePercent: number; // support + purge %
  printTimeHours: number;
  printerWatts: number;
  electricityRateRpPerKwh: number;
  machineDepreciationRpPerHour: number;
  laborAndHardwareRp: number;
  packagingRp: number;
  targetMarginPercent: number; // e.g., 55% profit margin or markup
}

export interface CostCalculatorResult {
  costPerGramRp: number;
  effectiveWeightGrams: number;
  filamentCostRp: number;
  electricityCostRp: number;
  machineWearCostRp: number;
  totalProductionCostRp: number;
  recommendedSellingPriceRp: number;
  estimatedProfitRp: number;
  actualMarginPercent: number;
}

export type ActiveBoardId =
  | 'overview'
  | 'catalog'
  | 'tasks'
  | 'production'
  | 'inventory'
  | 'research'
  | 'business';

export interface PrintOSState {
  products: Product[];
  tasks: TaskItem[];
  filaments: FilamentSpool[];
  printJobs: PrintJob[];
  printers: PrinterMachine[];
  researchNotes: ResearchNote[];
  orders: CustomerOrder[];
  financials: FinancialRecord[];
}
