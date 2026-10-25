import React, { useState } from 'react';
import {
  FILAMENT_STAGES,
  FilamentSpool,
  FilamentStage,
} from '../types/printos';
import { computeFilamentStage, formatRupiah } from '../utils/calculations';
import {
  FolderKanban,
  List,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

interface InventoryBoardProps {
  filaments: FilamentSpool[];
  globalSearch: string;
  onSaveFilament: (spool: FilamentSpool, logExpenseRp?: number) => void;
  onDeleteFilament: (spoolId: string) => void;
  onAdjustWeight: (spoolId: string, deltaGrams: number) => void;
}

export const InventoryBoard: React.FC<InventoryBoardProps> = ({
  filaments,
  globalSearch,
  onSaveFilament,
  onDeleteFilament,
  onAdjustWeight,
}) => {
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [materialFilter, setMaterialFilter] = useState<string>('All');
  const [editingSpool, setEditingSpool] = useState<FilamentSpool | null>(null);
  const [recordPurchaseExpense, setRecordPurchaseExpense] = useState(false);

  const filteredSpools = filaments.filter((f) => {
    if (materialFilter !== 'All' && f.material !== materialFilter) return false;
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      return (
        f.brand.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.material.toLowerCase().includes(q) ||
        f.colorName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalRemainingGrams = filaments.reduce((acc, s) => acc + s.remainingWeightGrams, 0);
  const totalStockValueRp = filaments.reduce((acc, s) => {
    const ratio = s.initialWeightGrams > 0 ? s.remainingWeightGrams / s.initialWeightGrams : 0;
    return acc + Math.round(s.purchasePriceRp * ratio);
  }, 0);

  const handleOpenNewSpool = () => {
    setEditingSpool({
      id: `fil-${Date.now()}`,
      brand: 'eSUN',
      name: 'PLA+ Fire Engine Red',
      material: 'PLA+',
      colorName: 'Fire Engine Red',
      colorHex: '#DC2626',
      initialWeightGrams: 1000,
      remainingWeightGrams: 1000,
      purchasePriceRp: 215000,
      dryStatus: 'Dry (15% RH)',
      assignedPrinter: '',
      stage: 'In Stock',
      notes: '',
    });
    setRecordPurchaseExpense(true);
  };

  const handleSpoolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSpool || !editingSpool.name.trim()) return;
    const autoStage = computeFilamentStage(
      editingSpool.remainingWeightGrams,
      editingSpool.initialWeightGrams,
      editingSpool.assignedPrinter
    );
    onSaveFilament(
      {
        ...editingSpool,
        stage: autoStage,
      },
      recordPurchaseExpense ? editingSpool.purchasePriceRp : 0
    );
    setEditingSpool(null);
  };

  return (
    <div className="space-y-5 pb-10">
      {/* Inventory Summary & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'board'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              Spool Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Inventory Sheet
            </button>
          </div>

          <select
            aria-label="Filter by filament material"
            value={materialFilter}
            onChange={(e) => setMaterialFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
          >
            <option value="All">All Materials ({filaments.length} spools)</option>
            <option value="PLA+">PLA+</option>
            <option value="Silk PLA">Silk PLA</option>
            <option value="PETG">PETG</option>
            <option value="ASA">ASA</option>
            <option value="TPU 95A">TPU 95A</option>
          </select>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums pl-2">
            <span>Total Stock: {(totalRemainingGrams / 1000).toFixed(2)} kg</span>
            <span aria-hidden="true">·</span>
            <span>Value: {formatRupiah(totalStockValueRp)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenNewSpool}
          className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          Add Filament Spool
        </button>
      </div>

      {/* Board View */}
      {viewMode === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {FILAMENT_STAGES.map((stage) => {
            const stageSpools = filteredSpools.filter((s) => s.stage === stage);

            return (
              <div
                key={stage}
                className="bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 flex flex-col"
              >
                <div className="flex items-center justify-between px-1 pb-3">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {stage} ({stageSpools.length})
                  </h3>
                </div>

                <div className="space-y-3 min-h-[100px]">
                  {stageSpools.map((spool) => {
                    const pct = Math.min(
                      100,
                      Math.round((spool.remainingWeightGrams / spool.initialWeightGrams) * 100)
                    );
                    const costPerGram = Math.round(
                      spool.purchasePriceRp / Math.max(1, spool.initialWeightGrams)
                    );

                    return (
                      <div
                        key={spool.id}
                        className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSpool(spool);
                            setRecordPurchaseExpense(false);
                          }}
                          className="w-full text-left block"
                        >
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {spool.brand} · {spool.material}
                            </span>
                            <span className="font-mono tabular-nums">
                              {formatRupiah(costPerGram)}/g
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className="w-3.5 h-3.5 rounded-xs border border-slate-300 dark:border-slate-700 shrink-0"
                              style={{ backgroundColor: spool.colorHex }}
                            />
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {spool.name}
                            </h4>
                          </div>

                          {/* Remaining Grams Bar */}
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-1">
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {spool.remainingWeightGrams}g / {spool.initialWeightGrams}g
                              </span>
                              <span className="text-slate-400">{pct}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  pct <= 15
                                    ? 'bg-red-500'
                                    : pct <= 30
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                            <span>Price: {formatRupiah(spool.purchasePriceRp)}</span>
                            <span>{spool.dryStatus}</span>
                          </div>
                        </button>

                        {/* Quick Gram Deduction / Restock Buttons */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onAdjustWeight(spool.id, -50)}
                              className="px-2 py-1 text-[11px] font-mono bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded text-slate-700 dark:text-slate-300"
                            >
                              -50g
                            </button>
                            <button
                              type="button"
                              onClick={() => onAdjustWeight(spool.id, 50)}
                              className="px-2 py-1 text-[11px] font-mono bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded text-slate-700 dark:text-slate-300"
                            >
                              +50g
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              onAdjustWeight(
                                spool.id,
                                spool.initialWeightGrams - spool.remainingWeightGrams
                              )
                            }
                            className="px-2 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Refill 1kg
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/50">
                  <th className="py-3 px-4">Brand & Spool</th>
                  <th className="py-3 px-3">Material</th>
                  <th className="py-3 px-3">Stage & Printer</th>
                  <th className="py-3 px-3 text-right">Remaining (g)</th>
                  <th className="py-3 px-3 text-right">Spool Price (Rp)</th>
                  <th className="py-3 px-3 text-right">Cost / g</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredSpools.map((spool) => (
                  <tr key={spool.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-xs border border-slate-300 shrink-0"
                          style={{ backgroundColor: spool.colorHex }}
                        />
                        <button
                          type="button"
                          onClick={() => setEditingSpool(spool)}
                          className="font-semibold text-slate-900 dark:text-slate-100 hover:text-amber-600 text-left"
                        >
                          {spool.brand} — {spool.name}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-300">
                      {spool.material}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-500">
                      {spool.stage} {spool.assignedPrinter ? `· ${spool.assignedPrinter}` : ''}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-xs font-semibold">
                      {spool.remainingWeightGrams}g / {spool.initialWeightGrams}g
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-xs">
                      {formatRupiah(spool.purchasePriceRp)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-500">
                      {formatRupiah(spool.purchasePriceRp / spool.initialWeightGrams)}/g
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setEditingSpool(spool)}
                        className="px-2 py-1 text-xs font-medium text-amber-600 hover:underline mr-2"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteFilament(spool.id)}
                        aria-label={`Delete ${spool.name}`}
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filament Edit Modal */}
      {editingSpool && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="spool-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2
                id="spool-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100"
              >
                {editingSpool.brand} — {editingSpool.name}
              </h2>
              <button
                type="button"
                onClick={() => setEditingSpool(null)}
                aria-label="Close spool modal"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSpoolSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Brand *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingSpool.brand}
                    onChange={(e) =>
                      setEditingSpool({ ...editingSpool, brand: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Material
                  </label>
                  <select
                    value={editingSpool.material}
                    onChange={(e) =>
                      setEditingSpool({
                        ...editingSpool,
                        material: e.target.value as FilamentSpool['material'],
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="PLA+">PLA+</option>
                    <option value="Silk PLA">Silk PLA</option>
                    <option value="PETG">PETG</option>
                    <option value="ASA">ASA</option>
                    <option value="TPU 95A">TPU 95A</option>
                    <option value="CF-PETG">CF-PETG</option>
                    <option value="ABS">ABS</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Spool / Color Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingSpool.name}
                    onChange={(e) =>
                      setEditingSpool({
                        ...editingSpool,
                        name: e.target.value,
                        colorName: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Swatch Hex
                  </label>
                  <input
                    type="color"
                    value={editingSpool.colorHex}
                    onChange={(e) =>
                      setEditingSpool({ ...editingSpool, colorHex: e.target.value })
                    }
                    className="w-full h-8 rounded cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Remaining (g)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editingSpool.remainingWeightGrams}
                    onChange={(e) =>
                      setEditingSpool({
                        ...editingSpool,
                        remainingWeightGrams: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Spool Size (g)
                  </label>
                  <input
                    type="number"
                    min={100}
                    value={editingSpool.initialWeightGrams}
                    onChange={(e) =>
                      setEditingSpool({
                        ...editingSpool,
                        initialWeightGrams: Number(e.target.value) || 1000,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Price (Rp)
                  </label>
                  <input
                    type="number"
                    step={5000}
                    value={editingSpool.purchasePriceRp}
                    onChange={(e) =>
                      setEditingSpool({
                        ...editingSpool,
                        purchasePriceRp: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Loaded in Printer / AMS
                  </label>
                  <input
                    type="text"
                    value={editingSpool.assignedPrinter || ''}
                    onChange={(e) =>
                      setEditingSpool({ ...editingSpool, assignedPrinter: e.target.value })
                    }
                    placeholder="e.g., Bambu P1S #1 (AMS 1)"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Humidity / Dry Status
                  </label>
                  <select
                    value={editingSpool.dryStatus}
                    onChange={(e) =>
                      setEditingSpool({
                        ...editingSpool,
                        dryStatus: e.target.value as FilamentSpool['dryStatus'],
                      })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="Dry (15% RH)">Dry (15% RH)</option>
                    <option value="In Dryer">In Dryer</option>
                    <option value="Needs Drying">Needs Drying</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={recordPurchaseExpense}
                  onChange={(e) => setRecordPurchaseExpense(e.target.checked)}
                />
                <span>
                  Also record {formatRupiah(editingSpool.purchasePriceRp)} filament purchase in Business Expense Ledger
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingSpool(null)}
                  className="px-4 py-1.5 text-xs font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg"
                >
                  Save Spool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
