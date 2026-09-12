import React from 'react';
import { BrandedSectionHeader, BrandedStatCard, PatternColorPicker } from './shared/AdminSharedComponents';
import EmojiPicker from '../EmojiPicker';
import MultiImageUpload from '../MultiImageUpload';
import { PatternType, ShapeType, FixtureType } from '../../types';
import type { AdminCommonProps } from './AdminTabTypes';
import { createEntityId } from '../../utils/entityId';
import { catalogFamilyStatus } from '../../utils/catalogFamily';
import { CatalogRevisionStatus, HistoricalRevisionNotice } from './CatalogRevisionStatus';

export function FixtureManagement(props: AdminCommonProps) {
  const {
    config,
    confirmAction,
    fixtureTypes,
    defaultPatternColors,
    patternOptions,
    layoutCategories,
    shapeOptions,
    setShowLodgingFixturesSection,
    showLodgingFixturesSection,
    expandAllLodgingFixtures,
    collapseAllLodgingFixtures,
    toggleLodgingFixtureExpanded,
    expandedLodgingFixtures,
    setShowExteriorFixturesSection,
    showExteriorFixturesSection,
    expandAllExteriorFixtures,
    collapseAllExteriorFixtures,
    toggleExteriorFixtureExpanded,
    expandedExteriorFixtures,
    setShowVenueFixturesSection,
    showVenueFixturesSection,
    expandAllVenueFixtures,
    collapseAllVenueFixtures,
    toggleVenueFixtureExpanded,
    expandedVenueFixtures,
    setShowDrawingTool,
    renderShapePreview,
    handleSaveFixtures,
  } = props;

  // Live search for fixtures across the venue/lodging/exterior sections.
  const [fixtureSearch, setFixtureSearch] = React.useState('');
  const matchesFixtureSearch = (f: FixtureType) => {
    const q = fixtureSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      f.name?.toLowerCase().includes(q) ||
      (f.id || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q)
    );
  };

  return (
    <div className="space-y-4">
      {/* Header Section */}
              <BrandedSectionHeader 
                icon="🎪" 
                title="Fixtures & Features" 
                description="Interior venue items and exterior architectural/landscape features"
                config={config}
              />

              {/* Compact 5-Column Fixture KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <BrandedStatCard icon="🏛️" label="Venue Fixtures" value={fixtureTypes.filter(f => f.category !== 'exterior' && f.category !== 'lodging').length} config={config} variant="primary" />
                <BrandedStatCard icon="🛏️" label="Lodging / Utilities" value={fixtureTypes.filter(f => f.category === 'lodging').length} config={config} variant="secondary" />
                <BrandedStatCard icon="🌳" label="Arch / Landscape" value={fixtureTypes.filter(f => f.category === 'exterior').length} config={config} variant="success" />
                <BrandedStatCard icon="📦" label="With Inventory" value={fixtureTypes.filter(f => f.inventoryCount !== undefined).length} config={config} variant="accent" />
                <BrandedStatCard icon="🧱" label="Wall-Linked" value={fixtureTypes.filter(f => f.wallStyleId).length} config={config} variant="warning" />
              </div>

              {/* Compact 1-Row Fixture Quick Presets */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-gray-500">⚡ Quick Presets:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const presets: FixtureType[] = [
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Dance Floor', shape: 'rectangle', width: 18, height: 18, icon: '💃', color: '#1a1a1a', category: 'interior', pattern: 'checkered' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'DJ Booth', shape: 'rectangle', width: 6, height: 4, icon: '🎧', color: '#374151', category: 'interior' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Stage', shape: 'rectangle', width: 12, height: 8, icon: '🎤', color: '#78350f', category: 'interior', pattern: 'wood' },
                      ];
                      handleSaveFixtures([...fixtureTypes, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-md text-xs font-medium hover:bg-purple-100 transition-colors"
                  >
                    + 🎉 Entertainment
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: FixtureType[] = [
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Sweetheart Table', shape: 'semicircle', width: 6, height: 3, icon: '💕', color: '#fdf2f8', category: 'interior' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Head Table', shape: 'rectangle', width: 16, height: 3, icon: '👑', color: '#fef3c7', category: 'interior' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Gift Table', shape: 'rectangle', width: 6, height: 3, icon: '🎁', color: '#f3e8ff', category: 'interior' },
                      ];
                      handleSaveFixtures([...fixtureTypes, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-pink-50 border border-pink-200 text-pink-700 rounded-md text-xs font-medium hover:bg-pink-100 transition-colors"
                  >
                    + 💒 Wedding
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: FixtureType[] = [
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Buffet Station', shape: 'rectangle', width: 10, height: 3, icon: '🍽️', color: '#fef3c7', category: 'interior' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Bar', shape: 'rectangle', width: 12, height: 4, icon: '🍸', color: '#422006', category: 'interior', pattern: 'wood' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Cake Table', shape: 'circle', width: 4, height: 4, icon: '🎂', color: '#fce7f3', category: 'interior' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Dessert Table', shape: 'rectangle', width: 8, height: 3, icon: '🧁', color: '#fed7aa', category: 'interior' },
                      ];
                      handleSaveFixtures([...fixtureTypes, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-md text-xs font-medium hover:bg-amber-100 transition-colors"
                  >
                    + 🍰 Food &amp; Drink
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: FixtureType[] = [
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Photo Booth', shape: 'rectangle', width: 8, height: 6, icon: '📸', color: '#e0e7ff', category: 'interior' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Guest Book Station', shape: 'rectangle', width: 4, height: 2, icon: '📖', color: '#fef3c7', category: 'interior' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Welcome Sign', shape: 'rectangle', width: 3, height: 4, icon: '✨', color: '#f3e8ff', category: 'interior' },
                      ];
                      handleSaveFixtures([...fixtureTypes, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-[#4A1942]/10 text-[#4A1942] rounded-md text-xs font-medium hover:bg-[#4A1942]/20 transition-colors"
                  >
                    + 📸 Guest Areas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: FixtureType[] = [
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Fountain', shape: 'circle', width: 8, height: 8, icon: '⛲', color: '#bfdbfe', category: 'exterior', pattern: 'water' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Garden Path', shape: 'rectangle', width: 20, height: 4, icon: '🪨', color: '#d6d3d1', category: 'exterior', pattern: 'gravel' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Pond', shape: 'oval', width: 15, height: 10, icon: '🦆', color: '#7dd3fc', category: 'exterior', pattern: 'water' },
                      ];
                      handleSaveFixtures([...fixtureTypes, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-md text-xs font-medium hover:bg-blue-100 transition-colors"
                  >
                    + 💧 Water
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: FixtureType[] = [
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Large Tree', shape: 'circle', width: 12, height: 12, icon: '🌳', color: '#166534', category: 'exterior' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Flower Bed', shape: 'oval', width: 8, height: 4, icon: '🌸', color: '#f9a8d4', category: 'exterior', pattern: 'grass' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Hedge Row', shape: 'rectangle', width: 20, height: 3, icon: '🌿', color: '#22c55e', category: 'exterior' },
                        { id: createEntityId('fixture', fixtureTypes.map((item) => item.id)), name: 'Lawn Area', shape: 'rectangle', width: 30, height: 20, icon: '🌱', color: '#86efac', category: 'exterior', pattern: 'grass' },
                      ];
                      handleSaveFixtures([...fixtureTypes, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-green-50 border border-green-200 text-green-700 rounded-md text-xs font-medium hover:bg-green-100 transition-colors"
                  >
                    + 🌿 Landscape
                  </button>
                </div>
              </div>

              {/* Integrated Fixture Search & Action Bar */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-400 text-xs">🔍</span>
                    <input
                      type="search"
                      value={fixtureSearch}
                      onChange={(e) => setFixtureSearch(e.target.value)}
                      placeholder="Search fixtures by name..."
                      className="w-48 pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2"
                      aria-label="Search fixtures"
                    />
                  </div>
                  <span className="text-gray-300">|</span>
                  <span className="text-xs text-gray-600 font-medium">
                    {fixtureTypes.length} fixture{fixtureTypes.length !== 1 ? 's' : ''} configured
                  </span>
                </div>
                
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const newFixture: FixtureType = {
                        id: createEntityId('fixture', fixtureTypes.map((item) => item.id)),
                        name: 'New Venue Fixture',
                        shape: 'rectangle',
                        width: 4,
                        height: 4,
                        icon: '📦',
                        color: '#E5E5E5',
                        category: 'interior'
                      };
                      handleSaveFixtures([...fixtureTypes, newFixture]);
                    }}
                    className="btn-primary px-3 py-1.5 bg-[#4A1942] hover:bg-[#3b1435] text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                    style={{ backgroundColor: config.primaryColor }}
                  >
                    + Venue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newFixture: FixtureType = {
                        id: createEntityId('fixture', fixtureTypes.map((item) => item.id)),
                        name: 'New Lodging/Utilities Fixture',
                        shape: 'rectangle',
                        width: 12,
                        height: 10,
                        icon: '🛏️',
                        color: '#E0F2FE',
                        category: 'lodging',
                        lodgingType: 'rooms',
                        isRoom: true,
                        capacity: 2,
                      };
                      handleSaveFixtures([...fixtureTypes, newFixture]);
                    }}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                  >
                    + Lodging
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newFixture: FixtureType = {
                        id: createEntityId('fixture', fixtureTypes.map((item) => item.id)),
                        name: 'New Architectural/Landscape Feature',
                        shape: 'rectangle',
                        width: 10,
                        height: 10,
                        icon: '🌳',
                        color: '#90EE90',
                        category: 'exterior'
                      };
                      handleSaveFixtures([...fixtureTypes, newFixture]);
                    }}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                  >
                    + Landscape
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDrawingTool(true)}
                    className="btn-primary px-3 py-1.5 text-white rounded-lg text-xs font-bold transition-opacity shadow-sm flex items-center gap-1"
                    style={{
                      background: `linear-gradient(135deg, ${config.primaryColor || '#4A1942'}, ${config.primaryDark || '#3d1a45'})`,
                    }}
                  >
                    <span>🎨</span>
                    <span>Draw Custom</span>
                  </button>
                </div>
              </div>

              {/* Venue Fixtures */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div
                  className="px-4 py-3 flex items-center justify-between cursor-pointer text-white shadow-sm transition-all"
                  style={{
                    background: `linear-gradient(135deg, ${config.primaryColor || '#4A1942'}, ${config.primaryDark || '#3d1a45'})`,
                  }}
                  onClick={() => setShowVenueFixturesSection(v => !v)}
                >
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-lg">{showVenueFixturesSection ? '▼' : '▶'}</span>
                    <span className="text-2xl">🏛️</span>
                    <div>
                      <h4 className="font-bold">Venue Fixtures</h4>
                      <p className="text-xs text-white/80">Interior items for your venue layout</p>
                    </div>
                    <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                      {fixtureTypes.filter(f => f.category !== 'exterior' && f.category !== 'lodging').length} items
                    </span>
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={expandAllVenueFixtures}
                      className="text-xs px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium transition-colors"
                    >
                      ▼ Expand All
                    </button>
                    <button
                      onClick={collapseAllVenueFixtures}
                      className="text-xs px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium transition-colors"
                    >
                      ▲ Collapse All
                    </button>
                  </div>
                </div>
                {showVenueFixturesSection && (
                <div className="p-4 bg-purple-50/50">
                {fixtureTypes.filter(f => f.category !== 'exterior' && f.category !== 'lodging').filter(matchesFixtureSearch).map(fixture => (
                  <div key={fixture.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-3">
                    <div 
                      className="bg-purple-50 px-4 py-3 border-b border-purple-200 flex items-center justify-between cursor-pointer hover:bg-purple-100 transition-colors"
                      onClick={() => toggleVenueFixtureExpanded(fixture.id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{expandedVenueFixtures.has(fixture.id) ? '▼' : '▶'}</span>
                        {/* Shape Preview */}
                        <svg width="32" height="32" className="flex-shrink-0">
                          {renderShapePreview(fixture.shape || 'rectangle', fixture.color || '#E5E5E5')}
                        </svg>
                        <span className="text-2xl">{fixture.icon}</span>
                        <span className="font-semibold text-purple-800">{fixture.name}</span>
                        {fixture.archived && <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-white">Archived</span>}
                        <CatalogRevisionStatus definition={fixture} definitions={fixtureTypes} compact />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                          {fixture.width}' × {fixture.height}'
                        </span>
                        {fixture.archived && !catalogFamilyStatus(fixtureTypes, fixture).hasActiveSibling && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveFixtures(fixtureTypes.map((candidate) => candidate.id === fixture.id
                                ? { ...candidate, archived: false }
                                : candidate));
                            }}
                            className="text-xs font-semibold text-green-700 px-2 py-1 hover:bg-green-100 rounded"
                          >
                            Restore
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmAction(
                              { title: 'Delete fixture?', message: `Delete fixture "${fixture.name}"?`, kind: 'danger', confirmLabel: 'Delete Fixture' },
                              () => handleSaveFixtures(fixtureTypes.filter(f => f.id !== fixture.id)),
                            );
                          }}
                          className="text-red-500 hover:text-red-700 text-sm px-2"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    {expandedVenueFixtures.has(fixture.id) && (
                    <div className="p-4 space-y-3">
                      <HistoricalRevisionNotice definition={fixture} definitions={fixtureTypes} />
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Name</label>
                          <input
                            type="text"
                            value={fixture.name}
                            onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, name: e.target.value } : f))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Shape</label>
                          <select
                            value={fixture.shape || 'rectangle'}
                            onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, shape: e.target.value as ShapeType } : f))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            {shapeOptions.map(s => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                        {/* Icon and Icon Visible - separate row for better spacing */}
                        <div className="col-span-2 sm:col-span-4 grid grid-cols-2 gap-4 bg-purple-50 p-3 rounded-lg border border-purple-200">
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Icon</label>
                            <EmojiPicker
                              value={fixture.icon || '📦'}
                              onChange={(emoji) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, icon: emoji } : f))}
                              position="bottom"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Icon Visible</label>
                            <div className="flex items-center h-[42px] bg-white rounded-lg border border-gray-200 px-3">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={fixture.showIconOnCanvas !== false}
                                  onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, showIconOnCanvas: e.target.checked } : f))}
                                  className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-sm text-gray-700">On Layout</span>
                              </label>
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Width (ft)</label>
                          <input
                            type="number"
                            value={fixture.width}
                            onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, width: parseFloat(e.target.value) || 4 } : f))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Height (ft)</label>
                          <input
                            type="number"
                            value={fixture.height}
                            onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, height: parseFloat(e.target.value) || 4 } : f))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Fill Color</label>
                          <div className="flex gap-1">
                            <input
                              type="color"
                              value={fixture.color || '#E5E5E5'}
                              onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, color: e.target.value } : f))}
                              className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Font Color</label>
                          <div className="flex gap-1">
                            <input
                              type="color"
                              value={fixture.fontColor || '#374151'}
                              onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, fontColor: e.target.value } : f))}
                              className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Pattern</label>
                          <select
                            value={fixture.pattern || 'solid'}
                            onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, pattern: e.target.value as PatternType, patternColors: defaultPatternColors[e.target.value as PatternType] } : f))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            {patternOptions.map(p => (
                              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {/* Pattern Colors for Venue Fixtures */}
                      {fixture.pattern && fixture.pattern !== 'solid' && (
                        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-amber-800">🎨 Pattern Colors</span>
                          </div>
                          <PatternColorPicker
                            pattern={fixture.pattern}
                            patternColors={fixture.patternColors}
                            onChange={(colors) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, patternColors: colors } : f))}
                          />
                        </div>
                      )}
                      {/* Border Settings */}
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-blue-800">🔲 Border Settings</span>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={fixture.showBorder || false}
                              onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { 
                                ...f, 
                                showBorder: e.target.checked,
                                borderColor: e.target.checked ? (f.borderColor || '#000000') : f.borderColor,
                                borderWidth: e.target.checked ? (f.borderWidth || 2) : f.borderWidth
                              } : f))}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-blue-700">Show Border</span>
                          </label>
                        </div>
                        {fixture.showBorder && (
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase">Border Color</label>
                              <div className="flex gap-1">
                                <input
                                  type="color"
                                  value={fixture.borderColor || '#000000'}
                                  onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, borderColor: e.target.value } : f))}
                                  className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                                />
                                <input
                                  type="text"
                                  value={fixture.borderColor || '#000000'}
                                  onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, borderColor: e.target.value } : f))}
                                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase">Border Width (px)</label>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                step="0.5"
                                value={fixture.borderWidth || 2}
                                onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, borderWidth: parseFloat(e.target.value) || 2 } : f))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Venue Category Availability - Venue Fixtures */}
                      <div className="mt-3 p-3 bg-[#4A1942]/10 rounded-lg border border-[#4A1942]/20">
                        <h4 className="text-sm font-semibold text-[#4A1942] mb-2 flex items-center gap-2">
                          🏛️ Venue Category Availability
                        </h4>
                        <p className="text-xs text-[#4A1942] mb-3">Choose which venue categories can use this venue fixture. Leave all unchecked to allow in all categories.</p>
                        <div className="flex flex-wrap gap-2">
                          {layoutCategories.map(cat => {
                            const selected = (fixture.venueCategories || []).includes(cat.id as any);
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                  const current = fixture.venueCategories || [];
                                  const venueCategories = selected
                                    ? current.filter(c => c !== cat.id)
                                    : [...current, cat.id as any];
                                  // F-251-2 (Review #251): the computed next
                                  // value was discarded — the toggle saved the
                                  // fixture unchanged, so category chips never
                                  // worked. Apply it to the edited fixture.
                                  handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, venueCategories } : f));
                                }}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selected ? 'bg-[#4A1942] text-white' : 'bg-white text-[#4A1942] border border-[#4A1942]/20 hover:bg-[#4A1942]/10'}`}
                              >
                                {cat.icon} {cat.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Inventory / Availability / Spacing - Venue Fixtures */}
                      <div className="mt-3 grid md:grid-cols-2 gap-3">
                        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-green-800">📦 Inventory</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                value={fixture.inventoryCount ?? ''}
                                onChange={(e) => {
                                  const value = e.target.value === '' ? undefined : parseInt(e.target.value);
                                  handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, inventoryCount: value } : f));
                                }}
                                className="w-20 px-2 py-1 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-center"
                                placeholder="∞"
                              />
                              <span className="text-sm text-green-600">
                                {fixture.inventoryCount === undefined ? 'Unlimited' : `${fixture.inventoryCount} available`}
                              </span>
                              {fixture.inventoryCount !== undefined && (
                                <button
                                  onClick={() => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, inventoryCount: undefined } : f))}
                                  className="text-xs text-green-600 hover:text-green-800 underline"
                                >
                                  Unlimited
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="p-3 bg-violet-50 rounded-lg border border-violet-200 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-violet-800">👥 User Availability</span>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={fixture.visibleToUsers !== false}
                                onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, visibleToUsers: e.target.checked } : f))}
                                className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                              />
                              <span className="text-sm text-violet-700 font-medium">Visible to Basic/Guest users</span>
                            </label>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-violet-800">📏 Spacing Rules</span>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={fixture.ignoreSpacingRules || false}
                                onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, ignoreSpacingRules: e.target.checked } : f))}
                                className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                              />
                              <span className="text-sm text-violet-700 font-medium">Ignore spacing guidelines</span>
                            </label>
                          </div>
                          <p className="text-xs text-violet-600">Enable this for venue fixtures that should be placeable anywhere on the full canvas.</p>
                          <div className="flex items-center justify-between gap-3 pt-2 border-t border-violet-100">
                            <span className="text-sm font-semibold text-violet-800">🎀 Decor Designer</span>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!fixture.allowAsDecorBase}
                                onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, allowAsDecorBase: e.target.checked } : f))}
                                className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                              />
                              <span className="text-sm text-violet-700 font-medium">Available in Decor Designer</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Fixture Image Gallery (up to 4 images) */}
                      <MultiImageUpload
                        images={fixture.images || []}
                        onChange={(images) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, images } : f))}
                        maxImages={4}
                        itemName="fixture"
                      />

                      {/* Delete button */}
                      <div className="flex justify-end pt-3 border-t border-gray-100">
                        <button
                          onClick={() => handleSaveFixtures(fixtureTypes.filter(f => f.id !== fixture.id))}
                          className="px-3 py-1 text-red-500 hover:bg-red-50 rounded text-sm"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                    )}
                  </div>
                ))}
                </div>
                )}
              </div>

              {/* Lodging/Utilities Fixtures */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div
                  className="px-4 py-3 flex items-center justify-between cursor-pointer text-white shadow-sm transition-all"
                  style={{
                    background: `linear-gradient(135deg, ${config.primaryColor || '#4A1942'}, ${config.primaryDark || '#3d1a45'})`,
                  }}
                  onClick={() => setShowLodgingFixturesSection(v => !v)}
                >
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-lg">{showLodgingFixturesSection ? '▼' : '▶'}</span>
                    <span className="text-2xl">🛏️</span>
                    <div>
                      <h4 className="font-bold">Lodging/Utilities Fixtures</h4>
                      <p className="text-xs text-white/80">Rooms and lodging furniture</p>
                    </div>
                    <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                      {fixtureTypes.filter(f => f.category === 'lodging').length} items
                    </span>
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={expandAllLodgingFixtures}
                      className="text-xs px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium transition-colors"
                    >
                      ▼ Expand All
                    </button>
                    <button
                      onClick={collapseAllLodgingFixtures}
                      className="text-xs px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium transition-colors"
                    >
                      ▲ Collapse All
                    </button>
                  </div>
                </div>
                {showLodgingFixturesSection && (
                <div className="p-4 bg-cyan-50/50">
                  {fixtureTypes.filter(f => f.category === 'lodging').filter(matchesFixtureSearch).map(fixture => (
                    <div key={fixture.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-3">
                      <div
                        className="bg-cyan-50 px-4 py-3 border-b border-cyan-200 flex items-center justify-between cursor-pointer hover:bg-cyan-100 transition-colors"
                        onClick={() => toggleLodgingFixtureExpanded(fixture.id)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{expandedLodgingFixtures.has(fixture.id) ? '▼' : '▶'}</span>
                          <svg width="32" height="32" className="flex-shrink-0">
                            {renderShapePreview(fixture.shape || 'rectangle', fixture.color || '#E0F2FE')}
                          </svg>
                          <span className="text-2xl">{fixture.icon || '🛏️'}</span>
                          <span className="font-semibold text-cyan-800">{fixture.name}</span>
                          {fixture.archived && <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-white">Archived</span>}
                        <CatalogRevisionStatus definition={fixture} definitions={fixtureTypes} compact />
                          <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-1 rounded">{(fixture.lodgingType || 'other').replace('entry-exit', 'entry/exit').replace(/^./, c => c.toUpperCase())}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-1 rounded">{fixture.width}' × {fixture.height}'</span>
                          {fixture.lodgingType === 'rooms' && <span className="text-xs bg-[#4A1942]/10 text-[#4A1942] px-2 py-1 rounded">Max {fixture.capacity || 0}</span>}
                          {fixture.archived && !catalogFamilyStatus(fixtureTypes, fixture).hasActiveSibling && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSaveFixtures(fixtureTypes.map((candidate) => candidate.id === fixture.id
                                  ? { ...candidate, archived: false }
                                  : candidate));
                              }}
                              className="text-xs font-semibold text-green-700 px-2 py-1 hover:bg-green-100 rounded"
                            >
                              Restore
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmAction(
                                { title: 'Delete lodging/utility fixture?', message: `Delete lodging/utility fixture "${fixture.name}"?`, kind: 'danger', confirmLabel: 'Delete Fixture' },
                                () => handleSaveFixtures(fixtureTypes.filter(f => f.id !== fixture.id)),
                              );
                            }}
                            className="text-red-500 hover:text-red-700 text-sm px-2"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      {expandedLodgingFixtures.has(fixture.id) && (
                        <div className="p-4 space-y-3">
                          <HistoricalRevisionNotice definition={fixture} definitions={fixtureTypes} />
                          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase">Name</label>
                              <input
                                type="text"
                                value={fixture.name}
                                onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, name: e.target.value } : f))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase">Shape</label>
                              <select
                                value={fixture.shape || 'rectangle'}
                                onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, shape: e.target.value as ShapeType } : f))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              >
                                {shapeOptions.map(s => (
                                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                ))}
                              </select>
                            </div>
                            <div className="col-span-2 sm:col-span-4 grid grid-cols-2 gap-4 bg-cyan-50 p-3 rounded-lg border border-cyan-200">
                              <div>
                                <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Icon</label>
                                <EmojiPicker
                                  value={fixture.icon || '🛏️'}
                                  onChange={(emoji) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, icon: emoji } : f))}
                                  position="bottom"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Icon Visible</label>
                                <div className="flex items-center h-[42px] bg-white rounded-lg border border-gray-200 px-3">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={fixture.showIconOnCanvas !== false}
                                      onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, showIconOnCanvas: e.target.checked } : f))}
                                      className="w-5 h-5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                                    />
                                    <span className="text-sm text-gray-700">On Layout</span>
                                  </label>
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase">Width (ft)</label>
                              <input
                                type="number"
                                value={fixture.width}
                                onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, width: parseFloat(e.target.value) || 12 } : f))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase">Height (ft)</label>
                              <input
                                type="number"
                                value={fixture.height}
                                onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, height: parseFloat(e.target.value) || 10 } : f))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase">Fill Color</label>
                              <div className="flex gap-1">
                                <input
                                  type="color"
                                  value={fixture.color || '#E0F2FE'}
                                  onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, color: e.target.value } : f))}
                                  className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase">Font Color</label>
                              <div className="flex gap-1">
                                <input
                                  type="color"
                                  value={fixture.fontColor || '#1F2937'}
                                  onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, fontColor: e.target.value } : f))}
                                  className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase">Pattern</label>
                              <select
                                value={fixture.pattern || 'solid'}
                                onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, pattern: e.target.value as PatternType, patternColors: defaultPatternColors[e.target.value as PatternType] } : f))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              >
                                {patternOptions.map(p => (
                                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="p-3 bg-[#4A1942]/10 rounded-lg border border-[#4A1942]/20">
                              <label className="text-xs font-medium text-gray-500 uppercase block mb-1">Type</label>
                              <select
                                value={fixture.lodgingType || 'other'}
                                onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? {
                                  ...f,
                                  lodgingType: e.target.value as FixtureType['lodgingType'],
                                  isRoom: e.target.value === 'rooms',
                                  capacity: e.target.value === 'rooms' ? (f.capacity || 2) : undefined,
                                  inventoryCount: e.target.value === 'rooms' ? undefined : f.inventoryCount
                                } : f))}
                                className="w-full px-3 py-2 border border-[#4A1942]/40 rounded-lg"
                              >
                                <option value="furniture">Furniture</option>
                                <option value="appliances">Appliances</option>
                                <option value="electronics">Electronics</option>
                                <option value="entry-exit">Entry/Exit Points</option>
                                <option value="utilities">Utilities</option>
                                <option value="rooms">Rooms</option>
                                <option value="other">Other</option>
                              </select>
                              <p className="text-xs text-[#4A1942] mt-2">Classify this lodging/utility item for easier organization and room behavior.</p>
                            </div>
                            {fixture.lodgingType === 'rooms' ? (
                              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                                <label className="text-xs font-medium text-gray-500 uppercase block mb-1">Max Occupancy</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="20"
                                  value={fixture.capacity || 2}
                                  onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, isRoom: true, lodgingType: 'rooms', capacity: Math.max(1, parseInt(e.target.value) || 1) } : f))}
                                  className="w-full px-3 py-2 border border-emerald-300 rounded-lg"
                                />
                                <p className="text-xs text-emerald-700 mt-2">Room-type items can hold guest assignments like tables.</p>
                              </div>
                            ) : (
                              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="text-sm font-semibold text-slate-700">Guest Assignment</div>
                                <p className="text-xs text-slate-600 mt-2">Set Type to <strong>Rooms</strong> to enable occupancy and guest assignment for this item.</p>
                              </div>
                            )}
                          </div>

                          {fixture.pattern && fixture.pattern !== 'solid' && (
                            <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold text-amber-800">🎨 Pattern Colors</span>
                              </div>
                              <PatternColorPicker
                                pattern={fixture.pattern}
                                patternColors={fixture.patternColors}
                                onChange={(colors) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, patternColors: colors } : f))}
                              />
                            </div>
                          )}

                          <MultiImageUpload
                            images={fixture.images || []}
                            onChange={(images) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, images } : f))}
                            maxImages={4}
                            itemName="lodging/utilities fixture"
                          />

                          <div className="flex justify-end pt-3 border-t border-gray-100">
                            <button
                              onClick={() => handleSaveFixtures(fixtureTypes.filter(f => f.id !== fixture.id))}
                              className="px-3 py-1 text-red-500 hover:bg-red-50 rounded text-sm"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                )}
              </div>
              
              {/* Exterior Fixtures */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div
                  className="px-4 py-3 flex items-center justify-between cursor-pointer text-white shadow-sm transition-all"
                  style={{
                    background: `linear-gradient(135deg, ${config.primaryColor || '#4A1942'}, ${config.primaryDark || '#3d1a45'})`,
                  }}
                  onClick={() => setShowExteriorFixturesSection(v => !v)}
                >
                  <div className="flex items-center gap-3 text-white">
                    <span className="text-lg">{showExteriorFixturesSection ? '▼' : '▶'}</span>
                    <span className="text-2xl">🌳</span>
                    <div>
                      <h4 className="font-bold">Architectural/Landscape Features</h4>
                      <p className="text-xs text-white/80">Exterior features (Admin Only)</p>
                    </div>
                    <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                      {fixtureTypes.filter(f => f.category === 'exterior').length} items
                    </span>
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={expandAllExteriorFixtures}
                      className="text-xs px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium transition-colors"
                    >
                      ▼ Expand All
                    </button>
                    <button
                      onClick={collapseAllExteriorFixtures}
                      className="text-xs px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium transition-colors"
                    >
                      ▲ Collapse All
                    </button>
                  </div>
                </div>
                {showExteriorFixturesSection && (
                <div className="p-4 bg-green-50/50">
                {fixtureTypes.filter(f => f.category === 'exterior').filter(matchesFixtureSearch).map(fixture => (
                  <div key={fixture.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-3">
                    <div 
                      className="bg-green-50 px-4 py-3 border-b border-green-200 flex items-center justify-between cursor-pointer hover:bg-green-100 transition-colors"
                      onClick={() => toggleExteriorFixtureExpanded(fixture.id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{expandedExteriorFixtures.has(fixture.id) ? '▼' : '▶'}</span>
                        {/* Shape Preview */}
                        <svg width="32" height="32" className="flex-shrink-0">
                          {renderShapePreview(fixture.shape || 'rectangle', fixture.color || '#90EE90')}
                        </svg>
                        <span className="text-2xl">{fixture.icon}</span>
                        <span className="font-semibold text-green-800">{fixture.name}</span>
                        {fixture.archived && <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-white">Archived</span>}
                        <CatalogRevisionStatus definition={fixture} definitions={fixtureTypes} compact />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                          {fixture.width}' × {fixture.height}'
                        </span>
                        {fixture.archived && !catalogFamilyStatus(fixtureTypes, fixture).hasActiveSibling && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveFixtures(fixtureTypes.map((candidate) => candidate.id === fixture.id
                                ? { ...candidate, archived: false }
                                : candidate));
                            }}
                            className="text-xs font-semibold text-green-700 px-2 py-1 hover:bg-green-100 rounded"
                          >
                            Restore
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmAction(
                              { title: 'Delete feature?', message: `Delete feature "${fixture.name}"?`, kind: 'danger', confirmLabel: 'Delete Feature' },
                              () => handleSaveFixtures(fixtureTypes.filter(f => f.id !== fixture.id)),
                            );
                          }}
                          className="text-red-500 hover:text-red-700 text-sm px-2"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    {expandedExteriorFixtures.has(fixture.id) && (
                    <div className="p-4 space-y-3">
                      <HistoricalRevisionNotice definition={fixture} definitions={fixtureTypes} />
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Name</label>
                          <input
                            type="text"
                            value={fixture.name}
                            onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, name: e.target.value } : f))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Shape</label>
                          <select
                            value={fixture.shape || 'rectangle'}
                            onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, shape: e.target.value as ShapeType } : f))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            {shapeOptions.map(s => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                        {/* Icon and Icon Visible - separate row for better spacing */}
                        <div className="col-span-2 sm:col-span-4 grid grid-cols-2 gap-4 bg-green-50 p-3 rounded-lg border border-green-200">
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Icon</label>
                            <EmojiPicker
                              value={fixture.icon || '🌳'}
                              onChange={(emoji) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, icon: emoji } : f))}
                              position="bottom"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 uppercase mb-1 block">Icon Visible</label>
                            <div className="flex items-center h-[42px] bg-white rounded-lg border border-gray-200 px-3">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={fixture.showIconOnCanvas !== false}
                                  onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, showIconOnCanvas: e.target.checked } : f))}
                                  className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                />
                                <span className="text-sm text-gray-700">On Layout</span>
                              </label>
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Width (ft)</label>
                          <input
                            type="number"
                            value={fixture.width}
                            onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, width: parseFloat(e.target.value) || 10 } : f))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Height (ft)</label>
                          <input
                            type="number"
                            value={fixture.height}
                            onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, height: parseFloat(e.target.value) || 10 } : f))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Fill Color</label>
                          <div className="flex gap-1">
                            <input
                              type="color"
                              value={fixture.color || '#90EE90'}
                              onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, color: e.target.value } : f))}
                              className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Font Color</label>
                          <div className="flex gap-1">
                            <input
                              type="color"
                              value={fixture.fontColor || '#374151'}
                              onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, fontColor: e.target.value } : f))}
                              className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase">Pattern</label>
                          <select
                            value={fixture.pattern || 'solid'}
                            onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, pattern: e.target.value as PatternType, patternColors: defaultPatternColors[e.target.value as PatternType] } : f))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            {patternOptions.map(p => (
                              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {/* Pattern Colors for Exterior Fixtures */}
                      {fixture.pattern && fixture.pattern !== 'solid' && (
                        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-amber-800">🎨 Pattern Colors</span>
                          </div>
                          <PatternColorPicker
                            pattern={fixture.pattern}
                            patternColors={fixture.patternColors}
                            onChange={(colors) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, patternColors: colors } : f))}
                          />
                        </div>
                      )}
                      {/* Border Settings */}
                      <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-green-800">🔲 Border Settings</span>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={fixture.showBorder || false}
                              onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { 
                                ...f, 
                                showBorder: e.target.checked,
                                borderColor: e.target.checked ? (f.borderColor || '#000000') : f.borderColor,
                                borderWidth: e.target.checked ? (f.borderWidth || 2) : f.borderWidth
                              } : f))}
                              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                            />
                            <span className="text-sm font-medium text-green-700">Show Border</span>
                          </label>
                        </div>
                        {fixture.showBorder && (
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase">Border Color</label>
                              <div className="flex gap-1">
                                <input
                                  type="color"
                                  value={fixture.borderColor || '#000000'}
                                  onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, borderColor: e.target.value } : f))}
                                  className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                                />
                                <input
                                  type="text"
                                  value={fixture.borderColor || '#000000'}
                                  onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, borderColor: e.target.value } : f))}
                                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-500 uppercase">Border Width (px)</label>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                step="0.5"
                                value={fixture.borderWidth || 2}
                                onChange={(e) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, borderWidth: parseFloat(e.target.value) || 2 } : f))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Fixture Image Gallery (up to 4 images) */}
                      <MultiImageUpload
                        images={fixture.images || []}
                        onChange={(images) => handleSaveFixtures(fixtureTypes.map(f => f.id === fixture.id ? { ...f, images } : f))}
                        maxImages={4}
                        itemName="feature"
                      />

                      {/* Delete button */}
                      <div className="flex justify-end pt-3 border-t border-gray-100">
                        <button
                          onClick={() => handleSaveFixtures(fixtureTypes.filter(f => f.id !== fixture.id))}
                          className="px-3 py-1 text-red-500 hover:bg-red-50 rounded text-sm"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                    )}
                  </div>
                ))}
                </div>
                )}
              </div>
    </div>
  );
}
