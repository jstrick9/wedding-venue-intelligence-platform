import React from 'react';
import { BrandedSectionHeader, BrandedStatCard, BrandedTips, PatternColorPicker } from './shared/AdminSharedComponents';
import MultiImageUpload from '../MultiImageUpload';
import { PatternType, ShapeType, ChairType, RectangularChairLayout, TableSpec } from '../../types';
import type { AdminCommonProps } from './AdminTabTypes';
import { createEntityId } from '../../utils/entityId';
import { catalogFamilyStatus } from '../../utils/catalogFamily';
import { CatalogRevisionStatus, HistoricalRevisionNotice } from './CatalogRevisionStatus';

export function TableManagement(props: AdminCommonProps) {
  const {
    config,
    handleImageUpload,
    confirmAction,
    tableTypes,
    tableSpecs,
    defaultPatternColors,
    patternOptions,
    layoutCategories,
    seatingTypes,
    expandedSeatingTypes,
    setExpandedSeatingTypes,
    getSeatingDimensions,
    toggleSeatingTypeExpanded,
    expandAllSeatingTypes,
    collapseAllSeatingTypes,
    shapeOptions,
    chairLayoutOptions,
    getChairSpecs,
    setShowSeatingTypesSection,
    showSeatingTypesSection,
    renderShapePreview,
    handleSaveTables,
    collapseAllTables,
    expandAllTables,
    toggleTableExpanded,
    expandedTables,
    setExpandedTables,
  } = props;

  // Live search for table types (large catalogs can be hard to scan).
  const [tableSearch, setTableSearch] = React.useState('');
  const filteredTables = tableSearch.trim()
    ? tableTypes.filter((t) =>
        (t.name || '').toLowerCase().includes(tableSearch.trim().toLowerCase()),
      )
    : tableTypes;

  return (
    <div className="space-y-4">
      {/* Header Section */}
              <BrandedSectionHeader 
                icon="🪑" 
                title="Tables/Seating" 
                description="Define table types and chair-only seating arrangements for venue categories"
                config={config}
              />

              {/* Compact 4-Column Table KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <BrandedStatCard icon="🪑" label="Table Types" value={tableTypes.length} config={config} variant="primary" />
                <BrandedStatCard icon="📦" label="Total Inventory" value={tableTypes.reduce((sum, t) => sum + (t.inventoryCount || 0), 0) || '∞'} config={config} variant="success" />
                <BrandedStatCard icon="👥" label="Total Capacity" value={tableSpecs.reduce((sum, t) => sum + t.capacity, 0)} config={config} variant="accent" />
                <BrandedStatCard icon="🎨" label="Categories" value={new Set(tableTypes.map(t => t.shape)).size} config={config} variant="warning" />
              </div>

              {/* Compact 1-Row Table Quick Presets */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-gray-500">⚡ Quick Presets:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const presets: TableSpec[] = [
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: '60" Round (8)', shape: 'circle', width: 5, height: 5, capacity: 8, color: '#FFFFFF', allowAsDecorBase: true },
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: '48" Round (6)', shape: 'circle', width: 4, height: 4, capacity: 6, color: '#FFFFFF', allowAsDecorBase: true },
                      ];
                      handleSaveTables([...tableSpecs, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-md text-xs font-medium hover:bg-blue-100 transition-colors"
                  >
                    + ⭕ Rounds
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: TableSpec[] = [
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: '6ft Banquet', shape: 'rectangle', width: 6, height: 2.5, capacity: 6, color: '#FFFFFF', allowAsDecorBase: true },
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: '8ft Banquet', shape: 'rectangle', width: 8, height: 2.5, capacity: 8, color: '#FFFFFF', allowAsDecorBase: true },
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: '6ft Classroom', shape: 'rectangle', width: 6, height: 1.5, capacity: 3, color: '#FFFFFF', allowAsDecorBase: true },
                      ];
                      handleSaveTables([...tableSpecs, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-md text-xs font-medium hover:bg-amber-100 transition-colors"
                  >
                    + ▬ Banquets
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: TableSpec[] = [
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: 'Sweetheart Table', shape: 'semicircle', width: 5, height: 2.5, capacity: 2, color: '#FFF0F5', allowAsDecorBase: true },
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: 'Head Table (12)', shape: 'rectangle', width: 16, height: 2.5, capacity: 12, color: '#FFF0F5', defaultChairLayout: 'head-table', allowAsDecorBase: true },
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: 'King\'s Table', shape: 'rectangle', width: 20, height: 4, capacity: 20, color: '#FFFAF0', allowAsDecorBase: true },
                      ];
                      handleSaveTables([...tableSpecs, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-pink-50 border border-pink-200 text-pink-700 rounded-md text-xs font-medium hover:bg-pink-100 transition-colors"
                  >
                    + 👑 Wedding Party
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: TableSpec[] = [
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: 'Cocktail High', shape: 'circle', width: 2.5, height: 2.5, capacity: 4, color: '#F5F5DC', allowAsDecorBase: true },
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: 'Cocktail Low', shape: 'circle', width: 3, height: 3, capacity: 6, color: '#F5F5DC', allowAsDecorBase: true },
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: 'Bar Height Square', shape: 'rectangle', width: 2, height: 2, capacity: 4, color: '#8B4513', allowAsDecorBase: true },
                      ];
                      handleSaveTables([...tableSpecs, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-md text-xs font-medium hover:bg-purple-100 transition-colors"
                  >
                    + 🍸 Cocktails
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: TableSpec[] = [
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: 'Kids Table', shape: 'rectangle', width: 6, height: 2.5, capacity: 8, color: '#E0F7FA', allowAsDecorBase: true },
                        { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: 'Activity Table', shape: 'circle', width: 4, height: 4, capacity: 6, color: '#FFF9C4', allowAsDecorBase: true },
                      ];
                      handleSaveTables([...tableSpecs, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-green-50 border border-green-200 text-green-700 rounded-md text-xs font-medium hover:bg-green-100 transition-colors"
                  >
                    + 🧒 Kids Tables
                  </button>
                </div>
              </div>

              {/* Integrated Table Search & Action Bar */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-400 text-xs">🔍</span>
                    <input
                      type="search"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Search table types..."
                      className="w-48 pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2"
                      aria-label="Search table types"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => expandedTables.size === tableTypes.length ? collapseAllTables() : expandAllTables()}
                    className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-700 transition-colors font-medium"
                  >
                    {expandedTables.size === tableTypes.length ? '▲ Collapse' : '▼ Expand'}
                  </button>
                  <span className="text-gray-300">|</span>
                  <span className="text-xs text-gray-600 font-medium">{tableTypes.length} Table types</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const id = createEntityId('table', tableSpecs.map((item) => item.id));
                      const newTable: TableSpec = {
                        id,
                        name: 'New Table',
                        shape: 'circle',
                        width: 6,
                        height: 6,
                        capacity: 8,
                        color: '#F5F5DC',
                        allowAsDecorBase: true
                      };
                      handleSaveTables([...tableSpecs, newTable]);
                      setExpandedTables(new Set([...expandedTables, id]));
                    }}
                    className="btn-primary px-3.5 py-1.5 bg-[#4A1942] hover:bg-[#3b1435] text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1"
                    style={{ backgroundColor: config.primaryColor }}
                  >
                    <span>➕</span>
                    <span>Add Table Type</span>
                  </button>
                </div>
              </div>
              
              {/* Table Cards */}
              {tableTypes.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                  <div className="text-6xl mb-4">🪑</div>
                  <h3 className="font-semibold text-gray-700 mb-2">No Table Types Yet</h3>
                  <p className="text-gray-500 mb-4">Add table types to start creating layouts</p>
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => {
                        const newTable: TableSpec = {
                          id: createEntityId('table', tableSpecs.map((item) => item.id)),
                          name: 'New Table',
                          shape: 'circle',
                          width: 6,
                          height: 6,
                          capacity: 8,
                          color: '#F5F5DC',
                          allowAsDecorBase: true
                        };
                        handleSaveTables([...tableSpecs, newTable]);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      + Add Table Type
                    </button>
                    <button
                      onClick={() => {
                        const defaults: TableSpec[] = [
                          { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: '60" Round (8)', shape: 'circle', width: 5, height: 5, capacity: 8, color: '#FFFFFF', allowAsDecorBase: true },
                          { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: '6ft Banquet', shape: 'rectangle', width: 6, height: 2.5, capacity: 6, color: '#FFFFFF', allowAsDecorBase: true },
                          { id: createEntityId('table', tableSpecs.map((item) => item.id)), name: '8ft Banquet', shape: 'rectangle', width: 8, height: 2.5, capacity: 8, color: '#FFFFFF', allowAsDecorBase: true },
                        ];
                        handleSaveTables(defaults);
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Load Defaults
                    </button>
                  </div>
                </div>
              ) : (
              <div className="space-y-3">
              {filteredTables.map((table) => (
                <div key={table.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                  <div 
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleTableExpanded(table.id)}
                    style={{ borderLeft: `4px solid ${table.color || '#F5F5DC'}` }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-lg w-6">{expandedTables.has(table.id) ? '▼' : '▶'}</span>
                      {/* Shape Preview */}
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-2 border border-gray-200 shadow-inner">
                        <svg width="40" height="40" viewBox="0 0 48 48">
                          {renderShapePreview(table.shape as ShapeType, table.color || '#F5F5DC')}
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800">{table.name}</span>
                          {table.archived && (
                            <span className="text-xs bg-gray-700 text-white px-2 py-0.5 rounded-full">Archived</span>
                          )}
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">{table.shape}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          <span className="flex items-center gap-1">📐 {table.width}' × {table.height}'</span>
                          <span className="flex items-center gap-1">🪑 {table.capacity} seats</span>
                          {table.inventoryCount !== undefined && (
                            <span className="flex items-center gap-1 text-green-600">📦 {table.inventoryCount}</span>
                          )}
                        </div>
                        <CatalogRevisionStatus definition={table} definitions={tableSpecs} compact />
                        <HistoricalRevisionNotice definition={table} definitions={tableSpecs} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Quick Actions in Header */}
                      {table.archived && !catalogFamilyStatus(tableSpecs, table).hasActiveSibling && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveTables(tableSpecs.map((candidate) => candidate.id === table.id
                              ? { ...candidate, archived: false }
                              : candidate));
                          }}
                          className="text-xs font-semibold text-green-700 px-2 py-1 hover:bg-green-50 rounded"
                          title="Restore to placement catalog"
                        >
                          Restore
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const duplicate: TableSpec = {
                            ...table,
                            id: createEntityId('table', tableSpecs.map((item) => item.id)),
                            name: `${table.name} (Copy)`,
                            archived: false,
                            catalogFamilyId: undefined,
                            catalogRevision: undefined
                          };
                          handleSaveTables([...tableSpecs, duplicate]);
                        }}
                        className="text-gray-400 hover:text-blue-600 text-sm px-2 py-1 hover:bg-blue-50 rounded transition-colors"
                        title="Duplicate"
                      >
                        📋
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmAction(
                            { title: 'Delete table?', message: `Delete table "${table.name}"?`, kind: 'danger', confirmLabel: 'Delete Table' },
                            () => handleSaveTables(tableSpecs.filter(t => t.id !== table.id)),
                          );
                        }}
                        className="text-gray-400 hover:text-red-600 text-sm px-2 py-1 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  {expandedTables.has(table.id) && (
                  <div className="p-4 space-y-4">
                    {/* Row 1: Basic Settings */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</label>
                        <input
                          type="text"
                          value={table.name}
                          onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, name: e.target.value } : t))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Shape</label>
                        <select
                          value={table.shape}
                          onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, shape: e.target.value as ShapeType } : t))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
                        >
                          {shapeOptions.map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Width (ft)</label>
                        <input
                          type="number"
                          value={table.width}
                          onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, width: parseFloat(e.target.value) || 6 } : t))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Height (ft)</label>
                        <input
                          type="number"
                          value={table.height}
                          onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, height: parseFloat(e.target.value) || 6 } : t))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
                        />
                      </div>
                    </div>
                    
                    {/* Row 2: Capacity, Pattern, Inventory */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Capacity</label>
                        <input
                          type="number"
                          value={table.capacity}
                          onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, capacity: parseInt(e.target.value) || 0 } : t))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pattern</label>
                        <select
                          value={table.pattern || 'solid'}
                          onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, pattern: e.target.value as PatternType, patternColors: defaultPatternColors[e.target.value as PatternType] } : t))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
                        >
                          {patternOptions.map(p => (
                            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Inventory</label>
                        <input
                          type="number"
                          min="0"
                          value={table.inventoryCount ?? 999}
                          onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, inventoryCount: parseInt(e.target.value) || 0 } : t))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4A1942] focus:border-transparent"
                        />
                      </div>
                    </div>
                    
                    {/* Row 3: Color - Full Width */}
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">Table Color</label>
                      <div className="flex gap-3 items-center">
                        <input
                          type="color"
                          value={table.color || '#F5F5DC'}
                          onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, color: e.target.value } : t))}
                          className="w-20 h-14 border-2 border-gray-300 rounded-lg cursor-pointer hover:border-[#4A1942] transition-colors shadow-sm"
                          style={{ padding: '4px' }}
                          title="Click to select color"
                        />
                        <input
                          type="text"
                          value={table.color || '#F5F5DC'}
                          onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, color: e.target.value } : t))}
                          className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          placeholder="#RRGGBB"
                        />
                        <div 
                          className="w-14 h-14 rounded-lg border-2 border-gray-300 shadow-inner"
                          style={{ backgroundColor: table.color || '#F5F5DC' }}
                          title="Color preview"
                        />
                        <span className="text-xs text-gray-500">Click the color box to change</span>
                      </div>
                    </div>
                    
                    {/* Pattern Colors */}
                    {table.pattern && table.pattern !== 'solid' && (
                      <PatternColorPicker
                        pattern={table.pattern}
                        patternColors={table.patternColors}
                        onChange={(colors) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, patternColors: colors } : t))}
                      />
                    )}
                    
                    {/* Chair Settings */}
                    <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <h4 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                        🪑 Chair Settings
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Default Chair Type</label>
                          <select
                            value={table.defaultChairType || 'white-plastic'}
                            onChange={(e) => {
                              const defaultChairType = e.target.value as ChairType;
                              handleSaveTables(tableSpecs.map((candidate) => candidate.id === table.id
                                ? { ...candidate, defaultChairType, ...(defaultChairType === 'none' ? { capacity: 0 } : {}) }
                                : candidate));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          >
                            {getChairSpecs().map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        {table.shape === 'rectangle' && (
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Chair Layout</label>
                            <select
                              value={table.defaultChairLayout || 'all-sides'}
                              onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, defaultChairLayout: e.target.value as RectangularChairLayout } : t))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            >
                              {chairLayoutOptions.map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.name}</option>
                              ))}
                            </select>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {chairLayoutOptions.find(o => o.id === (table.defaultChairLayout || 'all-sides'))?.description}
                            </p>
                          </div>
                        )}
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Show Chairs by Default</label>
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="checkbox"
                              checked={table.showChairs !== false}
                              onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, showChairs: e.target.checked } : t))}
                              className="w-5 h-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            />
                            <span className="text-sm text-gray-600">Yes, show chairs</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide text-[#4A1942]">Decor Designer</label>
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="checkbox"
                              checked={table.allowAsDecorBase !== false}
                              onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, allowAsDecorBase: e.target.checked } : t))}
                              className="w-5 h-5 rounded border-gray-300 text-[#4A1942] focus:ring-[#4A1942]"
                            />
                            <span className="text-sm text-gray-600">Available in Decor Designer</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Allowed Chair Types */}
                      <div className="mt-3 pt-3 border-t border-amber-200">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">
                          Allowed Chair Types for This Table
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {getChairSpecs().filter(c => c.id !== 'none').map(chair => {
                            const isAllowed = !table.allowedChairTypes || table.allowedChairTypes.includes(chair.id);
                            return (
                              <button
                                key={chair.id}
                                type="button"
                                onClick={() => {
                                  const currentAllowed = table.allowedChairTypes || getChairSpecs().filter(c => c.id !== 'none').map(c => c.id);
                                  const newAllowed = isAllowed 
                                    ? currentAllowed.filter(id => id !== chair.id)
                                    : [...currentAllowed, chair.id];
                                  handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, allowedChairTypes: newAllowed as ChairType[] } : t));
                                }}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                  isAllowed 
                                    ? 'bg-amber-500 text-white' 
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                              >
                                {chair.icon} {chair.name}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Click to toggle which chair types users can select for this table</p>
                      </div>
                    </div>
                    
                    {/* Venue Category Availability */}
                    <div className="mt-4 p-3 bg-[#4A1942]/10 rounded-lg border border-[#4A1942]/20">
                      <h4 className="text-sm font-semibold text-[#4A1942] mb-2 flex items-center gap-2">
                        🏛️ Venue Category Availability
                      </h4>
                      <p className="text-xs text-[#4A1942] mb-3">Choose which venue categories can use this table. Leave all unchecked to allow in all categories.</p>
                      <div className="flex flex-wrap gap-2">
                        {layoutCategories.map(cat => {
                          const selected = (table.venueCategories || []).includes(cat.id as any);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => {
                                const current = table.venueCategories || [];
                                const venueCategories = selected
                                  ? current.filter(c => c !== cat.id)
                                  : [...current, cat.id as any];
                                // F-251-4 (Review #251): same discard bug as
                                // F-251-2 — the computed value was thrown away
                                // and the table saved unchanged, so the Venue
                                // Category Availability chips never worked.
                                handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, venueCategories } : t));
                              }}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selected ? 'bg-[#4A1942] text-white' : 'bg-white text-[#4A1942] border border-[#4A1942]/20 hover:bg-[#4A1942]/10'}`}
                            >
                              {cat.icon} {cat.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Inventory Count */}
                    <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                      <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                        📦 Inventory Management
                      </h4>
                      <div className="flex items-center gap-3">
                        <div>
                          <label className="text-xs font-medium text-green-700">Available Count</label>
                          <div className="flex gap-2 mt-1 items-center">
                            <input
                              type="number"
                              min="0"
                              value={table.inventoryCount ?? ''}
                              onChange={(e) => {
                                const value = e.target.value === '' ? undefined : parseInt(e.target.value);
                                handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, inventoryCount: value } : t));
                              }}
                              className="w-24 px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                              placeholder="∞"
                            />
                            <span className="text-sm text-green-600 font-medium">
                              {table.inventoryCount === undefined ? '(Unlimited)' : `${table.inventoryCount} tables`}
                            </span>
                            {table.inventoryCount !== undefined && (
                              <button
                                onClick={() => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, inventoryCount: undefined } : t))}
                                className="text-xs text-green-600 hover:text-green-800 underline"
                              >
                                Set Unlimited
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Image upload section */}
                    <div className="space-y-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-500">Primary Image:</span>
                          {table.imageUrl ? (
                            <img src={table.imageUrl} alt="" className="w-12 h-12 object-cover rounded border" />
                          ) : (
                            <div className="w-12 h-12 bg-gray-100 rounded border flex items-center justify-center text-gray-400 text-xs">
                              No img
                            </div>
                          )}
                          <button
                            onClick={() => handleImageUpload((url) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, imageUrl: url } : t)))}
                            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
                          >
                            📷 Upload
                          </button>
                          {table.imageUrl && (
                            <button
                              onClick={() => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, imageUrl: undefined } : t))}
                              className="text-red-500 hover:text-red-700"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Multi-Image Gallery */}
                      <MultiImageUpload
                        images={table.images || []}
                        onChange={(images) => handleSaveTables(tableSpecs.map(t => t.id === table.id ? { ...t, images } : t))}
                        maxImages={4}
                        itemName="table"
                      />
                      
                       <div className="flex justify-end">
                        <button
                          onClick={() => handleSaveTables(tableSpecs.filter(t => t.id !== table.id))}
                          className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm transition-colors"
                        >
                          🗑️ Delete Table
                        </button>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              ))}
              </div>
              )}

              <BrandedTips
                title="Table Setup Tips"
                config={config}
                tips={[
                  { icon: '⭕', title: '60" Round Tables', description: 'Typically seat 8-10 guests comfortably' },
                  { icon: '⭕', title: '48" Round Tables', description: 'Great for smaller family groups or kids tables' },
                  { icon: '▬', title: 'Banquet Tables', description: 'Great for head tables and family-style dining' },
                  { icon: '🍸', title: 'Cocktail Tables', description: 'Ideal for standing reception and cocktail hour areas' },
                  { icon: '🚶', title: 'Traffic Flow', description: 'Consider guest and server movement when setting capacities' },
                  { icon: '📏', title: 'Spacing', description: 'Allow 2-3 feet between tables for comfortable movement' }
                ]}
              />

              {/* Seating Types Section */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-purple-800 flex items-center gap-2">💺 Seating Types</div>
                  <div className="text-xs text-purple-600 mt-0.5">Chair-only seating arrangements for ceremony-style layouts</div>
                </div>
                <button
                  onClick={() => setShowSeatingTypesSection(!showSeatingTypesSection)}
                  className="px-3 py-1.5 bg-white border border-purple-200 text-purple-700 rounded-lg text-sm hover:bg-purple-100 transition-colors"
                >
                  {showSeatingTypesSection ? '▲ Collapse' : '▼ Expand'}
                </button>
              </div>

              {showSeatingTypesSection && (
              <div className="space-y-3">
                {/* Seating Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                  <div className="flex items-center gap-2">
                    <div className="flex">
                      {seatingTypes.slice(0, 4).map(s => (
                        <div
                          key={s.id}
                          className="w-8 h-8 -ml-1 first:ml-0 rounded-full border-2 border-white flex items-center justify-center text-xs bg-purple-100 text-purple-700"
                          title={s.name}
                        >
                          💺
                        </div>
                      ))}
                    </div>
                    <span className="text-sm text-gray-600 font-medium">{seatingTypes.length} seating types</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => expandedSeatingTypes.size === seatingTypes.length ? collapseAllSeatingTypes() : expandAllSeatingTypes()}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                    >
                      {expandedSeatingTypes.size === seatingTypes.length ? '▲ Collapse All' : '▼ Expand All'}
                    </button>
                    <button
                      onClick={() => {
                        const id = createEntityId('seating', tableSpecs.map((item) => item.id));
                        const chairsPerRow = 12;
                        const rowCount = 4;
                        const rowSpacing = 3;
                        const dims = getSeatingDimensions('white-plastic', chairsPerRow, rowCount, rowSpacing);
                        const newSeating: TableSpec = {
                          id,
                          name: 'New Seating Type',
                          shape: 'rectangle',
                          width: dims.width,
                          height: dims.height,
                          capacity: chairsPerRow,
                          color: '#E5E7EB',
                          isSeatingType: true,
                          seatingStyle: 'straight-row',
                          seatingRowCount: rowCount,
                          seatingRowSpacing: rowSpacing,
                          showChairs: true,
                          defaultChairType: 'white-plastic',
                          venueCategories: ['ceremony']
                        };
                        handleSaveTables([...tableSpecs, newSeating]);
                        setExpandedSeatingTypes(new Set([...expandedSeatingTypes, id]));
                      }}
                      className="btn-primary px-4 py-2 bg-[#4A1942] hover:bg-[#3b1435] text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
                      style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                    >
                      + Add Seating Type
                    </button>
                  </div>
                </div>

                <div
                  className="rounded-lg p-3 border"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 6%, transparent)`,
                    borderColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 20%, transparent)`,
                  }}
                >
                  <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: config.primaryDark || '#3d1a45' }}>Quick Seating Templates</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { name: 'Ceremony Row', style: 'straight-row', chairs: 12, rows: 4, spacing: 3 },
                      { name: 'Curved Row', style: 'curved-row', chairs: 10, rows: 4, spacing: 3 },
                      { name: 'Semicircle Setup', style: 'semicircle-row', chairs: 16, rows: 3, spacing: 3.5 },
                      { name: 'Stadium Seating', style: 'stadium', chairs: 14, rows: 5, spacing: 3 }
                    ].map(tpl => (
                      <button
                        key={tpl.name}
                        onClick={() => {
                          const id = createEntityId('seating', tableSpecs.map((item) => item.id));
                          const dims = getSeatingDimensions('white-plastic', tpl.chairs, tpl.rows, tpl.spacing);
                          const newSeating: TableSpec = {
                            id,
                            name: tpl.name,
                            shape: 'rectangle',
                            width: dims.width,
                            height: dims.height,
                            capacity: tpl.chairs,
                            color: '#E5E7EB',
                            isSeatingType: true,
                            seatingStyle: tpl.style as any,
                            seatingRowCount: tpl.rows,
                            seatingRowSpacing: tpl.spacing,
                            showChairs: true,
                            defaultChairType: 'white-plastic',
                            venueCategories: ['ceremony']
                          };
                          handleSaveTables([...tableSpecs, newSeating]);
                          setExpandedSeatingTypes(new Set([...expandedSeatingTypes, id]));
                        }}
                        className="px-2.5 py-2 text-xs font-medium rounded-lg border border-purple-200 bg-white text-purple-700 hover:bg-purple-100 transition-colors"
                      >
                        💺 {tpl.name}
                      </button>
                    ))}
                  </div>
                </div>
                {seatingTypes.length === 0 ? (
                  <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-lg p-4">No seating types yet. Add one to create chair-only ceremony arrangements.</div>
                ) : seatingTypes.map((seat) => (
                  <div key={seat.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                      onClick={() => toggleSeatingTypeExpanded(seat.id)}
                      style={{ borderLeft: '4px solid #7c3aed' }}
                    >
                      <div>
                        <div className="font-semibold text-gray-800 flex items-center gap-2">
                          <span className="text-gray-400">{expandedSeatingTypes.has(seat.id) ? '▼' : '▶'}</span>
                          {seat.name}
                          {seat.archived && (
                            <span className="text-xs bg-gray-700 text-white px-2 py-0.5 rounded-full">Archived</span>
                          )}
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{seat.capacity} chairs</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {(seat.seatingRowCount || 1)} rows • {(seat.seatingRowSpacing || 3)}ft spacing • {seat.capacity * Math.max(1, seat.seatingRowCount || 1)} total chairs
                        </div>
                        <CatalogRevisionStatus definition={seat} definitions={tableSpecs} compact />
                        <HistoricalRevisionNotice definition={seat} definitions={tableSpecs} />
                      </div>
                      <div className="flex items-center gap-2">
                        {seat.archived && !catalogFamilyStatus(tableSpecs, seat).hasActiveSibling && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveTables(tableSpecs.map((candidate) => candidate.id === seat.id
                                ? { ...candidate, archived: false }
                                : candidate));
                            }}
                            className="text-xs font-semibold text-green-700 px-2 py-1 hover:bg-green-50 rounded"
                            title="Restore to placement catalog"
                          >
                            Restore
                          </button>
                        )}
                        <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmAction(
                            { title: 'Delete seating type?', message: `Delete seating type "${seat.name}"?`, kind: 'danger', confirmLabel: 'Delete Seating Type' },
                            () => handleSaveTables(tableSpecs.filter(t => t.id !== seat.id)),
                          );
                        }}
                        className="text-gray-400 hover:text-red-600 text-sm px-2 py-1 hover:bg-red-50 rounded"
                      >
                        🗑️
                        </button>
                      </div>
                    </div>

                    {expandedSeatingTypes.has(seat.id) && (
                      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Name</label>
                          <input type="text" value={seat.name} onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === seat.id ? { ...t, name: e.target.value } : t))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Chair Count</label>
                          <input
                            type="number"
                            min="0"
                            value={seat.capacity}
                            onChange={(e) => {
                              const nextCapacity = Math.max(0, parseInt(e.target.value, 10) || 0);
                              const nextRows = Math.max(1, seat.seatingRowCount || 1);
                              const nextSpacing = Math.max(0.5, seat.seatingRowSpacing || 3);
                              const dims = getSeatingDimensions(seat.defaultChairType, nextCapacity, nextRows, nextSpacing);
                              handleSaveTables(tableSpecs.map(t => t.id === seat.id ? { ...t, capacity: nextCapacity, width: dims.width, height: dims.height } : t));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Seating Style</label>
                          <select value={seat.seatingStyle || 'straight-row'} onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === seat.id ? { ...t, seatingStyle: e.target.value as any } : t))} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                            <option value="straight-row">Straight Row</option>
                            <option value="curved-row">Curved Row</option>
                            <option value="stadium">Stadium</option>
                            <option value="semicircle-row">Semicircle</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Row Count</label>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={seat.seatingRowCount ?? 4}
                            onChange={(e) => {
                              const nextRows = parseInt(e.target.value) || 1;
                              const nextSpacing = Math.max(0.5, seat.seatingRowSpacing || 3);
                              const dims = getSeatingDimensions(seat.defaultChairType, seat.capacity ?? 0, nextRows, nextSpacing);
                              handleSaveTables(tableSpecs.map(t => t.id === seat.id ? { ...t, seatingRowCount: nextRows, width: dims.width, height: dims.height } : t));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Row Spacing (ft)</label>
                          <input
                            type="number"
                            min="1"
                            step="0.5"
                            value={seat.seatingRowSpacing ?? 3}
                            onChange={(e) => {
                              const nextSpacing = parseFloat(e.target.value) || 1;
                              const nextRows = Math.max(1, seat.seatingRowCount || 1);
                              const dims = getSeatingDimensions(seat.defaultChairType, seat.capacity ?? 0, nextRows, nextSpacing);
                              handleSaveTables(tableSpecs.map(t => t.id === seat.id ? { ...t, seatingRowSpacing: nextSpacing, width: dims.width, height: dims.height } : t));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Chair Type</label>
                          <select value={seat.defaultChairType || 'white-plastic'} onChange={(e) => {
                            const nextChairType = e.target.value as ChairType;
                            const nextRows = Math.max(1, seat.seatingRowCount || 1);
                            const nextSpacing = Math.max(0.5, seat.seatingRowSpacing || 3);
                            const dims = getSeatingDimensions(nextChairType, seat.capacity ?? 0, nextRows, nextSpacing);
                            handleSaveTables(tableSpecs.map(t => t.id === seat.id ? { ...t, defaultChairType: nextChairType, width: dims.width, height: dims.height } : t));
                          }} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                            {getChairSpecs().filter(c => c.id !== 'none').map(ch => (
                              <option key={ch.id} value={ch.id}>{ch.icon} {ch.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide text-[#4A1942]">Decor Designer</label>
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="checkbox"
                              checked={seat.allowAsDecorBase !== false}
                              onChange={(e) => handleSaveTables(tableSpecs.map(t => t.id === seat.id ? { ...t, allowAsDecorBase: e.target.checked } : t))}
                              className="w-5 h-5 rounded border-gray-300 text-[#4A1942] focus:ring-[#4A1942]"
                            />
                            <span className="text-sm text-gray-600">Available in Decor Designer</span>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Venue Categories</label>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {layoutCategories.map(cat => {
                              const selected = (seat.venueCategories || []).includes(cat.id as any);
                              return (
                                <button key={cat.id} type="button" onClick={() => {
                                  const current = seat.venueCategories || [];
                                  const venueCategories = selected ? current.filter(c => c !== cat.id) : [...current, cat.id as any];
                                  handleSaveTables(tableSpecs.map(t => t.id === seat.id ? { ...t, venueCategories } : t));
                                }} className={`px-2 py-1 rounded-full text-xs ${selected ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                                  {cat.icon} {cat.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}
              {showSeatingTypesSection && (
                <BrandedTips
                  title="Seating Setup Tips"
                  config={config}
                  tips={[
                    { icon: '💺', title: 'Chair-Only Layouts', description: 'Seating types are chair-only arrangements and do not use table linens.' },
                    { icon: '🧮', title: 'Total Chairs', description: 'Total chairs = chairs per row × row count. Use this to plan ceremony capacity.' },
                    { icon: '📏', title: 'Row Spacing', description: 'Use 3-4 ft row spacing for comfortable access and clear ceremony aisles.' },
                    { icon: '🎯', title: 'Ceremony Category', description: 'Assign seating types to Ceremony venues so basic/guest users only see relevant options.' },
                    { icon: '👥', title: 'Guest Assignment', description: 'Use seating capacity and rows to support clear guest assignment planning.' }
                  ]}
                />
              )}
    </div>
  );
}
