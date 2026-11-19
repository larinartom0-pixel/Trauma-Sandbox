import React, { useState } from 'react';
import {
  Backpack,
  HeartPulse,
  PackageOpen,
  Trash2,
  X,
  ArrowRightLeft,
  Hand,
} from 'lucide-react';
import { BACKPACK_TIERS } from '../game/data';
import { canPlaceAt } from '../game/inventory';
import {
  GridContainer,
  GridInventoryItem,
  InventoryState,
  LootBundle,
  WeaponId,
} from '../game/types';
import { MedItemIcon } from './MedItemIcon';

interface LootModalProps {
  mode: 'inventory' | 'loot';
  inventory: InventoryState;
  activeWeapon: WeaponId;
  bundle?: LootBundle | null;
  onMoveBackpackItem: (uid: string, x: number, y: number) => boolean;
  onDropBackpackItem: (uid: string) => void;
  onUseBackpackItem: (uid: string) => void;
  onEquipBackpackItem: (uid: string, source: 'backpack' | 'loot') => boolean;
  onTransferLootItem: (uid: string, targetX?: number, targetY?: number) => boolean;
  onTakeAll: () => void;
  onOpenMedical: () => void;
  onClose: () => void;
}

const CELL_PX = 48;

export const LootModal: React.FC<LootModalProps> = ({
  mode,
  inventory,
  activeWeapon,
  bundle,
  onMoveBackpackItem,
  onDropBackpackItem,
  onUseBackpackItem,
  onEquipBackpackItem,
  onTransferLootItem,
  onTakeAll,
  onOpenMedical,
  onClose,
}) => {
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<'backpack' | 'loot' | null>(null);
  const [draggedUid, setDraggedUid] = useState<string | null>(null);
  const [draggedSource, setDraggedSource] = useState<'backpack' | 'loot' | null>(null);

  const selectedItem: GridInventoryItem | null =
    selectedSource === 'backpack'
      ? inventory.backpack.items.find((i) => i.uid === selectedUid) ?? null
      : selectedSource === 'loot' && bundle
        ? bundle.grid.items.find((i) => i.uid === selectedUid) ?? null
        : null;

  const weightPct = Math.min(
    100,
    Math.round((inventory.totalWeightKg / Math.max(1, inventory.maxWeightKg)) * 100),
  );
  const overweight = inventory.totalWeightKg > inventory.maxWeightKg;

  const handleBackpackCellClick = (x: number, y: number) => {
    if (!selectedUid) return;
    if (selectedSource === 'backpack') {
      if (onMoveBackpackItem(selectedUid, x, y)) {
        setSelectedUid(null);
        setSelectedSource(null);
      }
    } else if (selectedSource === 'loot') {
      if (onTransferLootItem(selectedUid, x, y)) {
        setSelectedUid(null);
        setSelectedSource(null);
      }
    }
  };

  const renderGrid = (
    grid: GridContainer,
    source: 'backpack' | 'loot',
    titleUk: string,
    titleEn: string,
  ) => {
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        cells.push({ x, y });
      }
    }

    const activeMovingItem =
      draggedUid && draggedSource === 'backpack'
        ? inventory.backpack.items.find((i) => i.uid === draggedUid)
        : draggedUid && draggedSource === 'loot' && bundle
          ? bundle.grid.items.find((i) => i.uid === draggedUid)
          : selectedItem;

    return (
      <div className="bg-[#0b0f16] border border-white/15 rounded p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wide">
              {titleUk}
            </div>
            <div className="text-[11px] text-slate-400">{titleEn}</div>
          </div>
          {source === 'backpack' && (
            <div className="text-right font-mono-num">
              <div
                className={`text-xs font-bold ${
                  overweight ? 'text-red-400' : 'text-sky-300'
                }`}
              >
                {inventory.totalWeightKg.toFixed(1)} / {inventory.maxWeightKg} kg
              </div>
              <div className="w-24 h-1.5 bg-white/10 rounded overflow-hidden mt-0.5">
                <div
                  className={`h-full ${
                    overweight
                      ? 'bg-red-500'
                      : weightPct > 78
                        ? 'bg-amber-400'
                        : 'bg-sky-400'
                  }`}
                  style={{ width: `${weightPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Grid Container */}
        <div
          className="relative mx-auto select-none border border-[#2d3644] bg-[#070a0e]"
          style={{
            width: grid.cols * CELL_PX,
            height: grid.rows * CELL_PX,
          }}
        >
          {/* Background Grid Cells */}
          {cells.map(({ x, y }) => {
            const canPreview =
              source === 'backpack' &&
              activeMovingItem &&
              canPlaceAt(
                grid,
                x,
                y,
                activeMovingItem.w,
                activeMovingItem.h,
                selectedSource === 'backpack' || draggedSource === 'backpack'
                  ? activeMovingItem.uid
                  : undefined,
              );
            return (
              <div
                key={`${x}_${y}`}
                onClick={() => source === 'backpack' && handleBackpackCellClick(x, y)}
                onDragOver={(e) => {
                  if (source === 'backpack') e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (source !== 'backpack' || !draggedUid) return;
                  if (draggedSource === 'backpack') {
                    onMoveBackpackItem(draggedUid, x, y);
                  } else if (draggedSource === 'loot') {
                    onTransferLootItem(draggedUid, x, y);
                  }
                  setDraggedUid(null);
                  setDraggedSource(null);
                  setSelectedUid(null);
                  setSelectedSource(null);
                }}
                style={{
                  left: x * CELL_PX,
                  top: y * CELL_PX,
                  width: CELL_PX,
                  height: CELL_PX,
                }}
                className={`absolute border border-[#1d2430] ${
                  canPreview ? 'hover:bg-emerald-500/20 cursor-pointer' : ''
                }`}
              />
            );
          })}

          {/* Placed Items */}
          {grid.items.map((item) => {
            const isSelected = selectedUid === item.uid && selectedSource === source;
            const isEquipped =
              source === 'backpack' &&
              item.category === 'weapon' &&
              item.weaponId === activeWeapon;

            return (
              <div
                key={item.uid}
                draggable
                onDragStart={() => {
                  setDraggedUid(item.uid);
                  setDraggedSource(source);
                  setSelectedUid(item.uid);
                  setSelectedSource(source);
                }}
                onDragEnd={() => {
                  setDraggedUid(null);
                  setDraggedSource(null);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (source === 'loot') {
                    // Single click or double click: select first, or quick-transfer if already selected
                    if (isSelected) {
                      onTransferLootItem(item.uid);
                      setSelectedUid(null);
                      setSelectedSource(null);
                    } else {
                      setSelectedUid(item.uid);
                      setSelectedSource('loot');
                    }
                  } else {
                    if (isSelected) {
                      setSelectedUid(null);
                      setSelectedSource(null);
                    } else {
                      setSelectedUid(item.uid);
                      setSelectedSource('backpack');
                    }
                  }
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (item.category === 'backpack') {
                    onEquipBackpackItem(item.uid, source);
                    setSelectedUid(null);
                    setSelectedSource(null);
                  } else if (source === 'loot') {
                    onTransferLootItem(item.uid);
                  } else {
                    onUseBackpackItem(item.uid);
                  }
                }}
                style={{
                  left: item.x * CELL_PX + 2,
                  top: item.y * CELL_PX + 2,
                  width: item.w * CELL_PX - 4,
                  height: item.h * CELL_PX - 4,
                  borderColor: isSelected
                    ? '#ffffff'
                    : isEquipped
                      ? '#ef4444'
                      : item.accentColor,
                }}
                className={`absolute rounded-sm border bg-[#141b25]/96 p-1 flex flex-col justify-between cursor-pointer overflow-hidden shadow ${
                  isSelected ? 'ring-2 ring-white z-10' : ''
                }`}
                title={`${item.nameUk} (${item.weightKg.toFixed(2)} kg)`}
              >
                {item.medId && (
                  <MedItemIcon
                    medId={item.medId}
                    className="absolute inset-0 m-auto w-7 h-7 opacity-85 pointer-events-none"
                  />
                )}
                {item.category === 'backpack' && (
                  <Backpack
                    className="absolute inset-0 m-auto w-8 h-8 opacity-85 pointer-events-none"
                    style={{ color: item.accentColor }}
                  />
                )}
                <div className="relative z-10 flex items-start justify-between gap-1 leading-none">
                  <span
                    className="text-[9px] font-bold text-white truncate drop-shadow"
                    style={{ color: item.accentColor }}
                  >
                    {item.nameUk}
                  </span>
                </div>

                <div className="relative z-10 flex items-end justify-between text-[9px] font-mono-num leading-none">
                  <span className="text-slate-300 bg-[#0b0f16]/80 px-0.5 rounded">
                    {item.weightKg.toFixed(1)}kg
                  </span>
                  <span className="font-bold text-slate-100 bg-[#0b0f16]/80 px-0.5 rounded">
                    {item.medId === 'bandage'
                      ? `${Math.round(item.conditionPct)}%`
                      : item.backpackTier
                        ? `${BACKPACK_TIERS[item.backpackTier].cols}×${BACKPACK_TIERS[item.backpackTier].rows}`
                        : item.quantity > 1
                          ? `x${item.quantity}`
                          : isEquipped
                            ? 'EQP'
                            : ''}
                  </span>
                </div>
              </div>
            );
          })}

          {grid.items.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 pointer-events-none">
              Порожньо / Empty
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4 bg-[#070a0f]/82 pointer-events-auto overflow-y-auto">
      <div className="w-full max-w-4xl rounded-lg bg-[#0f151e] border border-white/15 shadow-2xl overflow-hidden my-auto">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-white/10 bg-[#0a0e14]">
          <div className="flex items-center gap-2.5">
            {mode === 'loot' ? (
              <PackageOpen className="w-5 h-5 text-amber-400" />
            ) : (
              <Backpack className="w-5 h-5 text-sky-400" />
            )}
            <div>
              <h3 className="font-display text-sm font-bold text-white">
                {mode === 'loot' && bundle
                  ? bundle.labelUk
                  : 'Рюкзак і Спорядження · Tactical Grid Inventory'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Перетягуйте предмети в ячейки · Подвійний клік — взяти або екіпірувати
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenMedical}
              className="min-h-[40px] px-3 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <HeartPulse className="w-4 h-4" />
              <span>Здоров’я (Tab)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Закрити</span>
            </button>
          </div>
        </div>

        {/* Grids Area */}
        <div
          className={`p-3 sm:p-4 grid gap-4 ${
            mode === 'loot' && bundle ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {mode === 'loot' &&
            bundle &&
            renderGrid(bundle.grid, 'loot', bundle.labelUk, bundle.labelEn)}

          {renderGrid(
            inventory.backpack,
            'backpack',
            `${BACKPACK_TIERS[inventory.backpackTier].nameUk} (${inventory.backpack.cols}×${inventory.backpack.rows})`,
            overweight
              ? 'ПЕРЕВАНТАЖЕННЯ! Рух сповільнено'
              : 'Натисніть предмет -> клікніть вільну клітинку для переміщення',
          )}
        </div>

        {/* Selected Item Inspector & Footer Actions */}
        <div className="px-4 py-3 border-t border-white/10 bg-[#0a0e14] flex flex-wrap items-center justify-between gap-2">
          {selectedItem ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-white">{selectedItem.nameUk}</span>
              <span className="font-mono-num text-slate-400">
                ({selectedItem.w}×{selectedItem.h} · {selectedItem.weightKg.toFixed(2)}kg
                {selectedItem.medId === 'bandage'
                  ? ` · ${Math.round(selectedItem.conditionPct)}%`
                  : selectedItem.backpackTier
                    ? ` · ${BACKPACK_TIERS[selectedItem.backpackTier].cols}×${BACKPACK_TIERS[selectedItem.backpackTier].rows} / ${BACKPACK_TIERS[selectedItem.backpackTier].maxWeightKg}kg`
                    : selectedItem.quantity > 1
                      ? ` · x${selectedItem.quantity}`
                      : ''}
                )
              </span>

              {selectedItem.category === 'backpack' && selectedSource && (
                <button
                  type="button"
                  onClick={() => {
                    if (onEquipBackpackItem(selectedItem.uid, selectedSource)) {
                      setSelectedUid(null);
                      setSelectedSource(null);
                    }
                  }}
                  className="min-h-[36px] px-3 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Backpack className="w-3.5 h-3.5" />
                  <span>Екіпірувати рюкзак</span>
                </button>
              )}

              {selectedSource === 'loot' ? (
                <button
                  type="button"
                  onClick={() => {
                    onTransferLootItem(selectedItem.uid);
                    setSelectedUid(null);
                    setSelectedSource(null);
                  }}
                  className="min-h-[36px] px-3 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>В рюкзак</span>
                </button>
              ) : (
                <>
                  {(selectedItem.category === 'weapon' ||
                    selectedItem.category === 'med') && (
                    <button
                      type="button"
                      onClick={() => onUseBackpackItem(selectedItem.uid)}
                      className="min-h-[36px] px-3 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Hand className="w-3.5 h-3.5" />
                      <span>
                        {selectedItem.category === 'weapon'
                          ? 'Взяти в руки'
                          : 'Відкрити медицину'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onDropBackpackItem(selectedItem.uid);
                      setSelectedUid(null);
                      setSelectedSource(null);
                    }}
                    className="min-h-[36px] px-3 rounded bg-red-900/80 hover:bg-red-800 border border-red-500/40 text-red-100 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Викинути</span>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400">
              {mode === 'loot'
                ? 'Клікніть двічі по предмету в контейнері, щоб забрати його у рюкзак'
                : 'Оберіть предмет у рюкзаку, щоб переставити, екіпірувати або викинути'}
            </div>
          )}

          {mode === 'loot' && bundle && bundle.grid.items.length > 0 && (
            <button
              type="button"
              onClick={onTakeAll}
              className="min-h-[42px] px-4 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
            >
              Забрати все / Take All
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
