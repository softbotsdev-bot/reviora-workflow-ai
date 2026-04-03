import { useWorkflowStore, apiFetch, toast } from '../store';
import { useCallback, useRef } from 'react';
import { FiUpload, FiX } from 'react-icons/fi';

export default function PropertiesPanel() {
  const selectedNode = useWorkflowStore((s) => s.selectedNode);
  const nodes = useWorkflowStore((s) => s.nodes);
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const nodeDefinitions = useWorkflowStore((s) => s.nodeDefinitions);
  const fileInputRef = useRef(null);

  const node = selectedNode ? nodes.find((n) => n.id === selectedNode) : null;

  if (!node) {
    return (
      <aside className="ws-props-panel">
        <div className="ws-props-empty">
          <p>Select a node to view its properties</p>
        </div>
      </aside>
    );
  }

  // Use definition from server OR fallback to the one stored in node.data
  const nodeType = node.data?.nodeType || node.type || 'unknown';
  const serverDef = nodeDefinitions.find((d) => d.type === nodeType);
  const embeddedDef = node.data?.definition || {};
  const def = serverDef || embeddedDef;
  const defProperties = def.properties || [];
  const properties = node.data?.properties || {};

  const updateProperty = (key, value) => {
    const currentNodes = useWorkflowStore.getState().nodes;
    const updated = currentNodes.map((n) => {
      if (n.id !== selectedNode) return n;
      return {
        ...n,
        data: {
          ...n.data,
          properties: { ...(n.data?.properties || {}), [key]: value },
        },
      };
    });
    setNodes(updated);
  };

  const handleFileUpload = async (propName, file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const data = await apiFetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (data.ok) {
        updateProperty(propName, data.url);
      }
    } catch (e) {
      console.error('Upload failed:', e);
    }
  };

  return (
    <aside className="ws-props-panel">
      <div className="ws-props-header">
        <h3>Properties</h3>
        <div className="ws-props-node-type">
          <span className="ws-props-dot" style={{ background: def.color || '#666' }} />
          {def.displayName || nodeType}
        </div>
        <div style={{ fontSize: 11, color: '#606078', marginTop: 4 }}>
          ID: {node.id}
        </div>
      </div>

      <div className="ws-props-body">
        {defProperties.length === 0 && (
          <div style={{ color: '#9090a8', fontSize: 13, padding: '8px 0' }}>
            No configurable properties
          </div>
        )}

        {defProperties.map((prop) => (
          <div key={prop.name} className="ws-prop-group">
            <label className="ws-prop-label">{prop.label || prop.name}</label>

            {/* Select */}
            {prop.type === 'select' && (
              <select
                className="ws-prop-select"
                value={properties[prop.name] ?? prop.default ?? ''}
                onChange={(e) => updateProperty(prop.name, e.target.value)}
              >
                {(prop.options || []).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            {/* Text input */}
            {prop.type === 'text' && (
              <input
                type="text"
                className="ws-prop-input"
                value={properties[prop.name] ?? prop.default ?? ''}
                onChange={(e) => updateProperty(prop.name, e.target.value)}
                placeholder={prop.placeholder || ''}
              />
            )}

            {/* Textarea */}
            {prop.type === 'textarea' && (
              <textarea
                className="ws-prop-textarea"
                value={properties[prop.name] ?? prop.default ?? ''}
                onChange={(e) => updateProperty(prop.name, e.target.value)}
                placeholder={prop.placeholder || ''}
                rows={4}
              />
            )}

            {/* Number */}
            {prop.type === 'number' && (
              <div className="ws-prop-number">
                <button onClick={() => updateProperty(prop.name, Math.max(prop.min || 0, (properties[prop.name] ?? prop.default ?? 1) - 1))}>−</button>
                <span>{properties[prop.name] ?? prop.default ?? 1}</span>
                <button onClick={() => updateProperty(prop.name, Math.min(prop.max || 10, (properties[prop.name] ?? prop.default ?? 1) + 1))}>+</button>
              </div>
            )}

            {/* Slider */}
            {prop.type === 'slider' && (
              <div className="ws-prop-slider">
                <input
                  type="range"
                  min={prop.min ?? 0}
                  max={prop.max ?? 1}
                  step={prop.step ?? 0.1}
                  value={properties[prop.name] ?? prop.default ?? 0.5}
                  onChange={(e) => updateProperty(prop.name, parseFloat(e.target.value))}
                />
                <span className="ws-slider-val">
                  {Number(properties[prop.name] ?? prop.default ?? 0.5).toFixed(1)}
                </span>
              </div>
            )}

            {/* File upload */}
            {prop.type === 'file_upload' && (
              <div className="ws-prop-upload">
                {properties[prop.name] ? (
                  <div className="ws-upload-preview">
                    <img src={properties[prop.name]} alt="uploaded" />
                    <button className="ws-upload-clear" onClick={() => updateProperty(prop.name, '')}><FiX size={14} /></button>
                  </div>
                ) : (
                  <label className="ws-upload-btn">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={prop.accept || '*'}
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files[0]) handleFileUpload(prop.name, e.target.files[0]);
                      }}
                    />
                    <FiUpload size={14} /> <span>Choose File</span>
                  </label>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
