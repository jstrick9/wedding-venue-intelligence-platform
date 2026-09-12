import { BrandedSectionHeader, BrandedStatCard } from './shared/AdminSharedComponents';
import { LayoutCategory, LayoutTemplate } from '../../types';
import type { AdminCommonProps } from './AdminTabTypes';
import { layoutSeatCount } from '../../utils/layoutSeating';
import { createEntityId } from '../../utils/entityId';

export function TemplateManagement(props: AdminCommonProps) {
  const {
    config,
    venues,
    tables: tableSpecs,
    templates,
    confirmAction,
    layoutCategories,
    handleSaveTemplates,
    handleCreateTemplateFromLayout,
    editingTemplateId,
    handleLoadForEdit,
    handleUpdateTemplateWithCurrentLayout,
    setEditingTemplateId,
    expandedTemplates,
    setExpandedTemplates,
  } = props;

  return (
    <div className="space-y-4">
      <div className="space-y-6">
              {/* Header */}
              <BrandedSectionHeader
                icon="📋"
                title="Layout Templates"
                description="Create reusable layouts for quick event setup"
                config={config}
              />

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <BrandedStatCard
                  value={templates.length}
                  label="Total Templates"
                  icon="📋"
                  config={config}
                />
                <BrandedStatCard
                  value={templates.filter(t => t.isMasterTemplate).length}
                  label="★ Master"
                  icon="⭐"
                  config={config}
                  variant="accent"
                />
                <BrandedStatCard
                  value={templates.filter(t => t.category === 'reception').length}
                  label="Reception"
                  icon="🎉"
                  config={config}
                />
                <BrandedStatCard
                  value={templates.filter(t => t.category === 'ceremony').length}
                  label="Ceremony"
                  icon="💒"
                  config={config}
                />
                <BrandedStatCard
                  value={templates.filter(t => t.category === 'cocktail').length}
                  label="Cocktail"
                  icon="🍸"
                  config={config}
                  variant="success"
                />
              </div>

              {/* Action Bar */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        const allIds = templates.map(t => t.id);
                        if (expandedTemplates.size === allIds.length) {
                          setExpandedTemplates(new Set());
                        } else {
                          setExpandedTemplates(new Set(allIds));
                        }
                      }}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                    >
                      {expandedTemplates.size === templates.length ? '▲ Collapse All' : '▼ Expand All'}
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => {
                        const masterTemplates = templates.filter(t => t.isMasterTemplate);
                        setExpandedTemplates(new Set(masterTemplates.map(t => t.id)));
                      }}
                      className="px-3 py-2 text-[#4A1942] bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors text-sm font-medium"
                    >
                      Show Masters Only
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        const newTemplate: LayoutTemplate = {
                          id: createEntityId('template', templates.map((template) => template.id)),
                          name: 'New Template',
                          description: 'Template description',
                          venueId: venues[0]?.id || 'pavilion',
                          category: 'reception',
                          tables: [],
                          fixtures: [],
                          isMasterTemplate: false,
                          createdAt: new Date().toISOString()
                        };
                        handleSaveTemplates([...templates, newTemplate]);
                        setExpandedTemplates(prev => new Set([...prev, newTemplate.id]));
                      }}
                      className="px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all font-medium shadow-sm flex items-center gap-2"
                    >
                      <span>📄</span>
                      <span>+ Blank Template</span>
                    </button>
                    <button
                      onClick={handleCreateTemplateFromLayout}
                      className="btn-primary px-4 py-2.5 bg-[#4A1942] hover:bg-[#3b1435] text-white rounded-lg transition-all font-bold shadow-sm flex items-center gap-2"
                      style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                    >
                      <span>🎨</span>
                      <span>+ From Current Layout</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Category Filter Tabs */}
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all', label: 'All Templates', icon: '📋', count: templates.length },
                  { id: 'master', label: 'Masters Only', icon: '★', count: templates.filter(t => t.isMasterTemplate).length },
                  ...layoutCategories.map(cat => ({
                    id: cat.id,
                    label: cat.name,
                    icon: cat.icon,
                    count: templates.filter(t => t.category === cat.id).length
                  }))
                ].map(tab => (
                  <button
                    key={tab.id}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      tab.count === 0 
                        ? 'bg-gray-50 text-gray-400 cursor-not-allowed' 
                        : 'bg-white border border-gray-200 text-gray-700 hover:border-[#4A1942] hover:text-[#4A1942]'
                    }`}
                    disabled={tab.count === 0}
                    onClick={() => {
                      if (tab.id === 'all') {
                        setExpandedTemplates(new Set(templates.map(t => t.id)));
                      } else if (tab.id === 'master') {
                        setExpandedTemplates(new Set(templates.filter(t => t.isMasterTemplate).map(t => t.id)));
                      } else {
                        setExpandedTemplates(new Set(templates.filter(t => t.category === tab.id).map(t => t.id)));
                      }
                    }}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{tab.count}</span>
                  </button>
                ))}
              </div>
              
              {/* How To Guide - Collapsible */}
              <details className="bg-gradient-to-r from-blue-50 to-[#4A1942]/5 border border-blue-200 rounded-xl overflow-hidden">
                <summary className="p-4 cursor-pointer hover:bg-blue-100/50 transition-colors flex items-center gap-3">
                  <span className="text-2xl">💡</span>
                  <span className="font-semibold text-blue-800">How to Create & Manage Templates</span>
                  <span className="ml-auto text-blue-400 text-sm">Click to expand</span>
                </summary>
                <div className="p-4 pt-2 border-t border-blue-200 bg-white/50">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center font-bold">1</span>
                        <h5 className="font-semibold text-gray-800">Create from Layout</h5>
                      </div>
                      <p className="text-sm text-gray-600">Design your perfect layout in the main canvas with tables, fixtures, and decorations. Then click "From Current Layout" to save it as a reusable template.</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">2</span>
                        <h5 className="font-semibold text-gray-800">Edit Existing Template</h5>
                      </div>
                      <p className="text-sm text-gray-600">Click "Load for Editing" to load a template into the canvas. Make your changes, then click "Update with Current Layout" to save the modifications.</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-8 h-8 bg-[#4A1942]/10 text-[#4A1942] rounded-full flex items-center justify-center font-bold">3</span>
                        <h5 className="font-semibold text-gray-800">Master Templates</h5>
                      </div>
                      <p className="text-sm text-gray-600">Mark templates as "Master" to make them available to basic users. Only admins can create and edit master templates.</p>
                    </div>
                  </div>
                </div>
              </details>
              
              {templates.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-gray-200">
                  <div className="text-6xl mb-4">📋</div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">No Templates Yet</h3>
                  <p className="text-gray-500 mb-4 max-w-md mx-auto">
                    Create your first template by designing a layout in the main canvas, then clicking "From Current Layout"
                  </p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => {
                        const newTemplate: LayoutTemplate = {
                          id: createEntityId('template', templates.map((template) => template.id)),
                          name: 'My First Template',
                          description: 'A new layout template',
                          venueId: venues[0]?.id || 'pavilion',
                          category: 'reception',
                          tables: [],
                          fixtures: [],
                          isMasterTemplate: false,
                          createdAt: new Date().toISOString()
                        };
                        handleSaveTemplates([...templates, newTemplate]);
                        setExpandedTemplates(prev => new Set([...prev, newTemplate.id]));
                      }}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all font-medium"
                    >
                      📄 Create Blank Template
                    </button>
                    <button
                      onClick={handleCreateTemplateFromLayout}
                      className="px-4 py-2 bg-[#4A1942] text-white rounded-lg hover:bg-[#5c2a64] transition-all font-medium"
                    >
                      🎨 From Current Layout
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {templates.map(template => {
                    const venue = venues.find(v => v.id === template.venueId);
                    const category = layoutCategories.find(c => c.id === template.category);
                    const isEditing = editingTemplateId === template.id;
                    const isExpanded = expandedTemplates.has(template.id);
                    const totalItems = (template.tables?.length || 0) + (template.fixtures?.length || 0);
                    
                    return (
                      <div 
                        key={template.id} 
                        className={`bg-white rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-md ${
                          isEditing ? 'ring-2 ring-[#4A1942] ring-offset-2' : 'border border-gray-200'
                        }`}
                      >
                        {/* Card Header */}
                        <div 
                          className="relative cursor-pointer group"
                          onClick={() => {
                            setExpandedTemplates(prev => {
                              const next = new Set(prev);
                              if (next.has(template.id)) {
                                next.delete(template.id);
                              } else {
                                next.add(template.id);
                              }
                              return next;
                            });
                          }}
                        >
                          {/* Gradient header based on category */}
                          <div 
                            className="h-2"
                            style={{ 
                              background: category?.color 
                                ? `linear-gradient(to right, ${category.color}, ${category.color}88)` 
                                : 'linear-gradient(to right, #6b7280, #9ca3af)'
                            }}
                          />
                          
                          <div className="px-4 py-3 flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {/* Category Icon with background */}
                              <div 
                                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm"
                                style={{ 
                                  backgroundColor: category?.color ? `${category.color}15` : '#f3f4f6'
                                }}
                              >
                                {category?.icon || '📋'}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-bold text-gray-800 truncate">{template.name}</h4>
                                  {template.isMasterTemplate && (
                                    <span className="px-2 py-0.5 bg-gradient-to-r from-[#4A1942] to-[#6b2d63] text-white text-xs font-medium rounded-full flex items-center gap-1 flex-shrink-0">
                                      <span>★</span> Master
                                    </span>
                                  )}
                                  {isEditing && (
                                    <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded-full animate-pulse flex-shrink-0">
                                      ✏️ Editing
                                    </span>
                                  )}
                                </div>
                                
                                {/* Quick Info */}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                                  <span className="flex items-center gap-1">
                                    <span>🏛️</span>
                                    <span>{venue?.name || 'Unknown Venue'}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span>{category?.icon}</span>
                                    <span>{category?.name || template.category}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span>📦</span>
                                    <span>{totalItems} items</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Expand/Collapse Indicator */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                ▼
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Expanded Content */}
                        {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50/50">
                          {/* Quick Stats Row */}
                          <div className="grid grid-cols-4 gap-px bg-gray-200 border-b border-gray-200">
                            <div className="bg-white p-3 text-center">
                              <div className="text-lg font-bold text-blue-600">{template.tables?.length || 0}</div>
                              <div className="text-xs text-gray-500">Tables</div>
                            </div>
                            <div className="bg-white p-3 text-center">
                              <div className="text-lg font-bold text-purple-600">{template.fixtures?.length || 0}</div>
                              <div className="text-xs text-gray-500">Fixtures</div>
                            </div>
                            <div className="bg-white p-3 text-center">
                              <div className="text-lg font-bold text-green-600">
                                {layoutSeatCount(template.tables || [], tableSpecs, template.ceremonyRows || [])}
                              </div>
                              <div className="text-xs text-gray-500">Seats</div>
                            </div>
                            <div className="bg-white p-3 text-center">
                              <div className="text-lg font-bold text-gray-600">
                                {template.createdAt ? new Date(template.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                              </div>
                              <div className="text-xs text-gray-500">Created</div>
                            </div>
                          </div>
                          
                          {/* Form Fields */}
                          <div className="p-4 space-y-4">
                            {/* Name & Venue Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="bg-white rounded-lg p-3 border border-gray-200">
                                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase mb-2">
                                  <span>📝</span> Template Name
                                </label>
                                <input
                                  type="text"
                                  value={template.name}
                                  onChange={(e) => handleSaveTemplates(templates.map(t => t.id === template.id ? { ...t, name: e.target.value } : t))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4A1942]/20 focus:border-[#4A1942]"
                                  placeholder="Enter template name"
                                />
                              </div>
                              <div className="bg-white rounded-lg p-3 border border-gray-200">
                                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase mb-2">
                                  <span>🏛️</span> Venue
                                </label>
                                <select
                                  value={template.venueId}
                                  onChange={(e) => handleSaveTemplates(templates.map(t => t.id === template.id ? { ...t, venueId: e.target.value } : t))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4A1942]/20 focus:border-[#4A1942]"
                                >
                                  {venues.map(v => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            
                            {/* Description */}
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase mb-2">
                                <span>📄</span> Description
                              </label>
                              <textarea
                                value={template.description || ''}
                                onChange={(e) => handleSaveTemplates(templates.map(t => t.id === template.id ? { ...t, description: e.target.value } : t))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4A1942]/20 focus:border-[#4A1942]"
                                rows={2}
                                placeholder="Describe this template..."
                              />
                            </div>
                            
                            {/* Category & Master Toggle Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="bg-white rounded-lg p-3 border border-gray-200">
                                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 uppercase mb-2">
                                  <span>🏷️</span> Category
                                </label>
                                <select
                                  value={template.category}
                                  onChange={(e) => handleSaveTemplates(templates.map(t => t.id === template.id ? { ...t, category: e.target.value as LayoutCategory } : t))}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#4A1942]/20 focus:border-[#4A1942]"
                                >
                                  {layoutCategories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="bg-gradient-to-br from-[#4A1942]/5 to-[#4A1942]/10 rounded-lg p-3 border border-[#4A1942]/20">
                                <label className="flex items-center gap-2 text-xs font-semibold text-[#4A1942] uppercase mb-2">
                                  <span>★</span> Master Template
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer">
                                  <div className="relative">
                                    <input
                                      type="checkbox"
                                      checked={template.isMasterTemplate || false}
                                      onChange={(e) => handleSaveTemplates(templates.map(t => t.id === template.id ? { ...t, isMasterTemplate: e.target.checked } : t))}
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-[#4A1942]/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#4A1942]"></div>
                                  </div>
                                  <span className="text-sm font-medium text-gray-700">
                                    {template.isMasterTemplate ? 'Available to all users' : 'Admin only'}
                                  </span>
                                </label>
                              </div>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="pt-3 border-t border-gray-200">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleLoadForEdit(template)}
                                  className="btn-primary flex-1 sm:flex-none px-4 py-2.5 bg-[#4A1942] hover:bg-[#3b1435] text-white rounded-lg text-sm font-bold shadow-sm flex items-center justify-center gap-2"
                                  style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                                >
                                  <span>📝</span> Load for Editing
                                </button>
                                {isEditing ? (
                                  <button
                                    onClick={() => handleUpdateTemplateWithCurrentLayout(template.id)}
                                    className="flex-1 sm:flex-none px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 rounded-lg text-sm font-medium shadow-sm flex items-center justify-center gap-2 animate-pulse"
                                  >
                                    <span>✓</span> Save Current Layout
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setEditingTemplateId(template.id)}
                                    className="flex-1 sm:flex-none px-4 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 rounded-lg text-sm font-medium shadow-sm flex items-center justify-center gap-2"
                                  >
                                    <span>🔄</span> Update Layout
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    // Duplicate template
                                    const duplicated: LayoutTemplate = {
                                      ...template,
                                      id: createEntityId('template', templates.map((template) => template.id)),
                                      name: `${template.name} (Copy)`,
                                      isMasterTemplate: false,
                                      createdAt: new Date().toISOString()
                                    };
                                    handleSaveTemplates([...templates, duplicated]);
                                    setExpandedTemplates(prev => new Set([...prev, duplicated.id]));
                                  }}
                                  className="px-4 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                                >
                                  <span>📋</span> Duplicate
                                </button>
                                <button
                                  onClick={() => {
                                    confirmAction(
                                      { title: 'Delete template?', message: `Are you sure you want to delete "${template.name}"?`, kind: 'danger', confirmLabel: 'Delete Template' },
                                      () => handleSaveTemplates(templates.filter(t => t.id !== template.id)),
                                    );
                                  }}
                                  className="px-4 py-2.5 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                                >
                                  <span>🗑️</span> Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
    </div>
  );
}
