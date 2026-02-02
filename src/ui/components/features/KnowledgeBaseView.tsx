import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { KNOWLEDGE_CATEGORIES, type KnowledgeBase, type KnowledgeEntry, type KnowledgeCategory } from '../../../shared/types';

interface KnowledgeBaseViewProps {
  knowledgeBase: KnowledgeBase;
  onAddEntry: (entry: { title: string; category: KnowledgeCategory; content: string }) => void;
  onUpdateEntry: (id: string, updates: { title?: string; category?: KnowledgeCategory; content?: string }) => void;
  onDeleteEntry: (id: string) => void;
  onBack: () => void;
}

type ViewMode = 'list' | 'add' | 'edit';

export function KnowledgeBaseView({
  knowledgeBase,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onBack,
}: KnowledgeBaseViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | 'all'>('all');

  // Form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<KnowledgeCategory>('requirements');
  const [content, setContent] = useState('');

  // Reset form when switching modes
  useEffect(() => {
    if (viewMode === 'add') {
      setTitle('');
      setCategory('requirements');
      setContent('');
    } else if (viewMode === 'edit' && editingEntry) {
      setTitle(editingEntry.title);
      setCategory(editingEntry.category);
      setContent(editingEntry.content);
    }
  }, [viewMode, editingEntry]);

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) return;

    if (viewMode === 'add') {
      onAddEntry({ title: title.trim(), category, content: content.trim() });
    } else if (viewMode === 'edit' && editingEntry) {
      onUpdateEntry(editingEntry.id, { title: title.trim(), category, content: content.trim() });
    }
    setViewMode('list');
    setEditingEntry(null);
  };

  const handleEdit = (entry: KnowledgeEntry) => {
    setEditingEntry(entry);
    setViewMode('edit');
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this knowledge entry?')) {
      onDeleteEntry(id);
    }
  };

  const filteredEntries = selectedCategory === 'all'
    ? knowledgeBase.entries
    : knowledgeBase.entries.filter(e => e.category === selectedCategory);

  const getCategoryLabel = (cat: KnowledgeCategory) =>
    KNOWLEDGE_CATEGORIES.find(c => c.id === cat)?.label || cat;

  // Form view (Add/Edit)
  if (viewMode === 'add' || viewMode === 'edit') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
          }}
        >
          <button
            onClick={() => { setViewMode('list'); setEditingEntry(null); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--figma-color-bg-secondary)',
              color: 'var(--figma-color-text)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--figma-color-text)' }}>
            {viewMode === 'add' ? 'Add Knowledge' : 'Edit Knowledge'}
          </span>
        </div>

        {/* Form */}
        <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
          {/* Title */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--figma-color-text)', marginBottom: '8px' }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
              placeholder="e.g., User Persona: Anxious Adult"
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: '13px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--figma-color-bg-secondary)',
                color: 'var(--figma-color-text)',
                boxSizing: 'border-box',
                boxShadow: 'var(--shadow-sm)',
              }}
            />
          </div>

          {/* Category */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--figma-color-text)', marginBottom: '8px' }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory((e.target as HTMLSelectElement).value as KnowledgeCategory)}
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: '13px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--figma-color-bg-secondary)',
                color: 'var(--figma-color-text)',
                boxSizing: 'border-box',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {KNOWLEDGE_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </div>

          {/* Content */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--figma-color-text)', marginBottom: '8px' }}>
              Content
            </label>
            <textarea
              value={content}
              onInput={(e) => setContent((e.target as HTMLTextAreaElement).value)}
              placeholder="Paste your documentation, requirements, or notes here..."
              style={{
                width: '100%',
                minHeight: '180px',
                padding: '12px 14px',
                fontSize: '13px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--figma-color-bg-secondary)',
                color: 'var(--figma-color-text)',
                boxSizing: 'border-box',
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: '1.5',
                boxShadow: 'var(--shadow-sm)',
              }}
            />
            <div style={{ fontSize: '11px', color: 'var(--figma-color-text-tertiary)', marginTop: '6px' }}>
              {content.length} characters
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || !content.trim()}
              style={{
                flex: 1,
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: (!title.trim() || !content.trim())
                  ? 'var(--figma-color-bg-tertiary)'
                  : 'var(--color-accent)',
                color: (!title.trim() || !content.trim())
                  ? 'var(--figma-color-text-disabled)'
                  : 'white',
                cursor: (!title.trim() || !content.trim()) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {viewMode === 'add' ? 'Add Entry' : 'Save Changes'}
            </button>
            <button
              onClick={() => { setViewMode('list'); setEditingEntry(null); }}
              style={{
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: 500,
                border: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--figma-color-bg-secondary)',
                color: 'var(--figma-color-text)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--figma-color-bg-secondary)',
            color: 'var(--figma-color-text)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--figma-color-text)', flex: 1 }}>
          Knowledge Base
        </span>
        <button
          onClick={() => setViewMode('add')}
          style={{
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: 600,
            border: 'none',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-accent)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s ease',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add
        </button>
      </div>

      {/* Info Banner */}
      <div
        style={{
          margin: '0 16px 12px',
          padding: '12px 14px',
          backgroundColor: 'var(--figma-color-bg-secondary)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--figma-color-text-secondary)', lineHeight: '1.5' }}>
          Add documentation, requirements, and research. Claude uses this context when analyzing your designs.
        </div>
      </div>

      {/* Filter */}
      {knowledgeBase.entries.length > 0 && (
        <div style={{ padding: '0 16px 12px' }}>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory((e.target as HTMLSelectElement).value as KnowledgeCategory | 'all')}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: '12px',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--figma-color-bg-secondary)',
              color: 'var(--figma-color-text)',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <option value="all">All Categories ({knowledgeBase.entries.length})</option>
            {KNOWLEDGE_CATEGORIES.map(cat => {
              const count = knowledgeBase.entries.filter(e => e.category === cat.id).length;
              return count > 0 ? (
                <option key={cat.id} value={cat.id}>{cat.label} ({count})</option>
              ) : null;
            })}
          </select>
        </div>
      )}

      {/* Entry List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {filteredEntries.length === 0 ? (
          <div
            className="fade-in"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--figma-color-bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--figma-color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--figma-color-text)', marginBottom: '6px' }}>
              No entries yet
            </div>
            <div style={{ fontSize: '12px', color: 'var(--figma-color-text-tertiary)', marginBottom: '20px', maxWidth: '200px' }}>
              Add your first entry to give Claude context about your app
            </div>
            <button
              onClick={() => setViewMode('add')}
              style={{
                padding: '10px 20px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-accent)',
                color: 'white',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-md)',
                transition: 'all 0.2s ease',
              }}
            >
              Add First Entry
            </button>
          </div>
        ) : (
          filteredEntries.map(entry => (
            <div
              key={entry.id}
              className="fade-in"
              style={{
                padding: '14px',
                marginBottom: '10px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--figma-color-bg-secondary)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--figma-color-text)', marginBottom: '6px' }}>
                    {entry.title}
                  </div>
                  <div
                    style={{
                      display: 'inline-block',
                      fontSize: '10px',
                      fontWeight: 500,
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--color-accent-soft)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    {getCategoryLabel(entry.category)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => handleEdit(entry)}
                    style={{
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--figma-color-bg)',
                      color: 'var(--figma-color-text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    style={{
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--figma-color-bg)',
                      color: '#dc2626',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--figma-color-text-secondary)',
                  lineHeight: '1.5',
                  maxHeight: '48px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {entry.content.slice(0, 150)}{entry.content.length > 150 ? '...' : ''}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--figma-color-text-tertiary)', marginTop: '8px' }}>
                {entry.content.length} chars
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Stats */}
      {knowledgeBase.entries.length > 0 && (() => {
        const totalChars = knowledgeBase.entries.reduce((sum, e) => sum + e.content.length, 0);
        const estimatedTokens = Math.ceil(totalChars / 4);
        const isLarge = totalChars > 20000;

        return (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: isLarge ? 'var(--color-warning-soft)' : 'var(--figma-color-bg-secondary)',
              borderTop: '1px solid var(--card-border)',
            }}
          >
            <div style={{
              fontSize: '11px',
              color: isLarge ? 'var(--color-warning)' : 'var(--figma-color-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              {knowledgeBase.entries.length} entries • ~{estimatedTokens.toLocaleString()} tokens
              {isLarge && ' (large context)'}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
