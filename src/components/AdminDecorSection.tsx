import React, { useState, useMemo } from 'react';
import { 
  DecorItem, 
  DecorCategoryDef, 
  Config,
  ImageItem,
  DecorArrangement,
  DecorPackage,
  LayoutCategory
} from '../types';
import { defaultDecorPackages } from '../data/venueData';
import EmojiPicker from './EmojiPicker';
import MultiImageUpload from './MultiImageUpload';
import { DrawingTool } from './DrawingTool';
import type { AdminDialogOptions } from './admin/AdminTabTypes';
import { createEntityId } from '../utils/entityId';
import { catalogFamilyStatus } from '../utils/catalogFamily';
import { CatalogRevisionStatus, HistoricalRevisionNotice } from './admin/CatalogRevisionStatus';

interface BrandedSectionHeaderProps {
  icon: string;
  title: string;
  description?: string;
  config: Config;
  variant?: 'primary' | 'secondary' | 'accent';
}

function BrandedSectionHeader({ icon, title, description, config, variant = 'primary' }: BrandedSectionHeaderProps) {
  const bgColor = variant === 'primary' ? config.primaryColor : 
                  variant === 'secondary' ? config.primaryDark : config.accentColor;
  
  return (
    <div 
      className="p-4 rounded-t-xl"
      style={{ 
        background: `linear-gradient(135deg, ${bgColor} 0%, ${config.primaryDark} 100%)`,
        fontFamily: config.headingFontFamily 
      }}
    >
      <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: config.headerTextColor }}>
        <span className="text-xl">{icon}</span>
        {title}
      </h3>
      {description && (
        <p className="text-sm mt-1 opacity-90" style={{ color: config.headerTextColor }}>
          {description}
        </p>
      )}
    </div>
  );
}

interface BrandedStatCardProps {
  icon: string;
  label: string;
  value: string | number;
  config: Config;
  variant?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning';
}

function BrandedStatCard({ icon, label, value, config, variant = 'primary' }: BrandedStatCardProps) {
  const bgColor = variant === 'primary' ? `${config.primaryColor}15` :
                  variant === 'secondary' ? `${config.primaryDark}15` :
                  variant === 'accent' ? `${config.accentColor}15` :
                  variant === 'success' ? '#10b98115' :
                  '#f59e0b15';
  
  const textColor = variant === 'primary' ? config.primaryColor :
                    variant === 'secondary' ? config.primaryDark :
                    variant === 'accent' ? config.accentColor :
                    variant === 'success' ? '#059669' :
                    '#d97706';
  
  return (
    <div 
      className="p-3 rounded-xl text-center border"
      style={{ 
        backgroundColor: bgColor,
        borderColor: `${textColor}30`
      }}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl font-bold" style={{ color: textColor }}>{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}

interface BrandedTipsProps {
  title: string;
  tips: { icon?: string; title: string; description: string }[];
  config: Config;
  defaultOpen?: boolean;
}

function BrandedTips({ title, tips, config, defaultOpen = false }: BrandedTipsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div 
      className="rounded-xl border overflow-hidden transition-all duration-300"
      style={{ 
        backgroundColor: `${config.primaryColor}08`,
        borderColor: `${config.primaryColor}30`
      }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity"
        style={{ backgroundColor: `${config.primaryColor}15` }}
      >
        <h4 
          className="font-semibold flex items-center gap-2"
          style={{ color: config.primaryColor }}
        >
          <span>💡</span>
          <span>{title}</span>
        </h4>
        <span 
          className="transition-transform duration-300"
          style={{ 
            color: config.primaryColor,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
          }}
        >
          ▼
        </span>
      </button>
      
      {isOpen && (
        <div className="p-4 space-y-3">
          {tips.map((tip, index) => (
            <div 
              key={index}
              className="flex items-start gap-3 p-3 rounded-lg bg-white/50 border"
              style={{ borderColor: `${config.primaryColor}20` }}
            >
              <span className="text-lg flex-shrink-0">{tip.icon || '💡'}</span>
              <div className="min-w-0">
                <h5 
                  className="font-semibold text-sm"
                  style={{ color: config.primaryColor }}
                >
                  {tip.title}
                </h5>
                <p className="text-xs text-gray-600 mt-0.5">
                  {tip.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface AdminDecorSectionProps {
  config: Config;
  decorItems: DecorItem[];
  setDecorItems: (items: DecorItem[]) => void;
  decorCategories: DecorCategoryDef[];
  setDecorCategories: (categories: DecorCategoryDef[]) => void;
  decorArrangements: DecorArrangement[];
  setDecorArrangements: (arrs: DecorArrangement[]) => void;
  decorPackages: DecorPackage[];
  setDecorPackages: (pkgs: DecorPackage[]) => void;
  onShowSuccess: (msg: string) => void;
  confirmAction?: (options: AdminDialogOptions, onConfirm: () => void | Promise<void>) => void;
}

export const AdminDecorSection: React.FC<AdminDecorSectionProps> = ({
  config,
  decorItems,
  setDecorItems,
  decorCategories,
  setDecorCategories,
  decorArrangements,
  setDecorArrangements,
  decorPackages,
  setDecorPackages,
  onShowSuccess,
  confirmAction
}) => {
  // Use these props to avoid lint errors if they are not used elsewhere
  void decorArrangements;
  void setDecorArrangements;
  void setDecorPackages;

  const [activeTab, setActiveTab] = useState<'catalog' | 'categories' | 'packages'>('catalog');
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | 'all'>('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showDrawingTool, setShowDrawingTool] = useState(false);
  const [activeCustomItemId, setActiveCustomItemId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return decorItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategoryId === 'all' || item.categoryId === selectedCategoryId;
      return matchesSearch && matchesCategory;
    });
  }, [decorItems, search, selectedCategoryId]);

  // Use the arrangements state to support stats and re-saves
  const arrangementCount = useMemo(() => decorArrangements.length, [decorArrangements]);

  const stats = {
    totalItems: decorItems.length,
    totalCategories: decorCategories.length,
    totalPackages: decorPackages.length,
    totalStock: decorItems.reduce((acc, item) => acc + (item.inventoryCount || 0), 0),
    totalArrangements: arrangementCount
  };

  // --- Handlers ---
  const handleAddDecorItem = () => {
    const newItem: DecorItem = {
      id: createEntityId('decor', decorItems.map((item) => item.id)),
      name: 'New Decor Item',
      categoryId: decorCategories[0]?.id || 'uncategorized',
      width: 1,
      height: 1,
      widthInches: 0,
      heightInches: 0,
      isTemplate: false,
      createdAt: new Date().toISOString(),
      color: config.primaryColor,
      icon: '🎀',
      inventoryCount: 10
    };
    setDecorItems([...decorItems, newItem]);
    setExpandedItems(new Set([newItem.id]));
  };

  const handleUpdateDecorItem = (id: string, updates: Partial<DecorItem>) => {
    setDecorItems(decorItems.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleDeleteDecorItem = (id: string) => {
    confirmAction?.(
      { title: 'Delete decor item?', message: 'Delete this decor item?', kind: 'danger', confirmLabel: 'Delete Item' },
      () => {
        setDecorItems(decorItems.filter(i => i.id !== id));
      },
    );
  };

  const handleLoadDefaultCategories = () => {
    confirmAction?.(
      { title: 'Reset decor categories?', message: 'Reset categories to standard wedding set? This will not delete your items.', kind: 'warning', confirmLabel: 'Reset Categories' },
      () => {
      // Ensure we maintain the exact order and properties required by the prompt
      const standardCategories: DecorCategoryDef[] = [
        { id: 'florals', name: 'Florals', icon: '🌸', color: '#ec4899', description: 'Flower arrangements and floral accents' },
        { id: 'vases', name: 'Vases', icon: '🏺', color: '#0ea5e9', description: 'Vases and containers' },
        { id: 'candles', name: 'Candles', icon: '🕯️', color: '#f59e0b', description: 'Taper, pillar, and votive candles' },
        { id: 'centerpieces', name: 'Centerpieces', icon: '💐', color: '#8b5cf6', description: 'Table centerpieces and focal points' },
        { id: 'table-numbers', name: 'Table Numbers', icon: '🔢', color: '#64748b', description: 'Numerical indicators for tables' },
        { id: 'signage', name: 'Signage', icon: '🪧', color: '#475569', description: 'Informational and decorative signs' },
        { id: 'lighting', name: 'Lighting', icon: '💡', color: '#eab308', description: 'Decorative and ambient lighting' },
        { id: 'backdrop', name: 'Backdrop', icon: '🖼️', color: '#d946ef', description: 'Background displays and photo walls' },
        { id: 'arch', name: 'Arch', icon: '⛩️', color: '#10b981', description: 'Ceremony arches and arbors' },
        { id: 'aisle', name: 'Aisle', icon: '🚶', color: '#f43f5e', description: 'Aisle runners and floor decor' },
        { id: 'custom', name: 'Custom', icon: '✨', color: '#6366f1', description: 'Bespoke decorative elements' }
      ];
      setDecorCategories(standardCategories);
      onShowSuccess('Standard categories loaded');
      },
    );
  };

  const handleAddCategory = () => {
    const newCat: DecorCategoryDef = {
      id: createEntityId('decor-category', decorCategories.map((item) => item.id)),
      name: 'New Category',
      color: config.primaryColor,
      icon: '📁',
      description: ''
    };
    setDecorCategories([...decorCategories, newCat]);
  };

  const handleUpdateCategory = (id: string, updates: Partial<DecorCategoryDef>) => {
    setDecorCategories(decorCategories.map(cat => cat.id === id ? { ...cat, ...updates } : cat));
  };

  const handleDeleteCategory = (id: string) => {
    confirmAction?.(
      { title: 'Delete decor category?', message: 'Delete this category? Items in this category will be moved to uncategorized.', kind: 'danger', confirmLabel: 'Delete Category' },
      () => {
        setDecorCategories(decorCategories.filter(c => c.id !== id));
        setDecorItems(decorItems.map(i => i.categoryId === id ? { ...i, categoryId: 'uncategorized' } : i));
        onShowSuccess('Category deleted');
      },
    );
  };

  const toggleItem = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedItems(next);
  };

  return (
    <div className="space-y-4">
      <BrandedSectionHeader 
        icon="🎀" 
        title="Decor & Design Management" 
        description="Configure your decor catalog, custom categories, and design packages."
        config={config}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <BrandedStatCard icon="🎀" label="Catalog Items" value={stats.totalItems} config={config} />
        <BrandedStatCard icon="📁" label="Categories" value={stats.totalCategories} config={config} variant="accent" />
        <BrandedStatCard icon="📦" label="Total Stock" value={stats.totalStock} config={config} variant="success" />
        <BrandedStatCard icon="✨" label="Design Packages" value={stats.totalPackages} config={config} variant="secondary" />
      </div>

      {/* Compact 1-Row Quick Add Decor Presets */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-gray-500">⚡ Quick Presets:</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const presets = [
                { id: createEntityId('decor', decorItems.map((item) => item.id)), name: 'Ceremony Arch / Arbor', categoryId: 'ceremony-florals', width: 6, height: 2, widthInches: 0, heightInches: 0, icon: '🌸', inventoryCount: 2, defaultColor: '#FFFFFF', createdAt: new Date().toISOString() },
                { id: createEntityId('decor', decorItems.map((item) => item.id)), name: 'Aisle Floral Marker', categoryId: 'ceremony-florals', width: 1, height: 1, widthInches: 0, heightInches: 0, icon: '🌷', inventoryCount: 16, defaultColor: '#FFFFFF', createdAt: new Date().toISOString() },
              ];
              setDecorItems([...decorItems, ...presets]);
              onShowSuccess('Added Ceremony Florals presets!');
            }}
            className="px-2.5 py-1 bg-pink-50 border border-pink-200 text-pink-700 rounded-md text-xs font-medium hover:bg-pink-100 transition-colors"
          >
            + 🌸 Ceremony Florals
          </button>
          <button
            type="button"
            onClick={() => {
              const presets = [
                { id: createEntityId('decor', decorItems.map((item) => item.id)), name: 'Pillar Candle Trio', categoryId: 'table-centerpieces', width: 1, height: 1, widthInches: 0, heightInches: 0, icon: '🕯️', inventoryCount: 40, defaultColor: '#FFF8DC', createdAt: new Date().toISOString() },
                { id: createEntityId('decor', decorItems.map((item) => item.id)), name: 'Eucalyptus Table Garland', categoryId: 'table-centerpieces', width: 6, height: 1, widthInches: 0, heightInches: 0, icon: '🌿', inventoryCount: 25, defaultColor: '#2E8B57', createdAt: new Date().toISOString() },
              ];
              setDecorItems([...decorItems, ...presets]);
              onShowSuccess('Added Table Centerpieces presets!');
            }}
            className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-xs font-medium hover:bg-amber-100 transition-colors"
          >
            + 🕯️ Centerpieces
          </button>
          <button
            type="button"
            onClick={() => {
              const presets = [
                { id: createEntityId('decor', decorItems.map((item) => item.id)), name: 'Crystal Chandelier', categoryId: 'lighting-drapery', width: 3, height: 3, widthInches: 0, heightInches: 0, icon: '✨', inventoryCount: 4, defaultColor: '#FFD700', createdAt: new Date().toISOString() },
                { id: createEntityId('decor', decorItems.map((item) => item.id)), name: 'Ceiling Drapery Swag (20ft)', categoryId: 'lighting-drapery', width: 20, height: 2, widthInches: 0, heightInches: 0, icon: '🎀', inventoryCount: 8, defaultColor: '#FFFFFF', createdAt: new Date().toISOString() },
              ];
              setDecorItems([...decorItems, ...presets]);
              onShowSuccess('Added Lighting & Drapery presets!');
            }}
            className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-md text-xs font-medium hover:bg-blue-100 transition-colors"
          >
            + ✨ Lighting &amp; Drapery
          </button>
          <button
            type="button"
            onClick={() => {
              const presets = [
                { id: createEntityId('decor', decorItems.map((item) => item.id)), name: 'Welcome Mirror Sign', categoryId: 'signage-accents', width: 2.5, height: 1, widthInches: 0, heightInches: 0, icon: '🪞', inventoryCount: 2, defaultColor: '#C0C0C0', createdAt: new Date().toISOString() },
                { id: createEntityId('decor', decorItems.map((item) => item.id)), name: 'Lounge Sofa Seating Group', categoryId: 'signage-accents', width: 7, height: 4, widthInches: 0, heightInches: 0, icon: '🛋️', inventoryCount: 3, defaultColor: '#F5F5DC', createdAt: new Date().toISOString() },
              ];
              setDecorItems([...decorItems, ...presets]);
              onShowSuccess('Added Lounge & Bar Decor presets!');
            }}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors border"
            style={{
              backgroundColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 30%, transparent)`,
              color: config.primaryColor || '#4A1942',
            }}
          >
            + 🥂 Lounge &amp; Signage
          </button>
        </div>
      </div>

      {/* Pill Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeTab === 'catalog'
              ? 'btn-primary text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
          style={activeTab === 'catalog' ? { backgroundColor: config.primaryColor || '#4A1942' } : undefined}
        >
          🗂️ Catalog Items
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeTab === 'categories'
              ? 'btn-primary text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
          style={activeTab === 'categories' ? { backgroundColor: config.primaryColor || '#4A1942' } : undefined}
        >
          📁 Categories
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('packages')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'packages'
              ? 'btn-primary text-white shadow-sm'
              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
          style={activeTab === 'packages' ? { backgroundColor: config.primaryColor || '#4A1942' } : undefined}
        >
          🎁 Packages &amp; Styles
        </button>
      </div>

      {activeTab === 'categories' && (
        <div className="px-1 py-1 flex justify-start">
          <button 
            onClick={handleLoadDefaultCategories}
            className="text-xs font-bold hover:underline flex items-center gap-1"
            style={{ color: config.primaryColor || '#4A1942' }}
          >
            ✨ Load Wedding Standard Categories
          </button>
        </div>
      )}

      {/* Tab Content */}
      <div className="space-y-4">
        {activeTab === 'catalog' && (
          <div className="space-y-4">
            {/* Integrated Decor Search & Action Bar */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-400 text-xs">🔍</span>
                  <input
                    type="search"
                    placeholder="Search catalog..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-48 pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2"
                    aria-label="Search decor items"
                  />
                </div>
                <select 
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2"
                  aria-label="Filter by category"
                >
                  <option value="all">All Categories</option>
                  {decorCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <span className="text-gray-300">|</span>
                <span className="text-xs text-gray-600 font-medium">{filteredItems.length} Decor items</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleAddDecorItem}
                  className="px-3 py-1.5 text-white font-semibold rounded-lg hover:opacity-90 transition-all shadow-sm flex items-center gap-1"
                  style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                >
                  <span>+</span>
                  <span>Add Decor Item</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {filteredItems.map(item => (
                <div key={item.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div 
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleItem(item.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden border">
                        {item.images && item.images.length > 0 ? (
                          <img src={item.images[0].url} alt={item.name} className="w-full h-full object-cover" />
                        ) : item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl">{item.icon || '🎀'}</span>
                        )}
                      </div>
                      <div>
                        <h4 className="flex items-center gap-2 font-semibold text-gray-900">
                          <span>{item.name}</span>
                          {item.archived && (
                            <span className="rounded-full bg-gray-700 px-2 py-0.5 text-[10px] text-white">Archived</span>
                          )}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {decorCategories.find(c => c.id === item.categoryId)?.name || 'Uncategorized'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {item.width}'{item.widthInches}" × {item.height}'{item.heightInches}"
                          </span>
                        </div>
                        <CatalogRevisionStatus definition={item} definitions={decorItems} compact />
                        <HistoricalRevisionNotice definition={item} definitions={decorItems} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right mr-4 hidden sm:block">
                        <p className="text-xs text-gray-500">Stock</p>
                        <p className={`text-sm font-bold ${item.inventoryCount && item.inventoryCount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {item.inventoryCount || 0}
                        </p>
                      </div>
                      {item.archived && !catalogFamilyStatus(decorItems, item).hasActiveSibling && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDecorItems(decorItems.map((candidate) => candidate.id === item.id
                              ? { ...candidate, archived: false }
                              : candidate));
                          }}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                        >
                          Restore
                        </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteDecorItem(item.id); }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        🗑️
                      </button>
                      <span className={`text-gray-400 transition-transform ${expandedItems.has(item.id) ? 'rotate-180' : ''}`}>▼</span>
                    </div>
                  </div>

                  {expandedItems.has(item.id) && (
                    <div className="p-4 border-t border-gray-100 bg-gray-50/50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Item Name</label>
                          <input 
                            type="text"
                            value={item.name}
                            onChange={(e) => handleUpdateDecorItem(item.id, { name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Category</label>
                          <select 
                            value={item.categoryId}
                            onChange={(e) => handleUpdateDecorItem(item.id, { categoryId: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                          >
                            <option value="uncategorized">Uncategorized</option>
                            {decorCategories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Dimensions (ft/in)</label>
                            <div className="flex items-center gap-1">
                              <input 
                                type="number"
                                value={item.width}
                                onChange={(e) => handleUpdateDecorItem(item.id, { width: parseInt(e.target.value) || 0 })}
                                className="w-16 px-2 py-2 border border-gray-300 rounded-lg outline-none"
                              />
                              <span className="text-xs text-gray-400">'</span>
                              <input 
                                type="number"
                                value={item.widthInches}
                                onChange={(e) => handleUpdateDecorItem(item.id, { widthInches: parseInt(e.target.value) || 0 })}
                                className="w-16 px-2 py-2 border border-gray-300 rounded-lg outline-none"
                              />
                              <span className="text-xs text-gray-400">"</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Stock Quantity</label>
                            <input 
                              type="number"
                              value={item.inventoryCount}
                              onChange={(e) => handleUpdateDecorItem(item.id, { inventoryCount: parseInt(e.target.value) || 0 })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Icon / Emoji</label>
                          <EmojiPicker 
                            value={item.icon || '🎀'} 
                            onChange={(icon) => handleUpdateDecorItem(item.id, { icon })} 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Primary Color</label>
                          <div className="flex gap-2">
                            <input 
                              type="color"
                              value={item.color || '#4A1942'}
                              onChange={(e) => handleUpdateDecorItem(item.id, { color: e.target.value })}
                              className="w-12 h-10 border border-gray-300 rounded-lg cursor-pointer"
                            />
                            <input 
                              type="text"
                              value={item.color || '#4A1942'}
                              onChange={(e) => handleUpdateDecorItem(item.id, { color: e.target.value })}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Custom Drawing</label>
                          <button 
                            onClick={() => { setActiveCustomItemId(item.id); setShowDrawingTool(true); }}
                            className="w-full px-4 py-2 border rounded-lg transition-colors font-medium"
                            style={{
                              borderColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 30%, transparent)`,
                              backgroundColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 8%, transparent)`,
                              color: config.primaryColor || '#4A1942',
                            }}
                          >
                            🎨 Draw Vector Shape
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Product Gallery (Max 4)</label>
                        <MultiImageUpload 
                          images={item.images || []} 
                          onChange={(images) => handleUpdateDecorItem(item.id, { images: images as ImageItem[] })}
                          maxImages={4}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="space-y-6">
            <div className="flex justify-end mb-4">
              <button 
                onClick={handleAddCategory}
                className="px-6 py-2 text-white font-medium rounded-lg hover:opacity-90 transition-all active:scale-95"
                style={{ backgroundColor: config.primaryColor }}
              >
                + Add Category
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {decorCategories.map(cat => (
                <div key={cat.id} className="p-4 border border-gray-200 rounded-xl bg-gray-50 flex items-center gap-4">
                  <div 
                    className="w-12 h-12 flex items-center justify-center rounded-lg text-white text-xl shadow-inner"
                    style={{ backgroundColor: cat.color }}
                  >
                    {cat.icon || '📁'}
                  </div>
                  <div className="flex-1">
                    <input 
                      type="text"
                      value={cat.name}
                      onChange={(e) => handleUpdateCategory(cat.id, { name: e.target.value })}
                      className="w-full bg-transparent font-semibold text-gray-900 border-b border-transparent outline-none focus:border-b-2"
                      style={{ borderColor: undefined }}
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <input 
                        type="color"
                        value={cat.color}
                        onChange={(e) => handleUpdateCategory(cat.id, { color: e.target.value })}
                        className="w-6 h-6 border-none rounded-full cursor-pointer"
                      />
                      <EmojiPicker 
                        value={cat.icon || '📁'}
                        onChange={(icon) => handleUpdateCategory(cat.id, { icon })}
                      />
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'packages' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Design Packages & Styles</h3>
                <p className="text-sm text-gray-500">Group arrangements into cohesive themes for easy client selection.</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setDecorPackages(defaultDecorPackages)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  Reset to Defaults
                </button>
                <button 
                  onClick={() => setDecorPackages([...decorPackages, { id: createEntityId('decor-package', decorPackages.map((item) => item.id)), name: 'New Style Package', style: 'Modern', arrangements: [] }])}
                  className="px-6 py-2 text-white font-medium rounded-lg hover:opacity-90"
                  style={{ backgroundColor: config.primaryColor }}
                >
                  + Create Package
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {decorPackages.map(pkg => (
                <div key={pkg.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50/30">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 mr-4">
                      <input 
                        type="text" 
                        value={pkg.name}
                        onChange={(e) => setDecorPackages(decorPackages.map(p => p.id === pkg.id ? { ...p, name: e.target.value } : p))}
                        className="text-lg font-bold bg-transparent border-b border-transparent outline-none w-full focus:border-b-2"
                      />
                      <select 
                        value={pkg.style}
                        onChange={(e) => setDecorPackages(decorPackages.map(p => p.id === pkg.id ? { ...p, style: e.target.value } : p))}
                        className="mt-1 bg-white border border-gray-200 rounded px-2 py-1 text-xs"
                      >
                        {['Rustic', 'Contemporary', 'Seasonal', 'Modern', 'Gold', 'Silver', 'Premium'].map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <button 
                      onClick={() => setDecorPackages(decorPackages.filter(p => p.id !== pkg.id))}
                      className="text-red-500 hover:bg-red-50 p-2 rounded-lg"
                    >
                      🗑️
                    </button>
                  </div>

                  <div className="bg-white rounded-lg border border-gray-200 p-4 min-h-[100px]">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3 flex items-center gap-2">
                      <span>🖼️ Included Arrangements</span>
                      <span className="bg-gray-100 px-2 py-0.5 rounded-full text-gray-500 font-normal">{pkg.arrangements.length}</span>
                    </h4>
                    {pkg.arrangements.length === 0 ? (
                      <div className="text-center py-4 border-2 border-dashed border-gray-100 rounded-lg">
                        <p className="text-xs text-gray-400">No arrangements added yet.</p>
                        <p className="text-[10px] text-gray-300 mt-1">Users will see this package when designing their layout.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {pkg.arrangements.map((item, idx) => (
                          <div key={idx} className="p-2 border border-gray-200 rounded-lg bg-gray-50/60 flex items-center justify-between">
                            <span className="text-xs truncate">
                              {decorArrangements.find(a => a.id === item.arrangementId)?.name || 'Unknown Design'}
                            </span>
                            <button 
                              onClick={() => {
                                const nextArrs = [...pkg.arrangements];
                                nextArrs.splice(idx, 1);
                                setDecorPackages(decorPackages.map(p => p.id === pkg.id ? { ...p, arrangements: nextArrs } : p));
                              }}
                              className="text-xs text-gray-400 hover:text-red-500 ml-2"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="mt-4 pt-4 border-t border-gray-50">
                      <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2">Add Existing Design</label>
                      <div className="flex gap-2">
                        <select 
                          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2"
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const arrId = e.target.value;
                            if (pkg.arrangements.some(a => a.arrangementId === arrId)) return;
                            
                            const nextArrs = [...pkg.arrangements, { arrangementId: arrId, targetCategory: 'reception' as LayoutCategory }];
                            setDecorPackages(decorPackages.map(p => p.id === pkg.id ? { ...p, arrangements: nextArrs } : p));
                            e.target.value = '';
                          }}
                        >
                          <option value="">Select a design arrangement...</option>
                          {decorArrangements.map(arr => (
                            <option key={arr.id} value={arr.id}>{arr.name} ({arr.baseType})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <BrandedTips 
        title="Decor Strategy" 
        config={config}
        tips={[
          { icon: '📐', title: 'Inch Precision', description: 'Small decor items like candles or floral vases benefit from inch-level sizing for realistic table placement.' },
          { icon: '📁', title: 'Color Coded', description: 'Assign distinct colors to categories to help users distinguish between florals, lighting, and tableware on the canvas.' },
          { icon: '📦', title: 'Active Inventory', description: 'Inventory counts are shared across all venue layouts. Placing an item in the Ceremony Lawn reduces the stock available for the Reception Pavilion.' }
        ]}
      />

      {showDrawingTool && activeCustomItemId && (
        <DrawingTool 
          onSave={({ imageDataUrl, objects, drawingWidth, drawingHeight }) => {
            handleUpdateDecorItem(activeCustomItemId, { 
              imageUrl: imageDataUrl,
              customDrawing: {
                objects,
                drawingWidth,
                drawingHeight
              }
            });
            setShowDrawingTool(false);
          }}
          onClose={() => setShowDrawingTool(false)}
        />
      )}
    </div>
  );
};
