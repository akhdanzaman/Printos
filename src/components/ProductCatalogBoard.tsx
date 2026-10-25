import React, { useState } from 'react';
import {
  ChecklistItem,
  FilamentSpool,
  Product,
  PRODUCT_STAGES,
  ProductStage,
} from '../types/printos';
import {
  calculateProductMargin,
  filterProducts,
  formatDuration,
  formatRupiah,
  getChecklistProgress,
  getProductStockStatus,
} from '../utils/calculations';
import { ProductArtwork } from './ProductArtwork';
import {
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  Copy,
  FileBox,
  FolderKanban,
  Layers,
  List,
  Minus,
  PackageCheck,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface ProductCatalogBoardProps {
  products: Product[];
  filaments: FilamentSpool[];
  globalSearch: string;
  selectedProduct: Product | null;
  onSelectProduct: (product: Product | null) => void;
  onSaveProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onDuplicateProduct: (product: Product) => void;
  onMoveProductStage: (productId: string, newStage: ProductStage) => void;
  onAdjustProductStock: (productId: string, delta: number) => void;
}

export const ProductCatalogBoard: React.FC<ProductCatalogBoardProps> = ({
  products,
  filaments,
  globalSearch,
  selectedProduct,
  onSelectProduct,
  onSaveProduct,
  onDeleteProduct,
  onDuplicateProduct,
  onMoveProductStage,
  onAdjustProductStock,
}) => {
  const [viewMode, setViewMode] = useState<'board' | 'list' | 'grouped'>('board');
  const [localSearch, setLocalSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [materialFilter, setMaterialFilter] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<string>('All');
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ProductStage | null>(null);

  // Modal editing state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [colorInput, setColorInput] = useState('');
  const [formError, setFormError] = useState('');

  // Sync external selectedProduct trigger
  React.useEffect(() => {
    if (selectedProduct) {
      setEditingProduct({
        ...selectedProduct,
        stockQuantity: selectedProduct.stockQuantity ?? 0,
        colors: [...selectedProduct.colors],
        checklist: selectedProduct.checklist.map((c) => ({ ...c })),
      });
      setColorInput(selectedProduct.colors.join(', '));
      setFormError('');
    } else {
      setEditingProduct(null);
    }
  }, [selectedProduct]);

  const effectiveQuery = (globalSearch || localSearch).trim();
  const filteredProducts = filterProducts(
    products,
    effectiveQuery,
    stageFilter,
    materialFilter,
    stockFilter
  );

  const uniqueMaterials = Array.from(
    new Set(products.map((p) => p.filamentMaterial))
  );

  const totalUnitsInStock = products.reduce(
    (sum, p) => sum + Math.max(0, p.stockQuantity ?? 0),
    0
  );
  const lowStockCount = products.filter((p) => {
    const qty = p.stockQuantity ?? 0;
    return qty > 0 && qty <= 3;
  }).length;

  const handleOpenNewProduct = (defaultStage: ProductStage = 'Idea') => {
    const defaultFilament = filaments[0];
    const freshProduct: Product = {
      id: `prod-${Date.now()}`,
      name: '',
      sku: `POS-SKU-${products.length + 1}`,
      stage: defaultStage,
      category: 'Functional Parts',
      dimensions: '100 × 100 × 45 mm',
      colors: [defaultFilament?.colorName || 'Charcoal Black'],
      filamentId: defaultFilament?.id || 'fil-1',
      filamentMaterial: defaultFilament?.material || 'PLA+',
      filamentGrams: 85,
      printTimeMinutes: 120,
      productionCostRp: 35000,
      sellingPriceRp: 115000,
      stockQuantity: defaultStage === 'Published' || defaultStage === 'Ready to Sell' ? 5 : 0,
      unitsSold: 0,
      stlFileName: 'new_product_model.3mf',
      stlFileSize: '4.2 MB',
      artworkPreset: 'voron',
      notes: '',
      checklist: [
        { id: `chk-${Date.now()}-1`, text: 'Export manifold 3MF/STL mesh', completed: false },
        { id: `chk-${Date.now()}-2`, text: 'Print prototype & verify dimensional fit', completed: false },
      ],
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    setEditingProduct(freshProduct);
    setColorInput(freshProduct.colors.join(', '));
    setFormError('');
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditingProduct({
          ...editingProduct,
          imageUrl: reader.result,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleStlFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    setEditingProduct({
      ...editingProduct,
      stlFileName: file.name,
      stlFileSize: `${sizeMb} MB`,
    });
  };

  const handleAutoCalculateCostFromSpool = () => {
    if (!editingProduct) return;
    const spool = filaments.find((f) => f.id === editingProduct.filamentId);
    const costPerGram = spool
      ? spool.purchasePriceRp / Math.max(1, spool.initialWeightGrams)
      : 250;
    const filamentCost = Math.round(editingProduct.filamentGrams * 1.1 * costPerGram);
    const machineAndPowerCost = Math.round((editingProduct.printTimeMinutes / 60) * 2500);
    const packagingCost = 5000;
    const totalCost = Math.ceil((filamentCost + machineAndPowerCost + packagingCost) / 500) * 500;
    const suggestedPrice = Math.ceil((totalCost * 2.6) / 1000) * 1000;

    setEditingProduct({
      ...editingProduct,
      productionCostRp: totalCost,
      sellingPriceRp: Math.max(editingProduct.sellingPriceRp, suggestedPrice),
    });
  };

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!editingProduct.name.trim()) {
      setFormError('Product name is required.');
      return;
    }
    const parsedColors = colorInput
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    onSaveProduct({
      ...editingProduct,
      name: editingProduct.name.trim(),
      stockQuantity: Math.max(0, Math.round(editingProduct.stockQuantity || 0)),
      colors: parsedColors.length > 0 ? parsedColors : ['Standard Black'],
      updatedAt: new Date().toISOString().slice(0, 10),
    });
    setEditingProduct(null);
    onSelectProduct(null);
  };

  const handleAddChecklistItem = () => {
    if (!editingProduct || !newChecklistText.trim()) return;
    const item: ChecklistItem = {
      id: `chk-${Date.now()}`,
      text: newChecklistText.trim(),
      completed: false,
    };
    setEditingProduct({
      ...editingProduct,
      checklist: [...editingProduct.checklist, item],
    });
    setNewChecklistText('');
  };

  return (
    <div className="space-y-5 pb-10">
      {/* Board Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                viewMode === 'board'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              Kanban Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Table List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                viewMode === 'grouped'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              By Filament
            </button>
          </div>

          {/* Search input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search products, SKU, STL..."
              aria-label="Search products"
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 w-48"
            />
          </div>

          {/* Stage filter */}
          <select
            aria-label="Filter by stage"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="All">All Stages ({products.length})</option>
            {PRODUCT_STAGES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Material filter */}
          <select
            aria-label="Filter by filament material"
            value={materialFilter}
            onChange={(e) => setMaterialFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="All">All Materials</option>
            {uniqueMaterials.map((mat) => (
              <option key={mat} value={mat}>
                {mat}
              </option>
            ))}
          </select>

          {/* Stock filter */}
          <select
            aria-label="Filter by stock level"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200"
          >
            <option value="All">All Stock ({totalUnitsInStock} pcs)</option>
            <option value="In Stock">In Stock (&gt; 0 pcs)</option>
            <option value="Low Stock">Low Stock (1–3 pcs)</option>
            <option value="Out of Stock">Out of Stock (0 pcs)</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden xl:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <PackageCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>
              Total Stock: <strong className="text-slate-800 dark:text-slate-200">{totalUnitsInStock} pcs</strong>
            </span>
            {lowStockCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {lowStockCount} low stock
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleOpenNewProduct('Idea')}
            className="px-3.5 py-2 text-xs font-semibold bg-amber-100 hover:bg-amber-200/80 text-amber-950 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 text-orange-600" />
            New Card
          </button>
        </div>
      </div>

      {/* Trello-Style 7-Stage Kanban Board View */}
      {viewMode === 'board' && (
        <div className="flex gap-3.5 overflow-x-auto pb-4 items-start">
          {PRODUCT_STAGES.map((stage, stageIdx) => {
            const stageProducts = filteredProducts.filter((p) => p.stage === stage);
            const isDropTarget = dragOverStage === stage;

            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStage(null);
                  if (draggedProductId) {
                    onMoveProductStage(draggedProductId, stage);
                    setDraggedProductId(null);
                  }
                }}
                className={`w-[272px] shrink-0 bg-[#F3EFEA] dark:bg-slate-900/90 border rounded-2xl p-3 flex flex-col transition-colors ${
                  isDropTarget
                    ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/20'
                    : 'border-orange-200/50 dark:border-slate-800'
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between px-1 pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {stageIdx + 1}. {stage}
                    </h3>
                    <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      ({stageProducts.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenNewProduct(stage)}
                    aria-label={`Add product to ${stage}`}
                    className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-md transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Cards Stack */}
                <div className="space-y-3 min-h-[120px]">
                  {stageProducts.map((product) => {
                    const margin = calculateProductMargin(
                      product.productionCostRp,
                      product.sellingPriceRp
                    );
                    const check = getChecklistProgress(product.checklist);
                    const stockInfo = getProductStockStatus(product.stockQuantity);

                    return (
                      <div
                        key={product.id}
                        draggable
                        onDragStart={() => setDraggedProductId(product.id)}
                        onDragEnd={() => {
                          setDraggedProductId(null);
                          setDragOverStage(null);
                        }}
                        className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:border-amber-500/60 transition-colors group cursor-grab active:cursor-grabbing"
                      >
                        <button
                          type="button"
                          onClick={() => setEditingProduct(product)}
                          className="w-full text-left block focus:outline-none"
                        >
                          <ProductArtwork product={product} className="h-32" />
                          <div className="p-3">
                            <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                              {product.sku} · {product.dimensions}
                            </div>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 leading-snug">
                              {product.name}
                            </h4>

                            {/* Unboxed clean metadata */}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                              <span>{product.filamentGrams}g</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatDuration(product.printTimeMinutes)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{product.colors[0]}</span>
                            </div>

                            {/* Cost, Price & Margin Row */}
                            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-mono tabular-nums">
                              <div>
                                <span className="text-slate-400">Cost </span>
                                <span className="text-slate-700 dark:text-slate-300">
                                  {formatRupiah(product.productionCostRp, true)}
                                </span>
                              </div>
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {formatRupiah(product.sellingPriceRp)}
                              </div>
                              <div className="text-emerald-600 dark:text-emerald-400 font-medium">
                                {margin.marginPercent}%
                              </div>
                            </div>

                            {/* Progress Bar if Checklist Exists */}
                            {check.total > 0 && (
                              <div className="mt-2.5 flex items-center gap-2">
                                <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-500 transition-all"
                                    style={{ width: `${check.percent}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                                  {check.completed}/{check.total}
                                </span>
                              </div>
                            )}
                          </div>
                        </button>

                        {/* Ready Stock Row with Interactive - / + Stepper */}
                        <div className="px-3 py-1.5 bg-orange-50/40 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs tabular-nums">
                          <span
                            className={`font-semibold ${
                              stockInfo.level === 'out_of_stock'
                                ? 'text-slate-400 dark:text-slate-500'
                                : stockInfo.level === 'low_stock'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            Stock: {stockInfo.quantity} pcs
                            {stockInfo.level === 'low_stock' && ' (Low)'}
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onAdjustProductStock(product.id, -1)}
                              disabled={stockInfo.quantity <= 0}
                              aria-label={`Decrease stock for ${product.name}`}
                              className="w-5 h-5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onAdjustProductStock(product.id, 1)}
                              aria-label={`Increase stock for ${product.name}`}
                              className="w-5 h-5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-slate-700 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Quick Card Footer Actions (Stage Move & Duplicate) */}
                        <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {stageIdx > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  onMoveProductStage(
                                    product.id,
                                    PRODUCT_STAGES[stageIdx - 1]
                                  )
                                }
                                aria-label={`Move ${product.name} back to ${PRODUCT_STAGES[stageIdx - 1]}`}
                                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                              >
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {stageIdx < PRODUCT_STAGES.length - 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  onMoveProductStage(
                                    product.id,
                                    PRODUCT_STAGES[stageIdx + 1]
                                  )
                                }
                                aria-label={`Advance ${product.name} to ${PRODUCT_STAGES[stageIdx + 1]}`}
                                className="px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded flex items-center gap-1"
                              >
                                Next: {PRODUCT_STAGES[stageIdx + 1]}
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onDuplicateProduct(product)}
                              aria-label={`Duplicate ${product.name}`}
                              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteProduct(product.id)}
                              aria-label={`Delete ${product.name}`}
                              className="p-1 text-slate-400 hover:text-red-600 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {stageProducts.length === 0 && (
                    <div className="py-8 px-3 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                      <p className="text-xs text-slate-400">No cards in {stage}</p>
                      <button
                        type="button"
                        onClick={() => handleOpenNewProduct(stage)}
                        className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
                      >
                        + Add to {stage}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* High-Density List View */}
      {viewMode === 'list' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/50">
                  <th className="py-3 px-4">Product & STL</th>
                  <th className="py-3 px-3">Stage</th>
                  <th className="py-3 px-3">Material & Size</th>
                  <th className="py-3 px-3 text-right">Stock (pcs)</th>
                  <th className="py-3 px-3 text-right">Print Time</th>
                  <th className="py-3 px-3 text-right">Cost (Rp)</th>
                  <th className="py-3 px-3 text-right">Price (Rp)</th>
                  <th className="py-3 px-3 text-right">Margin</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredProducts.map((product) => {
                  const margin = calculateProductMargin(
                    product.productionCostRp,
                    product.sellingPriceRp
                  );
                  const stockInfo = getProductStockStatus(product.stockQuantity);
                  return (
                    <tr
                      key={product.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setEditingProduct(product)}
                          className="font-semibold text-slate-900 dark:text-slate-100 hover:text-amber-600 text-left block"
                        >
                          {product.name}
                        </button>
                        <div className="text-xs font-mono text-slate-400">
                          {product.sku} · {product.stlFileName}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <select
                          aria-label={`Stage for ${product.name}`}
                          value={product.stage}
                          onChange={(e) =>
                            onMoveProductStage(product.id, e.target.value as ProductStage)
                          }
                          className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-800 dark:text-slate-200"
                        >
                          {PRODUCT_STAGES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-300">
                        <div>
                          {product.filamentMaterial} ({product.filamentGrams}g)
                        </div>
                        <div className="font-mono text-slate-400">{product.dimensions}</div>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-xs">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onAdjustProductStock(product.id, -1)}
                            disabled={stockInfo.quantity <= 0}
                            aria-label={`Decrease stock for ${product.name}`}
                            className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center disabled:opacity-40"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span
                            className={`font-semibold min-w-[42px] text-center ${
                              stockInfo.level === 'out_of_stock'
                                ? 'text-slate-400'
                                : stockInfo.level === 'low_stock'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {stockInfo.quantity} pcs
                          </span>
                          <button
                            type="button"
                            onClick={() => onAdjustProductStock(product.id, 1)}
                            aria-label={`Increase stock for ${product.name}`}
                            className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-700 dark:text-slate-300">
                        {formatDuration(product.printTimeMinutes)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-600 dark:text-slate-400">
                        {formatRupiah(product.productionCostRp)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {formatRupiah(product.sellingPriceRp)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        {margin.marginPercent}%
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingProduct(product)}
                            className="px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateProduct(product)}
                            aria-label={`Duplicate ${product.name}`}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteProduct(product.id)}
                            aria-label={`Delete ${product.name}`}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grouped by Filament Material View */}
      {viewMode === 'grouped' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {uniqueMaterials.map((mat) => {
            const matProducts = filteredProducts.filter(
              (p) => p.filamentMaterial === mat
            );
            return (
              <div
                key={mat}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {mat} Products
                  </h3>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {matProducts.length} items
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
                  {matProducts.map((p) => (
                    <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setEditingProduct(p)}
                          className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-amber-600 truncate block text-left"
                        >
                          {p.name}
                        </button>
                        <div className="text-xs text-slate-500 font-mono tabular-nums">
                          {p.stage} · Stock: {p.stockQuantity ?? 0} pcs · {formatRupiah(p.sellingPriceRp)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingProduct(p)}
                        className="px-2 py-1 text-xs text-amber-600 dark:text-amber-400 hover:underline shrink-0"
                      >
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detailed Trello-Style Card Modal for Editing/Adding Product */}
      {editingProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <form onSubmit={handleModalSubmit}>
              {/* Modal Top Bar */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
                <div>
                  <h2
                    id="product-modal-title"
                    className="text-base font-bold text-slate-900 dark:text-slate-100"
                  >
                    {editingProduct.name ? editingProduct.name : 'New 3D Printed Product'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {editingProduct.sku} · Stage: {editingProduct.stage} · Stock: {editingProduct.stockQuantity ?? 0} pcs
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingProduct(null);
                    onSelectProduct(null);
                  }}
                  aria-label="Close product modal"
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {formError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
                    {formError}
                  </div>
                )}

                {/* Visual Preview + Upload Photo + Upload STL/3MF */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  <div className="md:col-span-5 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                    <ProductArtwork product={editingProduct} className="h-44" />
                  </div>
                  <div className="md:col-span-7 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Product Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={editingProduct.name}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, name: e.target.value })
                        }
                        placeholder="e.g., Voron StealthBurner Toolhead Duct"
                        className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Progress Stage
                        </label>
                        <select
                          value={editingProduct.stage}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              stage: e.target.value as ProductStage,
                            })
                          }
                          className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        >
                          {PRODUCT_STAGES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Ready Stock (pcs)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={editingProduct.stockQuantity ?? 0}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              stockQuantity: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-full px-3 py-2 text-xs font-semibold tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          3D Artwork Style
                        </label>
                        <select
                          value={editingProduct.artworkPreset}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              artworkPreset: e.target.value as Product['artworkPreset'],
                            })
                          }
                          className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        >
                          <option value="dragon">Articulated / Dragon</option>
                          <option value="macropad">Enclosure / Macropad</option>
                          <option value="planter">Planter / Vase</option>
                          <option value="headphone">Stand / Holder</option>
                          <option value="voron">Printer Duct</option>
                          <option value="organizer">Gridfinity / Box</option>
                        </select>
                      </div>
                    </div>

                    {/* Upload Picture & Attach STL/3MF File */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label className="cursor-pointer px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        Upload Product Photo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>

                      <label className="cursor-pointer px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors">
                        <FileBox className="w-3.5 h-3.5 text-amber-500" />
                        Attach STL / 3MF File
                        <input
                          type="file"
                          accept=".stl,.3mf,.step,.stp,.obj,.gcode"
                          onChange={handleStlFileSelect}
                          className="hidden"
                        />
                      </label>
                      <span className="text-xs font-mono text-slate-500 truncate max-w-[200px]">
                        {editingProduct.stlFileName} ({editingProduct.stlFileSize})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Specs Grid: Dimensions, Colors, Filament Link, Print Time */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Dimensions (L × W × H)
                    </label>
                    <input
                      type="text"
                      value={editingProduct.dimensions}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, dimensions: e.target.value })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Colors (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={colorInput}
                      onChange={(e) => setColorInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Linked Filament Spool
                    </label>
                    <select
                      value={editingProduct.filamentId}
                      onChange={(e) => {
                        const sp = filaments.find((f) => f.id === e.target.value);
                        setEditingProduct({
                          ...editingProduct,
                          filamentId: e.target.value,
                          filamentMaterial: sp ? sp.material : editingProduct.filamentMaterial,
                        });
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      {filaments.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.brand} {f.name} ({f.material})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Filament Weight (grams)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={editingProduct.filamentGrams}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          filamentGrams: Number(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Printing Time (minutes)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={editingProduct.printTimeMinutes}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          printTimeMinutes: Number(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      STL / 3MF File Name
                    </label>
                    <input
                      type="text"
                      value={editingProduct.stlFileName}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          stlFileName: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* Financial Pricing in Indonesian Rupiah (Rp) */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Cost & Selling Price (Indonesian Rupiah — Rp)
                    </span>
                    <button
                      type="button"
                      onClick={handleAutoCalculateCostFromSpool}
                      className="px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 rounded-md transition-colors"
                    >
                      Auto-Estimate Cost from Spool & Time
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Production Cost (Rp)
                      </label>
                      <input
                        type="number"
                        step={500}
                        value={editingProduct.productionCostRp}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            productionCostRp: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Selling Price (Rp)
                      </label>
                      <input
                        type="number"
                        step={1000}
                        value={editingProduct.sellingPriceRp}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            sellingPriceRp: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-1.5 text-sm font-mono tabular-nums font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Unit Profit & Margin
                      </span>
                      <span className="text-sm font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                        {formatRupiah(
                          editingProduct.sellingPriceRp - editingProduct.productionCostRp
                        )}{' '}
                        (
                        {
                          calculateProductMargin(
                            editingProduct.productionCostRp,
                            editingProduct.sellingPriceRp
                          ).marginPercent
                        }
                        %)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Product Launch & QA Checklist */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5 text-amber-500" />
                    Product QA & Launch Checklist
                  </label>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg px-3">
                    {editingProduct.checklist.map((item) => (
                      <div
                        key={item.id}
                        className="py-2 flex items-center justify-between gap-2"
                      >
                        <label className="flex items-center gap-2.5 text-xs text-slate-800 dark:text-slate-200 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() =>
                              setEditingProduct({
                                ...editingProduct,
                                checklist: editingProduct.checklist.map((c) =>
                                  c.id === item.id ? { ...c, completed: !c.completed } : c
                                ),
                              })
                            }
                            className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                          />
                          <span className={item.completed ? 'line-through text-slate-400' : ''}>
                            {item.text}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingProduct({
                              ...editingProduct,
                              checklist: editingProduct.checklist.filter((c) => c.id !== item.id),
                            })
                          }
                          aria-label={`Remove checklist item ${item.text}`}
                          className="text-slate-400 hover:text-red-500 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newChecklistText}
                      onChange={(e) => setNewChecklistText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddChecklistItem();
                        }
                      }}
                      placeholder="Add checklist step (e.g., Test 0.16mm slicer overhang)..."
                      className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddChecklistItem}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-300"
                    >
                      Add Step
                    </button>
                  </div>
                </div>

                {/* Slicer & Production Notes */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Printing Notes, Slicer Settings & BOM Hardware
                  </label>
                  <textarea
                    rows={3}
                    value={editingProduct.notes}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, notes: e.target.value })
                    }
                    placeholder="Record layer height, infill %, wall loops, heat-set inserts, magnets..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/90 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteProduct(editingProduct.id);
                    setEditingProduct(null);
                    onSelectProduct(null);
                  }}
                  className="px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                >
                  Delete Product
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProduct(null);
                      onSelectProduct(null);
                    }}
                    className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors"
                  >
                    Save Product Card
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
