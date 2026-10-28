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

export type TaskCategory =
  | 'Modeling'
  | 'Production'
  | 'Maintenance'
  | 'Marketing'
  | 'R&D'
  | 'Content';

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
  linkedContentItemId?: string;
  sourceType?: 'manual' | 'content_session' | 'content_qc' | 'content_publish';
  sourceRefId?: string; // Deterministic ID for idempotent task generation
  scheduledTimeSlotWib?: string; // e.g., "19:30-21:30"
  category: TaskCategory;
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
  | 'Marketing & Ads'
  | 'Sponsorship & Creator Income'
  | 'Content Production Expense';

export interface FinancialRecord {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: 'Income' | 'Expense';
  category: FinancialCategory;
  amountRp: number;
  linkedProductId?: string;
  linkedContentItemId?: string;
  sourceRefId?: string; // Deterministic ID to prevent duplicate sponsorship/expense ledger posts
  paymentStatus?: 'Received' | 'Promised';
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

// ============================================================================
// CONTENT STUDIO — Maker & Creator Workspace Types
// ============================================================================

export type ContentPillar = 'personal' | '3d_marketing';

export type ContentFormat = 'short_video' | 'carousel' | 'mini_vlog' | 'cerpen';

export const CONTENT_FORMATS: { id: ContentFormat; label: string; badge: string }[] = [
  { id: 'short_video', label: 'Short Video (Reels/TikTok/Shorts)', badge: 'Short Video' },
  { id: 'carousel', label: 'Carousel Slides (IG/TikTok Photo)', badge: 'Carousel' },
  { id: 'mini_vlog', label: 'Mini Vlog (Behind the Scenes / Daily)', badge: 'Mini Vlog' },
  { id: 'cerpen', label: 'Short Story / Text Narrative (No Video Shots)', badge: 'Short Story / Text' },
];

export type ContentStage =
  | 'Strategy'
  | 'Idea & Research Bank'
  | 'Brief'
  | 'Script / Slides'
  | 'Shot List'
  | 'Production Plan'
  | 'Assets & Edit Notes'
  | 'QC'
  | 'Ready to Publish'
  | 'Published'
  | 'Review & Repurpose';

export const CONTENT_STAGES: ContentStage[] = [
  'Strategy',
  'Idea & Research Bank',
  'Brief',
  'Script / Slides',
  'Shot List',
  'Production Plan',
  'Assets & Edit Notes',
  'QC',
  'Ready to Publish',
  'Published',
  'Review & Repurpose',
];

export type ChannelPlatform = 'TikTok' | 'Instagram' | 'YouTube' | 'Threads/Blog';

export const CHANNEL_PLATFORMS: ChannelPlatform[] = [
  'TikTok',
  'Instagram',
  'YouTube',
  'Threads/Blog',
];

export interface CreatorCapacityConfig {
  timezone: 'Asia/Jakarta';
  weekdayOfficeStart: string; // "07:00"
  weekdayOfficeEnd: string; // "17:00"
  weekdayEveningStart: string; // "19:00"
  weekdayEveningEnd: string; // "22:00"
  maxWeekdayEveningHoursPerWeek: number; // e.g., 8
  maxWeekendHoursPerWeek: number; // e.g., 10
  targetPostsPerWeek: number; // e.g., 3
  primaryCameraDevice: string; // e.g., "iPhone 15 Pro (4K 60fps / Log)"
  strategyNotes: string;
}

export interface ContentProject {
  id: string;
  name: string;
  pillar: ContentPillar;
  linkedProductId?: string; // Optional link to 3D printed product
  targetAudience: string;
  coreAngle: string;
  active: boolean;
}

export interface ContentSeries {
  id: string;
  projectId: string;
  name: string;
  cadenceLabel: string; // e.g., "2x Weekly (Wed Evening & Sun)"
  defaultFormat: ContentFormat;
  defaultChannels: ChannelPlatform[];
  description: string;
}

export interface ContentReferenceItem {
  id: string;
  title: string;
  url?: string;
  factCheckNote: string;
  verified: boolean;
}

export interface CarouselSlide {
  id: string;
  slideNumber: number;
  headline: string;
  bodyCopy: string;
  visualPromptOrPhotoRef: string;
}

export interface ShotItem {
  id: string;
  shotNumber: number;
  visualAngle: string; // e.g., "Macro 2x iPhone lens — Silk PLA layer lines"
  audioOrAction: string;
  durationSec: number;
  location: string;
  iphoneSetting: string; // e.g., "4K 60fps, Cinematic 24fps, or 0.5x Ultra Wide"
  completed: boolean;
}

export interface LocalAssetReference {
  id: string;
  fileName: string; // e.g., "IMG_4821.MOV" or "CapCut_Dragon_Reel_v2"
  devicePathOrAlbum: string; // e.g., "iPhone Album: PrintOS October / Local Storage"
  assetType: 'iPhone Raw Video' | 'Voice-Over Audio' | 'Photo / Carousel' | 'Edit Project (CapCut/VN)' | 'Music / SFX';
  notes: string;
}

export interface ContentStageLog {
  id: string;
  stage: ContentStage;
  startedAtJakarta: string;
  completedAtJakarta: string;
  actor: 'user' | 'agent';
  summary: string;
  output: Record<string, string>;
  overrideReason?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  pillar: ContentPillar;
  format: ContentFormat;
  stage: ContentStage;
  /** Append-only log of what each stage produced, with Jakarta timestamps. */
  stageHistory?: ContentStageLog[];
  projectId: string;
  seriesId?: string;
  linkedProductId?: string; // Optional — personal content has no mandatory product
  priority: PriorityLevel;
  orderIndex: number;
  targetPublishDate: string; // YYYY-MM-DD in Asia/Jakarta
  voiceOverEnabled: boolean;
  voiceOverScriptOrNotes: string;
  // Connected Workbench Sections
  brief: {
    hook: string;
    keyMessage: string;
    callToAction: string;
    targetAudience: string;
    estimatedDurationSec: number;
  };
  references: ContentReferenceItem[];
  scriptText: string; // Full video script or short story narrative text
  carouselSlides: CarouselSlide[];
  shots: ShotItem[];
  localAssets: LocalAssetReference[]; // Local device file references only (never cloud uploads)
  qcChecklist: ChecklistItem[];
  nextAction: string;
  repurposedFromId?: string;
  updatedAt: string;
}

export type PublicationStatus =
  | 'Draft'
  | 'Scheduled'
  | 'Ready for Manual Post'
  | 'Published'
  | 'Postponed';

export const PUBLICATION_STATUSES: PublicationStatus[] = [
  'Draft',
  'Scheduled',
  'Ready for Manual Post',
  'Published',
  'Postponed',
];

export interface ContentPublication {
  id: string;
  contentItemId: string;
  channel: ChannelPlatform;
  caption: string;
  hashtags: string;
  scheduledDateJakarta: string; // YYYY-MM-DD
  scheduledTimeJakarta: string; // HH:mm (WIB)
  status: PublicationStatus;
  actualPublishedAtJakarta?: string; // Only populated when manually confirmed
  actualPostUrl?: string; // Only populated when manually confirmed
  platformNotes: string;
}

export type MetricWindow = '24h' | '7d';

export interface MetricSnapshot {
  id: string;
  publicationId: string;
  contentItemId: string;
  channel: ChannelPlatform;
  window: MetricWindow; // Cumulative snapshot at 24h or 7d (never summed together!)
  recordedAtJakarta: string; // YYYY-MM-DD HH:mm
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  watchTimeSeconds: number | null;
  completionRatePercent: number | null;
  profileVisits: number | null;
  productClicks: number | null;
  qualitativeNotes: string;
}

export type SessionActivityType =
  | 'iPhone Shooting'
  | 'Voice-Over & Audio'
  | 'CapCut/VN Editing'
  | 'Script / Story Writing';

export interface ProductionSession {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD in Asia/Jakarta
  startTimeWib: string; // HH:mm
  endTimeWib: string; // HH:mm
  durationMinutes: number; // Shared effort counted once even if multiple contentItemIds are covered
  activityType: SessionActivityType;
  device: string; // e.g., "iPhone 15 Pro + Desk Tripod"
  location: string;
  contentItemIds: string[]; // 1 session can batch-shoot multiple content items
  completed: boolean;
  notes: string;
}

export type SponsorshipStatus =
  | 'Negotiating'
  | 'Promised / Invoiced'
  | 'Received / Paid'
  | 'Cancelled';

export interface ContentSponsorship {
  id: string;
  brandName: string;
  title: string;
  contentItemId?: string;
  linkedProductId?: string;
  agreedAmountRp: number; // Promised/invoiced amount
  productionExpenseRp: number; // Props/lighting/filament expense for this content
  status: SponsorshipStatus;
  promisedDate: string; // YYYY-MM-DD
  receivedDate?: string; // YYYY-MM-DD (only when status === 'Received / Paid')
  invoiceRef: string;
  notes: string;
}

export interface WeeklyContentReview {
  id: string;
  weekStartDate: string; // YYYY-MM-DD (Monday)
  weekEndDate: string; // YYYY-MM-DD (Sunday)
  targetPosts: number;
  actualPublishedPosts: number;
  topPerformingContentId?: string;
  winsSummary: string;
  bottleneckSummary: string;
  repurposePlan: string;
  nextWeekPriority: string;
}

export interface SyncMetadata {
  schemaVersion: number;
  lastSavedRevisionId?: string;
  lastSyncedAt?: string;
  lastSpreadsheetTitle?: string;
}

export type ActiveBoardId =
  | 'overview'
  | 'catalog'
  | 'content'
  | 'tasks'
  | 'production'
  | 'inventory'
  | 'research'
  | 'business';

export interface PrintOSState {
  schemaVersion?: number;
  syncMeta?: SyncMetadata;
  products: Product[];
  tasks: TaskItem[];
  filaments: FilamentSpool[];
  printJobs: PrintJob[];
  printers: PrinterMachine[];
  researchNotes: ResearchNote[];
  orders: CustomerOrder[];
  financials: FinancialRecord[];
  // Content Studio State (Maker & Creator Workspace)
  creatorCapacity?: CreatorCapacityConfig;
  contentProjects?: ContentProject[];
  contentSeries?: ContentSeries[];
  contentItems?: ContentItem[];
  contentPublications?: ContentPublication[];
  metricSnapshots?: MetricSnapshot[];
  productionSessions?: ProductionSession[];
  contentSponsorships?: ContentSponsorship[];
  weeklyReviews?: WeeklyContentReview[];
}
