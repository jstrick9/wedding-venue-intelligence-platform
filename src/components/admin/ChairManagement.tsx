import { BrandedSectionHeader, BrandedStatCard, BrandedTips } from './shared/AdminSharedComponents';
import EmojiPicker from '../EmojiPicker';
import MultiImageUpload from '../MultiImageUpload';
import { ChairType, ChairSpec } from '../../types';
import type { AdminCommonProps } from './AdminTabTypes';
import { createEntityId } from '../../utils/entityId';
import { catalogFamilyStatus } from '../../utils/catalogFamily';
import { CatalogRevisionStatus, HistoricalRevisionNotice } from './CatalogRevisionStatus';

export function ChairManagement(props: AdminCommonProps) {
  const {
    config,
    confirmAction,
    chairSpecs,
    setChairSpecs,
    expandedChairs,
    setExpandedChairs,
  } = props;

  return (
    <div className="space-y-4">
      <div className="space-y-6">
              {/* Header */}
              <BrandedSectionHeader 
                icon="🪑" 
                title="Chair Types" 
                description="Manage chair styles for tables, ceremonies, and events"
                config={config}
              />

              {/* Compact 4-Column Chair KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <BrandedStatCard icon="🪑" label="Chair Types" value={chairSpecs.filter(c => c.id !== 'none').length} config={config} variant="primary" />
                <BrandedStatCard icon="📦" label="Total Inventory" value={chairSpecs.filter(c => c.inventoryCount !== undefined && c.inventoryCount > 0).reduce((sum, c) => sum + (c.inventoryCount || 0), 0) || '∞'} config={config} variant="success" />
                <BrandedStatCard icon="📐" label="Avg. Width" value={`${chairSpecs.length > 0 ? (chairSpecs.filter(c => c.id !== 'none').reduce((sum, c) => sum + (c.width || 1.5), 0) / Math.max(1, chairSpecs.filter(c => c.id !== 'none').length)).toFixed(1) : 0}ft`} config={config} variant="accent" />
                <BrandedStatCard icon="🎨" label="Color Styles" value={new Set(chairSpecs.filter(c => c.id !== 'none').map(c => c.color)).size} config={config} variant="warning" />
              </div>

              {/* Compact 1-Row Chair Quick Presets */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-gray-500">⚡ Quick Presets:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const presetChairs = [
                        { name: 'Chiavari Gold', color: '#D4AF37', icon: '✨' },
                        { name: 'Chiavari Silver', color: '#C0C0C0', icon: '🪑' },
                        { name: 'Chiavari White', color: '#FFFFFF', icon: '🪑' }
                      ];
                      const existingNames = chairSpecs.map(c => c.name.toLowerCase());
                      const newChairs = presetChairs
                        .filter(c => !existingNames.includes(c.name.toLowerCase()))
                        .map((c) => ({
                          id: createEntityId('chair', chairSpecs.map((item) => item.id)) as ChairType,
                          name: c.name,
                          color: c.color,
                          width: 1.5,
                          depth: 1.5,
                          icon: c.icon
                        }));
                      if (newChairs.length > 0) {
                        const updated = [...chairSpecs, ...newChairs];
                        setChairSpecs(updated);
                      }
                    }}
                    className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-xs font-medium hover:bg-amber-100 transition-colors"
                  >
                    + 👑 Chiavari Collection
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presetChairs = [
                        { name: 'Ghost Chair', color: '#E8E8E8', icon: '🪑' },
                        { name: 'Acrylic Clear', color: '#F5F5F5', icon: '💎' },
                        { name: 'Lucite White', color: '#FFFFFF', icon: '✨' }
                      ];
                      const existingNames = chairSpecs.map(c => c.name.toLowerCase());
                      const newChairs = presetChairs
                        .filter(c => !existingNames.includes(c.name.toLowerCase()))
                        .map((c) => ({
                          id: createEntityId('chair', chairSpecs.map((item) => item.id)) as ChairType,
                          name: c.name,
                          color: c.color,
                          width: 1.5,
                          depth: 1.5,
                          icon: c.icon
                        }));
                      if (newChairs.length > 0) {
                        const updated = [...chairSpecs, ...newChairs];
                        setChairSpecs(updated);
                      }
                    }}
                    className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-md text-xs font-medium hover:bg-blue-100 transition-colors"
                  >
                    + 🎨 Modern Elegance
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presetChairs = [
                        { name: 'Cross Back Wood', color: '#8B4513', icon: '🪵' },
                        { name: 'Vineyard Oak', color: '#A0522D', icon: '🌳' },
                        { name: 'Farm Bench', color: '#DEB887', icon: '🪵' }
                      ];
                      const existingNames = chairSpecs.map(c => c.name.toLowerCase());
                      const newChairs = presetChairs
                        .filter(c => !existingNames.includes(c.name.toLowerCase()))
                        .map((c) => ({
                          id: createEntityId('chair', chairSpecs.map((item) => item.id)) as ChairType,
                          name: c.name,
                          color: c.color,
                          width: 1.5,
                          depth: 1.5,
                          icon: c.icon
                        }));
                      if (newChairs.length > 0) {
                        const updated = [...chairSpecs, ...newChairs];
                        setChairSpecs(updated);
                      }
                    }}
                    className="px-2.5 py-1 bg-amber-50 border border-amber-300 text-amber-800 rounded-md text-xs font-medium hover:bg-amber-100 transition-colors"
                  >
                    + 🌿 Rustic &amp; Natural
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presetChairs = [
                        { name: 'White Resin', color: '#FFFFFF', icon: '⬜' },
                        { name: 'Folding White', color: '#F8F8F8', icon: '🪑' },
                        { name: 'Garden Lattice', color: '#FFFAF0', icon: '🌿' }
                      ];
                      const existingNames = chairSpecs.map(c => c.name.toLowerCase());
                      const newChairs = presetChairs
                        .filter(c => !existingNames.includes(c.name.toLowerCase()))
                        .map((c) => ({
                          id: createEntityId('chair', chairSpecs.map((item) => item.id)) as ChairType,
                          name: c.name,
                          color: c.color,
                          width: 1.5,
                          depth: 1.5,
                          icon: c.icon
                        }));
                      if (newChairs.length > 0) {
                        const updated = [...chairSpecs, ...newChairs];
                        setChairSpecs(updated);
                      }
                    }}
                    className="px-2.5 py-1 bg-pink-50 border border-pink-200 text-pink-700 rounded-md text-xs font-medium hover:bg-pink-100 transition-colors"
                  >
                    + 🌸 Garden Party
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presetChairs = [
                        { name: 'Padded Ceremony', color: '#F5F5DC', icon: '💺' },
                        { name: 'Church Pew', color: '#654321', icon: '⛪' },
                        { name: 'Ceremony Bench', color: '#D2B48C', icon: '🪵' }
                      ];
                      const existingNames = chairSpecs.map(c => c.name.toLowerCase());
                      const newChairs = presetChairs
                        .filter(c => !existingNames.includes(c.name.toLowerCase()))
                        .map((c) => ({
                          id: createEntityId('chair', chairSpecs.map((item) => item.id)) as ChairType,
                          name: c.name,
                          color: c.color,
                          width: 1.5,
                          depth: 1.5,
                          icon: c.icon
                        }));
                      if (newChairs.length > 0) {
                        const updated = [...chairSpecs, ...newChairs];
                        setChairSpecs(updated);
                      }
                    }}
                    className="px-2.5 py-1 bg-green-50 border border-green-200 text-green-700 rounded-md text-xs font-medium hover:bg-green-100 transition-colors"
                  >
                    + 💒 Ceremony
                  </button>
                </div>
              </div>

              {/* Integrated Chair Search & Action Bar */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-xs text-gray-600 font-medium">
                    {chairSpecs.filter(c => c.id !== 'none').length} chair type{chairSpecs.filter(c => c.id !== 'none').length !== 1 ? 's' : ''} configured
                  </span>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = chairSpecs.filter(c => c.id !== 'none').map(c => c.id);
                      if (expandedChairs.size === allIds.length) {
                        setExpandedChairs(new Set());
                      } else {
                        setExpandedChairs(new Set(allIds));
                      }
                    }}
                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-700 transition-colors font-medium"
                  >
                    {expandedChairs.size === chairSpecs.filter(c => c.id !== 'none').length ? '▲ Collapse All' : '▼ Expand All'}
                  </button>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const newChair: ChairSpec = {
                        id: createEntityId('chair', chairSpecs.map((item) => item.id)) as ChairType,
                        name: 'New Chair',
                        color: '#FFFFFF',
                        width: 1.5,
                        depth: 1.5,
                        icon: '🪑'
                      };
                      const updated = [...chairSpecs, newChair];
                      setChairSpecs(updated);
                      setExpandedChairs(prev => new Set([...prev, newChair.id]));
                    }}
                    className="btn-primary px-3.5 py-1.5 bg-[#4A1942] hover:bg-[#3b1435] text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1"
                    style={{ backgroundColor: config.primaryColor }}
                  >
                    <span>➕</span>
                    <span>Add Chair Type</span>
                  </button>
                </div>
              </div>

              {/* Chair Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {chairSpecs.filter(c => c.id !== 'none').map((chair) => (
                  <div key={chair.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                    {/* Chair Header */}
                    <div 
                      className="p-4 cursor-pointer transition-colors"
                      style={{ backgroundColor: chair.color, borderBottom: '3px solid rgba(0,0,0,0.1)' }}
                      onClick={() => {
                        const newSet = new Set(expandedChairs);
                        if (newSet.has(chair.id)) {
                          newSet.delete(chair.id);
                        } else {
                          newSet.add(chair.id);
                        }
                        setExpandedChairs(newSet);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{expandedChairs.has(chair.id) ? '▼' : '▶'}</span>
                          <div className="w-12 h-12 bg-white/80 rounded-xl flex items-center justify-center text-2xl shadow-sm">
                            {chair.icon || '🪑'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 font-bold text-gray-800">
                              <span>{chair.name}</span>
                              {chair.archived && (
                                <span className="rounded-full bg-gray-700 px-2 py-0.5 text-[10px] text-white">Archived</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 flex items-center gap-2">
                              <span>📐 {chair.width}' × {chair.depth}'</span>
                              {chair.inventoryCount !== undefined && (
                                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs">
                                  📦 {chair.inventoryCount}
                                </span>
                              )}
                            </div>
                            <CatalogRevisionStatus definition={chair} definitions={chairSpecs} compact />
                            <HistoricalRevisionNotice definition={chair} definitions={chairSpecs} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {chair.archived && !catalogFamilyStatus(chairSpecs, chair).hasActiveSibling && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setChairSpecs(chairSpecs.map((candidate) => candidate.id === chair.id
                                  ? { ...candidate, archived: false }
                                  : candidate));
                              }}
                              className="rounded-lg bg-white/80 px-2 py-1.5 text-xs font-semibold text-green-700 hover:bg-white"
                              title="Restore to placement catalog"
                            >
                              Restore
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Duplicate chair
                              const newChair: ChairSpec = {
                                ...chair,
                                id: createEntityId('chair', chairSpecs.map((item) => item.id)) as ChairType,
                                name: `${chair.name} (Copy)`,
                                archived: false,
                                catalogFamilyId: undefined,
                                catalogRevision: undefined
                              };
                              const updated = [...chairSpecs, newChair];
                              setChairSpecs(updated);
                              setExpandedChairs(prev => new Set([...prev, newChair.id]));
                            }}
                            className="p-1.5 bg-white/80 hover:bg-white rounded-lg text-gray-600 hover:text-blue-600 transition-colors"
                            title="Duplicate"
                          >
                            📋
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmAction(
                                { title: 'Delete chair type?', message: `Delete chair type "${chair.name}"?`, kind: 'danger', confirmLabel: 'Delete Chair' },
                                () => {
                                  const updated = chairSpecs.filter(c => c.id !== chair.id);
                                  setChairSpecs(updated);
                                },
                              );
                            }}
                            className="p-1.5 bg-white/80 hover:bg-white rounded-lg text-gray-600 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Chair Details - Collapsible */}
                    {expandedChairs.has(chair.id) && (
                    <div className="p-4 space-y-4 bg-gray-50">
                      {/* Name & Dimensions Row */}
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <h5 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                          📝 Basic Info
                        </h5>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-medium text-gray-500">Chair Name</label>
                            <input
                              type="text"
                              value={chair.name}
                              onChange={(e) => {
                                const updated = chairSpecs.map(c => c.id === chair.id ? { ...c, name: e.target.value } : c);
                                setChairSpecs(updated);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-gray-500">Width (ft)</label>
                              <input
                                type="number"
                                step="0.25"
                                min="0.5"
                                max="5"
                                value={chair.width}
                                onChange={(e) => {
                                  const updated = chairSpecs.map(c => c.id === chair.id ? { ...c, width: parseFloat(e.target.value) || 1.5 } : c);
                                  setChairSpecs(updated);
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500">Depth (ft)</label>
                              <input
                                type="number"
                                step="0.25"
                                min="0.5"
                                max="5"
                                value={chair.depth}
                                onChange={(e) => {
                                  const updated = chairSpecs.map(c => c.id === chair.id ? { ...c, depth: parseFloat(e.target.value) || 1.5 } : c);
                                  setChairSpecs(updated);
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Appearance Row */}
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <h5 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                          🎨 Appearance
                        </h5>
                        <div className="grid grid-cols-2 gap-4">
                          {/* Color */}
                          <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Chair Color</label>
                            <div className="flex gap-2">
                              <input
                                type="color"
                                value={chair.color}
                                onChange={(e) => {
                                  const updated = chairSpecs.map(c => c.id === chair.id ? { ...c, color: e.target.value } : c);
                                  setChairSpecs(updated);
                                }}
                                className="w-12 h-10 border-2 border-gray-300 rounded-lg cursor-pointer shadow-sm"
                              />
                              <input
                                type="text"
                                value={chair.color}
                                onChange={(e) => {
                                  const updated = chairSpecs.map(c => c.id === chair.id ? { ...c, color: e.target.value } : c);
                                  setChairSpecs(updated);
                                }}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                                placeholder="#FFFFFF"
                              />
                            </div>
                          </div>
                          {/* Icon */}
                          <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Icon/Emoji</label>
                            <div className="flex gap-2 items-center">
                              <EmojiPicker
                                value={chair.icon || '🪑'}
                                onChange={(emoji) => {
                                  const updated = chairSpecs.map(c => c.id === chair.id ? { ...c, icon: emoji } : c);
                                  setChairSpecs(updated);
                                }}
                                position="auto"
                              />
                              <div className="flex-1 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200 text-center">
                                <span className="text-2xl">{chair.icon || '🪑'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Color Presets */}
                        <div className="mt-3">
                          <label className="text-xs font-medium text-gray-500 mb-2 block">Quick Colors</label>
                          <div className="flex flex-wrap gap-1">
                            {['#FFFFFF', '#F5F5DC', '#D4AF37', '#C0C0C0', '#8B4513', '#654321', '#000000', '#FFB6C1', '#E8E8E8', '#F0E68C'].map(color => (
                              <button
                                key={color}
                                onClick={() => {
                                  const updated = chairSpecs.map(c => c.id === chair.id ? { ...c, color } : c);
                                  setChairSpecs(updated);
                                }}
                                className={`w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110 ${chair.color === color ? 'border-amber-500 ring-2 ring-amber-200' : 'border-gray-300'}`}
                                style={{ backgroundColor: color }}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Inventory */}
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <h5 className="font-medium text-green-700 mb-3 flex items-center gap-2">
                          📦 Inventory Management
                        </h5>
                        <div className="flex flex-wrap gap-3 items-center">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max="9999"
                              value={chair.inventoryCount ?? ''}
                              onChange={(e) => {
                                const value = e.target.value === '' ? undefined : parseInt(e.target.value);
                                const updated = chairSpecs.map(c => c.id === chair.id ? { ...c, inventoryCount: value } : c);
                                setChairSpecs(updated);
                              }}
                              className="w-24 px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-center"
                              placeholder="∞"
                            />
                            <span className="text-sm text-green-600 font-medium">
                              {chair.inventoryCount === undefined ? 'Unlimited' : `chairs available`}
                            </span>
                          </div>
                          {chair.inventoryCount !== undefined && (
                            <button
                              onClick={() => {
                                const updated = chairSpecs.map(c => c.id === chair.id ? { ...c, inventoryCount: undefined } : c);
                                setChairSpecs(updated);
                              }}
                              className="px-3 py-1.5 bg-green-200 text-green-700 rounded-lg hover:bg-green-300 transition-colors text-sm"
                            >
                              Set Unlimited
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Images */}
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <h5 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                          📷 Reference Images
                        </h5>
                        <MultiImageUpload
                          images={chair.images || []}
                          onChange={(images) => {
                            const updated = chairSpecs.map(c => c.id === chair.id ? { ...c, images } : c);
                            setChairSpecs(updated);
                          }}
                          maxImages={4}
                          itemName="chair"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <div className="flex-1 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-center text-xs font-semibold text-green-800">
                          Metadata saves automatically; referenced physical edits create a reviewed revision.
                        </div>
                        <button
                          onClick={() => {
                            const newChair: ChairSpec = {
                              ...chair,
                              id: createEntityId('chair', chairSpecs.map((item) => item.id)) as ChairType,
                              name: `${chair.name} (Copy)`,
                              archived: false,
                              catalogFamilyId: undefined,
                              catalogRevision: undefined
                            };
                            const updated = [...chairSpecs, newChair];
                            setChairSpecs(updated);
                          }}
                          className="px-4 py-2.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium"
                        >
                          📋 Duplicate
                        </button>
                      </div>
                    </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Empty State */}
              {chairSpecs.filter(c => c.id !== 'none').length === 0 && (
                <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-amber-300">
                  <div className="text-6xl mb-4">🪑</div>
                  <h4 className="text-xl font-bold text-gray-700 mb-2">No Chair Types Yet</h4>
                  <p className="text-gray-500 mb-6">Add chair types to use in your layouts</p>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => {
                        const newChair: ChairSpec = {
                          id: createEntityId('chair', chairSpecs.map((item) => item.id)) as ChairType,
                          name: 'New Chair',
                          color: '#FFFFFF',
                          width: 1.5,
                          depth: 1.5,
                          icon: '🪑'
                        };
                        const updated = [...chairSpecs, newChair];
                        setChairSpecs(updated);
                        setExpandedChairs(new Set([newChair.id]));
                      }}
                      className="btn-primary px-5 py-2.5 bg-[#4A1942] hover:bg-[#3b1435] text-white rounded-lg transition-all font-bold shadow-sm"
                      style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                    >
                      ➕ Add Chair Type
                    </button>
                    <button
                      onClick={() => {
                        const defaultChairs: ChairSpec[] = [
                          { id: 'white-plastic' as ChairType, name: 'White Resin', color: '#FFFFFF', width: 1.5, depth: 1.5, icon: '⬜' },
                          { id: 'chiavari-gold' as ChairType, name: 'Chiavari Gold', color: '#D4AF37', width: 1.5, depth: 1.5, icon: '✨' },
                          { id: 'chiavari-silver' as ChairType, name: 'Chiavari Silver', color: '#C0C0C0', width: 1.5, depth: 1.5, icon: '🪑' },
                          { id: 'crossback' as ChairType, name: 'Cross Back Wood', color: '#8B4513', width: 1.5, depth: 1.5, icon: '🪵' },
                          { id: 'ghost' as ChairType, name: 'Ghost Chair', color: '#E8E8E8', width: 1.5, depth: 1.5, icon: '💎' },
                          { id: 'folding-white' as ChairType, name: 'Folding White', color: '#F8F8F8', width: 1.5, depth: 1.5, icon: '🪑' },
                          { id: 'padded-ceremony' as ChairType, name: 'Padded Ceremony', color: '#F5F5DC', width: 1.5, depth: 1.5, icon: '💺' },
                          { id: 'vineyard' as ChairType, name: 'Vineyard Oak', color: '#A0522D', width: 1.5, depth: 1.5, icon: '🌳' }
                        ];
                        setChairSpecs([...chairSpecs, ...defaultChairs]);
                      }}
                      className="px-5 py-2.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors font-medium"
                    >
                      🎨 Load Defaults
                    </button>
                  </div>
                </div>
              )}

              {/* Tips */}
              <BrandedTips
                title="Tips for Managing Chair Types"
                config={config}
                tips={[
                  { icon: '📐', title: 'Dimensions', description: 'Standard chairs are typically 1.5\' × 1.5\'. Larger throne chairs may be 2\' × 2\'.' },
                  { icon: '🎨', title: 'Colors', description: 'Match chair colors to your wedding theme. Use the color picker or enter exact hex codes.' },
                  { icon: '📦', title: 'Inventory', description: 'Set inventory limits to prevent over-booking. Leave blank for unlimited.' },
                  { icon: '📷', title: 'Images', description: 'Upload photos of actual chairs for client reference during planning.' },
                  { icon: '✨', title: 'Presets', description: 'Use quick add presets to quickly add popular chair styles like Chiavari and Ghost chairs.' }
                ]}
              />
            </div>
    </div>
  );
}
