import { BrandedSectionHeader, BrandedStatCard, BrandedTips } from './shared/AdminSharedComponents';
import { Guideline } from '../../types';
import type { AdminCommonProps } from './AdminTabTypes';
import { createEntityId } from '../../utils/entityId';

export function GuidelineManagement(props: AdminCommonProps) {
  const {
    config,
    guidelines,
    confirmAction,
    handleSaveGuidelines,
    expandedGuidelines,
    setExpandedGuidelines,
  } = props;

  return (
    <div className="space-y-4">
      <div className="space-y-6">
              {/* Header */}
              <BrandedSectionHeader
                icon="📋"
                title="Layout Guidelines"
                description="Tips, rules, and best practices for creating optimal event layouts"
                config={config}
              />

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <BrandedStatCard
                  value={guidelines.length}
                  label="Total Guidelines"
                  icon="📋"
                  config={config}
                />
                <BrandedStatCard
                  value={guidelines.filter(g => g.enabled).length}
                  label="Active"
                  icon="✓"
                  config={config}
                  variant="success"
                />
                <BrandedStatCard
                  value={guidelines.filter(g => !g.enabled).length}
                  label="Disabled"
                  icon="○"
                  config={config}
                />
                <BrandedStatCard
                  value={guidelines.filter(g => g.category === 'important').length || 0}
                  label="Important"
                  icon="🚨"
                  config={config}
                  variant="accent"
                />
              </div>

              {/* Compact 1-Row Guideline Quick Presets */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-gray-500">✨ Quick Presets:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const presets: Guideline[] = [
                        { id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)), title: 'Table Spacing', description: 'Maintain 3-4 feet between tables for server access and guest movement.', enabled: true, category: 'spacing' as const, icon: '📏' },
                        { id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)), title: 'Dance Floor Clearance', description: 'Keep at least 5 feet clearance around the dance floor for safety.', enabled: true, category: 'safety' as const, icon: '💃' },
                        { id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)), title: 'Emergency Exits', description: 'Never block emergency exits or fire lanes with tables or fixtures.', enabled: true, category: 'important' as const, icon: '🚨' },
                      ];
                      handleSaveGuidelines([...guidelines, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-xs font-medium hover:bg-amber-100 transition-colors"
                  >
                    + ✨ Spacing &amp; Safety
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: Guideline[] = [
                        { id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)), title: 'Head Table Placement', description: 'Position the head table in a prominent location visible to all guests.', enabled: true, category: 'tips' as const, icon: '👑' },
                        { id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)), title: 'Gift Table Location', description: 'Place gift table near the entrance for easy drop-off by guests.', enabled: true, category: 'tips' as const, icon: '🎁' },
                        { id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)), title: 'Photo Booth Space', description: 'Allow 10x10 feet minimum for photo booth setup with backdrop.', enabled: true, category: 'tips' as const, icon: '📸' },
                      ];
                      handleSaveGuidelines([...guidelines, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-md text-xs font-medium hover:bg-purple-100 transition-colors"
                  >
                    + 💒 Wedding Tips
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: Guideline[] = [
                        { id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)), title: 'ADA Accessibility', description: 'Ensure 36-inch minimum aisle width for wheelchair access.', enabled: true, category: 'important' as const, icon: '♿' },
                        { id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)), title: 'Accessible Seating', description: 'Reserve accessible seating near aisles and exits.', enabled: true, category: 'important' as const, icon: '🪑' },
                      ];
                      handleSaveGuidelines([...guidelines, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-md text-xs font-medium hover:bg-blue-100 transition-colors"
                  >
                    + ♿ Accessibility
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const presets: Guideline[] = [
                        { id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)), title: 'Buffet Flow', description: 'Create a one-way traffic flow around buffet tables to prevent congestion.', enabled: true, category: 'tips' as const, icon: '🍽️' },
                        { id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)), title: 'Bar Placement', description: 'Position bar away from dance floor to separate drinking and dancing areas.', enabled: true, category: 'tips' as const, icon: '🍸' },
                        { id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)), title: 'Cake Table Visibility', description: 'Place cake table where it can be photographed with good lighting.', enabled: true, category: 'tips' as const, icon: '🎂' },
                      ];
                      handleSaveGuidelines([...guidelines, ...presets]);
                    }}
                    className="px-2.5 py-1 bg-green-50 border border-green-200 text-green-800 rounded-md text-xs font-medium hover:bg-green-100 transition-colors"
                  >
                    + 🍽️ Food &amp; Bar
                  </button>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const allIds = guidelines.map(g => g.id);
                      if (expandedGuidelines.size === allIds.length) {
                        setExpandedGuidelines(new Set());
                      } else {
                        setExpandedGuidelines(new Set(allIds));
                      }
                    }}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    {expandedGuidelines.size === guidelines.length ? '▲ Collapse All' : '▼ Expand All'}
                  </button>
                  <button
                    onClick={() => handleSaveGuidelines(guidelines.map(g => ({ ...g, enabled: true })))}
                    className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
                  >
                    ✓ Enable All
                  </button>
                  <button
                    onClick={() => handleSaveGuidelines(guidelines.map(g => ({ ...g, enabled: false })))}
                    className="px-3 py-2 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    ○ Disable All
                  </button>
                </div>
                <button
                  onClick={() => {
                    const newGuideline: Guideline = {
                      id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)),
                      title: 'New Guideline',
                      description: 'Enter your guideline description here...',
                      enabled: true,
                      category: 'general',
                      icon: '📝'
                    };
                    handleSaveGuidelines([...guidelines, newGuideline]);
                    setExpandedGuidelines(prev => new Set([...prev, newGuideline.id]));
                  }}
                  className="btn-primary px-4 py-2.5 bg-[#4A1942] hover:bg-[#3b1435] text-white rounded-lg hover:shadow-lg transition-all font-bold flex items-center gap-2 shadow-sm"
                  style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                >
                  <span className="text-lg">➕</span> Add Custom Guideline
                </button>
              </div>

              {/* Category Legend */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full">🚨 Important</span>
                <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full">📏 Spacing</span>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full">🛡️ Safety</span>
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full">💡 Tips</span>
                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full">📝 General</span>
              </div>

              {/* Guidelines List */}
              {guidelines.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center border-2 border-dashed border-gray-200">
                  <div className="text-5xl mb-4">📋</div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">No Guidelines Yet</h3>
                  <p className="text-gray-500 mb-4">Add guidelines to help users create better layouts</p>
                  <button
                    onClick={() => {
                      const newGuideline: Guideline = {
                        id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)),
                        title: 'My First Guideline',
                        description: 'Enter your guideline description here...',
                        enabled: true,
                        category: 'general',
                        icon: '📝'
                      };
                      handleSaveGuidelines([newGuideline]);
                      setExpandedGuidelines(new Set([newGuideline.id]));
                    }}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors font-medium"
                  >
                    Create Your First Guideline
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {guidelines.map((guideline, index) => {
                    const categoryColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
                      important: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', badge: 'bg-red-100 text-red-700' },
                      spacing: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700' },
                      safety: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
                      tips: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700' },
                      general: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800', badge: 'bg-gray-100 text-gray-700' }
                    };
                    const cat = (guideline as any).category || 'general';
                    const colors = categoryColors[cat] || categoryColors.general;
                    const guidelineIcon = (guideline as any).icon || '📋';
                    
                    return (
                      <div 
                        key={guideline.id} 
                        className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all hover:shadow-md ${!guideline.enabled ? 'opacity-60' : ''}`}
                      >
                        {/* Header */}
                        <div 
                          className={`${colors.bg} px-4 py-3 border-b ${colors.border} flex items-center justify-between cursor-pointer hover:brightness-95 transition-all`}
                          onClick={() => {
                            setExpandedGuidelines(prev => {
                              const next = new Set(prev);
                              if (next.has(guideline.id)) {
                                next.delete(guideline.id);
                              } else {
                                next.add(guideline.id);
                              }
                              return next;
                            });
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400 text-sm font-medium">#{index + 1}</span>
                            <span className="text-xl">{guidelineIcon}</span>
                            <div>
                              <span className={`font-semibold ${colors.text}`}>{guideline.title}</span>
                              {!expandedGuidelines.has(guideline.id) && (
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1 max-w-md">{guideline.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors.badge}`}>
                              {cat.charAt(0).toUpperCase() + cat.slice(1)}
                            </span>
                            {/* Toggle Switch */}
                            <button
                              onClick={() => handleSaveGuidelines(guidelines.map(g => g.id === guideline.id ? { ...g, enabled: !g.enabled } : g))}
                              className={`relative w-12 h-6 rounded-full transition-colors ${guideline.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                            >
                              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${guideline.enabled ? 'left-7' : 'left-1'}`} />
                            </button>
                            <span className="text-gray-400">{expandedGuidelines.has(guideline.id) ? '▼' : '▶'}</span>
                          </div>
                        </div>
                        
                        {/* Expanded Content */}
                        {expandedGuidelines.has(guideline.id) && (
                          <div className="p-5 space-y-4 bg-white">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Title */}
                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                  <span>📌</span> Title
                                </label>
                                <input
                                  type="text"
                                  value={guideline.title}
                                  onChange={(e) => handleSaveGuidelines(guidelines.map(g => g.id === guideline.id ? { ...g, title: e.target.value } : g))}
                                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-gray-50"
                                  placeholder="Guideline title..."
                                />
                              </div>
                              
                              {/* Category & Icon */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                    <span>🏷️</span> Category
                                  </label>
                                  <select
                                    value={guideline.category || 'general'}
                                    onChange={(e) => handleSaveGuidelines(guidelines.map(g => g.id === guideline.id ? { ...g, category: e.target.value as Guideline['category'] } : g))}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-gray-50"
                                  >
                                    <option value="important">🚨 Important</option>
                                    <option value="spacing">📏 Spacing</option>
                                    <option value="safety">🛡️ Safety</option>
                                    <option value="tips">💡 Tips</option>
                                    <option value="general">📝 General</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                    <span>🎨</span> Icon
                                  </label>
                                  <select
                                    value={(guideline as any).icon || '📋'}
                                    onChange={(e) => handleSaveGuidelines(guidelines.map(g => g.id === guideline.id ? { ...g, icon: e.target.value } : g))}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-gray-50"
                                  >
                                    <option value="📋">📋 Clipboard</option>
                                    <option value="📏">📏 Ruler</option>
                                    <option value="📐">📐 Triangle Ruler</option>
                                    <option value="🚨">🚨 Emergency</option>
                                    <option value="⚠️">⚠️ Warning</option>
                                    <option value="💡">💡 Tip</option>
                                    <option value="✅">✅ Check</option>
                                    <option value="❌">❌ No</option>
                                    <option value="♿">♿ Accessible</option>
                                    <option value="🪑">🪑 Chair</option>
                                    <option value="🍽️">🍽️ Dining</option>
                                    <option value="💃">💃 Dance</option>
                                    <option value="🎂">🎂 Cake</option>
                                    <option value="🎁">🎁 Gift</option>
                                    <option value="📸">📸 Photo</option>
                                    <option value="🎵">🎵 Music</option>
                                    <option value="🍸">🍸 Bar</option>
                                    <option value="👑">👑 VIP</option>
                                    <option value="🚪">🚪 Exit</option>
                                    <option value="🔥">🔥 Fire</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                            
                            {/* Description */}
                            <div className="space-y-1">
                              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                <span>📝</span> Description
                              </label>
                              <textarea
                                value={guideline.description}
                                onChange={(e) => handleSaveGuidelines(guidelines.map(g => g.id === guideline.id ? { ...g, description: e.target.value } : g))}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-gray-50 resize-none"
                                rows={3}
                                placeholder="Enter a helpful description for this guideline..."
                              />
                              <p className="text-xs text-gray-400">{(guideline.description || '').length} characters</p>
                            </div>
                            
                            {/* Actions */}
                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    if (index > 0) {
                                      const newGuidelines = [...guidelines];
                                      [newGuidelines[index - 1], newGuidelines[index]] = [newGuidelines[index], newGuidelines[index - 1]];
                                      handleSaveGuidelines(newGuidelines);
                                    }
                                  }}
                                  disabled={index === 0}
                                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Move Up"
                                >
                                  ⬆️
                                </button>
                                <button
                                  onClick={() => {
                                    if (index < guidelines.length - 1) {
                                      const newGuidelines = [...guidelines];
                                      [newGuidelines[index], newGuidelines[index + 1]] = [newGuidelines[index + 1], newGuidelines[index]];
                                      handleSaveGuidelines(newGuidelines);
                                    }
                                  }}
                                  disabled={index === guidelines.length - 1}
                                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Move Down"
                                >
                                  ⬇️
                                </button>
                                <button
                                  onClick={() => {
                                    const duplicated: Guideline = {
                                      ...guideline,
                                      id: createEntityId('guideline', guidelines.map((guideline) => guideline.id)),
                                      title: `${guideline.title} (Copy)`
                                    };
                                    const newGuidelines = [...guidelines];
                                    newGuidelines.splice(index + 1, 0, duplicated);
                                    handleSaveGuidelines(newGuidelines);
                                    setExpandedGuidelines(prev => new Set([...prev, duplicated.id]));
                                  }}
                                  className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"
                                  title="Duplicate"
                                >
                                  📋
                                </button>
                              </div>
                              <button
                                onClick={() => {
                                  confirmAction(
                                    { title: 'Delete guideline?', message: 'Are you sure you want to delete this guideline?', kind: 'danger', confirmLabel: 'Delete Guideline' },
                                    () => handleSaveGuidelines(guidelines.filter(g => g.id !== guideline.id)),
                                  );
                                }}
                                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium flex items-center gap-2"
                              >
                                🗑️ Delete Guideline
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Help Section */}
              <BrandedTips
                title="Tips for Creating Effective Guidelines"
                config={config}
                tips={[
                  { icon: '✍️', title: 'Be Specific', description: 'Use clear, actionable language in your descriptions' },
                  { icon: '📏', title: 'Include Measurements', description: 'Add specific measurements when possible (e.g., "3 feet minimum")' },
                  { icon: '🚨', title: 'Mark Critical Items', description: 'Use the "Important" category for critical safety guidelines' },
                  { icon: '🏷️', title: 'Use Clear Icons', description: 'Choose icons that help users quickly identify guideline types' },
                  { icon: '📁', title: 'Organize by Category', description: 'Group guidelines by category for easy reference' },
                  { icon: '⏸️', title: 'Disable vs Delete', description: 'Disable seasonal guidelines instead of deleting them' }
                ]}
              />
            </div>
    </div>
  );
}
