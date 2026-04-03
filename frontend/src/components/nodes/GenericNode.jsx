import { memo, useCallback, useRef } from 'react';
import { Handle, Position, NodeToolbar } from '@xyflow/react';
import { useWorkflowStore, apiFetch, toast } from '../../store';

// Icon map per node type
const NODE_ICONS = {
  upload: '📁', prompt: '✏️', image_gen: '🖼️', image_edit: '✂️',
  image_enhance: '✨', video_gen: '🎬', video_motion: '🎞️', output: '📤',
};

const NODE_COLORS = {
  upload: '#3b82f6', prompt: '#e8a838', image_gen: '#7c3aed', image_edit: '#8b5cf6',
  image_enhance: '#06b6d4', video_gen: '#ec4899', video_motion: '#f59e0b', output: '#10b981',
};

function GenericNode({ id, data, selected }) {
  const nodeType = data?.nodeType || 'unknown';
  const def = data?.definition || {};
  const properties = data?.properties || {};
  const status = data?._status;
  const outputs = data?._outputs;
  const error = data?._error;
  const icon = NODE_ICONS[nodeType] || '⬡';
  const color = NODE_COLORS[nodeType] || '#666';
  const displayName = def.displayName || nodeType;
  const fileRef = useRef(null);

  const updateProp = useCallback((key, value) => {
    const nodes = useWorkflowStore.getState().nodes;
    useWorkflowStore.getState().setNodes(
      nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, properties: { ...n.data.properties, [key]: value } } } : n
      )
    );
  }, [id]);

  const handleUpload = useCallback(async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiFetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        updateProp('file_url', res.url);
        toast.success('File uploaded');
      }
    } catch (e) {
      toast.error('Upload failed');
    }
  }, [updateProp]);

  // Determine inputs/outputs from definition
  const inputs = def.inputs || [];
  const nodeOutputs = def.outputs || [];

  // Get result image/video URL
  const resultUrl = outputs?.image?.url || outputs?.video?.url || null;
  const resultType = outputs?.video?.url ? 'video' : 'image';

  return (
    <>
      {/* Node Toolbar — appears above node on hover/select */}
      <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
        <div className="ws-node-toolbar">
          <button onClick={() => navigator.clipboard.writeText(id)} title="Copy ID">📋</button>
          <button onClick={() => {
            const nodes = useWorkflowStore.getState().nodes;
            useWorkflowStore.getState().setNodes(nodes.filter((n) => n.id !== id));
            useWorkflowStore.getState().setSelectedNode(null);
          }} title="Delete">🗑️</button>
        </div>
      </NodeToolbar>

      <div className={`ws-node ${selected ? 'selected' : ''} ${status === 'done' ? 'node-done' : ''} ${status === 'error' ? 'node-error' : ''} ${status === 'running' ? 'node-running' : ''}`}>
        {/* Input handles */}
        {inputs.map((inp, i) => (
          <Handle
            key={`in-${inp.name}`}
            type="target"
            position={Position.Left}
            id={inp.name}
            style={{ top: `${30 + i * 20}%`, background: color }}
            className="ws-handle"
          />
        ))}

        {/* Header */}
        <div className="ws-node-header" style={{ background: `${color}cc` }}>
          <span className="ws-node-icon">{icon}</span>
          <span className="ws-node-title">{displayName}</span>
          {status === 'running' && <div className="node-spinner" />}
          {status === 'done' && <span className="ws-node-check">✓</span>}
        </div>

        {/* Body — type-specific content */}
        <div className="ws-node-body">

          {/* ─── PROMPT NODE: inline textarea ─── */}
          {nodeType === 'prompt' && (
            <div className="ws-node-prompt-area">
              <textarea
                className="ws-node-inline-textarea"
                value={properties.prompt || ''}
                onChange={(e) => updateProp('prompt', e.target.value)}
                placeholder="Enter your prompt here..."
                rows={3}
              />
              {properties.negative_prompt !== undefined && (
                <textarea
                  className="ws-node-inline-textarea ws-neg"
                  value={properties.negative_prompt || ''}
                  onChange={(e) => updateProp('negative_prompt', e.target.value)}
                  placeholder="Negative prompt (optional)..."
                  rows={2}
                />
              )}
            </div>
          )}

          {/* ─── UPLOAD NODE: drop zone ─── */}
          {nodeType === 'upload' && (
            <div className="ws-node-upload-zone">
              {properties.file_url ? (
                <div className="ws-node-upload-preview">
                  <img src={properties.file_url} alt="uploaded" />
                  <button className="ws-node-upload-clear" onClick={() => updateProp('file_url', '')}>×</button>
                </div>
              ) : (
                <label className="ws-node-upload-drop"
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]); }}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,video/*"
                    style={{ display: 'none' }}
                    onChange={(e) => { if (e.target.files[0]) handleUpload(e.target.files[0]); }}
                  />
                  <div className="ws-upload-placeholder">
                    <span className="ws-upload-icon">📁</span>
                    <span>Drop file or click</span>
                  </div>
                </label>
              )}
            </div>
          )}

          {/* ─── IMAGE/VIDEO GEN NODES: preview area ─── */}
          {['image_gen', 'image_edit', 'image_enhance', 'video_gen', 'video_motion'].includes(nodeType) && (
            <div className="ws-node-preview-area">
              {resultUrl ? (
                resultType === 'video' ? (
                  <video src={resultUrl} controls className="ws-node-preview-media" />
                ) : (
                  <img src={resultUrl} alt="result" className="ws-node-preview-media" />
                )
              ) : (
                <div className="ws-node-preview-empty">
                  <span>Results will appear here...</span>
                </div>
              )}
            </div>
          )}

          {/* ─── OUTPUT NODE ─── */}
          {nodeType === 'output' && (
            <div className="ws-node-preview-area">
              {resultUrl ? (
                <div>
                  {resultType === 'video' ? (
                    <video src={resultUrl} controls className="ws-node-preview-media" />
                  ) : (
                    <img src={resultUrl} alt="output" className="ws-node-preview-media" />
                  )}
                  <a href={resultUrl} download className="ws-node-download-btn">⬇ Download</a>
                </div>
              ) : (
                <div className="ws-node-preview-empty output-empty">
                  <span>Results will appear here...</span>
                </div>
              )}
            </div>
          )}

          {/* ── Properties summary (non-prompt) ── */}
          {nodeType !== 'prompt' && nodeType !== 'upload' && (
            <div className="ws-node-props-summary">
              {(def.properties || []).slice(0, 3).map((p) => (
                <div key={p.name} className="ws-node-prop">
                  <span className="prop-key">{p.label || p.name}:</span>
                  <span className="prop-val">{
                    p.type === 'select'
                      ? (p.options?.find(o => o.value === (properties[p.name] ?? p.default))?.label || properties[p.name] || p.default || '-')
                      : (properties[p.name] ?? p.default ?? '-')
                  }</span>
                </div>
              ))}
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="ws-node-error">⚠ {error}</div>
          )}
        </div>

        {/* ── Footer with Run button (for gen nodes) ── */}
        {['image_gen', 'image_edit', 'image_enhance', 'video_gen', 'video_motion', 'output'].includes(nodeType) && (
          <div className="ws-node-footer">
            <button
              className={`ws-node-run-btn ${status === 'running' ? 'running' : ''}`}
              disabled={status === 'running'}
              onClick={(e) => {
                e.stopPropagation();
                toast.info('Use the main Run button to execute the workflow');
              }}
            >
              {status === 'running' ? (
                <><div className="node-spinner" /> Running...</>
              ) : (
                <>▶ Run</>
              )}
            </button>
          </div>
        )}

        {/* Output handles */}
        {nodeOutputs.map((out, i) => (
          <Handle
            key={`out-${out.name}`}
            type="source"
            position={Position.Right}
            id={out.name}
            style={{ top: `${30 + i * 20}%`, background: color }}
            className="ws-handle"
          />
        ))}
      </div>
    </>
  );
}

export default memo(GenericNode);
