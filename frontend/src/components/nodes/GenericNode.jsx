import { memo, useCallback, useRef } from 'react';
import { Handle, Position, NodeToolbar, NodeResizer } from '@xyflow/react';
import {
  FiUpload, FiType, FiImage, FiFilm, FiEdit3, FiZap, FiMove, FiDownload,
  FiCopy, FiTrash2, FiPlay, FiCheck, FiAlertTriangle, FiFolder,
  FiCrop, FiRefreshCw, FiMoreHorizontal,
} from 'react-icons/fi';
import { useWorkflowStore, apiFetch, toast } from '../../store';

const NODE_ICON_MAP = {
  upload: FiUpload, prompt: FiType, image_gen: FiImage, image_edit: FiEdit3,
  image_enhance: FiZap, video_gen: FiFilm, video_motion: FiMove, output: FiDownload,
};

const NODE_COLORS = {
  upload: '#3b82f6', prompt: '#e8a838', image_gen: '#7c3aed', image_edit: '#8b5cf6',
  image_enhance: '#06b6d4', video_gen: '#ec4899', video_motion: '#f59e0b', output: '#10b981',
};

// Handle colors by data type — visual type matching
const HANDLE_TYPE_COLORS = {
  text: '#e8a838',   // orange — text/prompt
  file: '#3b82f6',   // blue — image/video files
  any:  '#6b7280',   // gray — accepts anything
};

function GenericNode({ id, data, selected }) {
  const nodeType = data?.nodeType || 'unknown';
  const def = data?.definition || {};
  const properties = data?.properties || {};
  const status = data?._status;
  const outputs = data?._outputs;
  const error = data?._error;
  const IconComponent = NODE_ICON_MAP[nodeType] || FiImage;
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

  const inputs = def.inputs || [];
  const nodeOutputs = def.outputs || [];
  const resultUrl = outputs?.image?.url || outputs?.video?.url || null;
  const resultType = outputs?.video?.url ? 'video' : 'image';

  // Get property display value
  const getPropDisplay = (p) => {
    if (p.type === 'select') {
      return p.options?.find(o => o.value === (properties[p.name] ?? p.default))?.label || properties[p.name] || p.default || '-';
    }
    return properties[p.name] ?? p.default ?? '-';
  };

  return (
    <>
      {/* Toolbar */}
      <NodeToolbar isVisible={selected} position={Position.Top} offset={10}>
        <div className="ws-node-toolbar">
          <button onClick={() => navigator.clipboard.writeText(id)} title="Copy ID"><FiCopy size={13} /></button>
          <button title="Edit"><FiEdit3 size={13} /></button>
          <button title="Crop"><FiCrop size={13} /></button>
          <button title="Refresh" onClick={() => toast.info('Rerun from main toolbar')}><FiRefreshCw size={13} /></button>
          <button onClick={() => {
            const nodes = useWorkflowStore.getState().nodes;
            useWorkflowStore.getState().setNodes(nodes.filter((n) => n.id !== id));
            useWorkflowStore.getState().setSelectedNode(null);
          }} title="Delete" className="toolbar-delete"><FiTrash2 size={13} /></button>
          <button title="More"><FiMoreHorizontal size={13} /></button>
        </div>
      </NodeToolbar>

      <div className={`ws-node ${selected ? 'selected' : ''} ${status === 'done' ? 'node-done' : ''} ${status === 'error' ? 'node-error' : ''} ${status === 'running' ? 'node-running' : ''} ${nodeType === 'prompt' ? 'ws-node-prompt' : ''}`}>

        {/* Resizer for prompt nodes */}
        {nodeType === 'prompt' && <NodeResizer minWidth={240} minHeight={200} isVisible={selected} lineClassName="ws-resizer-line" handleClassName="ws-resizer-handle" />}

        {/* Input handles — left edge, labels outside card */}
        {inputs.map((inp, i) => {
          const handleColor = HANDLE_TYPE_COLORS[inp.type] || HANDLE_TYPE_COLORS.any;
          const yPos = 52 + i * 32;
          return (
          <div key={`in-${inp.name}`} className="ws-handle-row ws-handle-row-left" style={{ top: yPos }}>
            <span className="ws-handle-tag" style={{ color: handleColor }}>
              {inp.label || inp.name}{inp.required ? '*' : ''}
            </span>
            <Handle
              type="target"
              position={Position.Left}
              id={inp.name}
              style={{ background: handleColor }}
              className="ws-handle"
            />
          </div>
        );})}

        {/* Header bar — compact with icon + name + model badge */}
        <div className="ws-node-header">
          <div className="ws-node-header-left">
            <div className="ws-node-icon-badge" style={{ background: `${color}25`, color: color }}>
              <IconComponent size={12} />
            </div>
            <span className="ws-node-title">{displayName}</span>
          </div>
          <div className="ws-node-header-right">
            {nodeType !== 'prompt' && nodeType !== 'upload' && nodeType !== 'output' && (
              <span className="ws-node-model-badge">{getPropDisplay(def.properties?.[0] || { name: 'model' })}</span>
            )}
            {status === 'running' && <div className="node-spinner" />}
            {status === 'done' && <FiCheck size={13} className="ws-node-status-icon done" />}
            {status === 'error' && <FiAlertTriangle size={13} className="ws-node-status-icon error" />}
          </div>
        </div>

        {/* Body */}
        <div className="ws-node-body">
          {/* PROMPT NODE */}
          {nodeType === 'prompt' && (
            <div className="ws-node-prompt-area">
              <textarea
                className="ws-node-inline-textarea ws-prompt-main"
                value={properties.text || properties.prompt || ''}
                onChange={(e) => updateProp('text', e.target.value)}
                placeholder="Write your prompt here..."
              />
            </div>
          )}

          {/* UPLOAD NODE */}
          {nodeType === 'upload' && (
            <div className="ws-node-upload-zone">
              {properties.file_url ? (
                <div className="ws-node-upload-preview">
                  <img src={properties.file_url} alt="uploaded" />
                  <button className="ws-node-upload-clear" onClick={() => updateProp('file_url', '')}>
                    <FiTrash2 size={11} />
                  </button>
                </div>
              ) : (
                <label className="ws-node-upload-drop"
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]); }}
                >
                  <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }}
                    onChange={(e) => { if (e.target.files[0]) handleUpload(e.target.files[0]); }}
                  />
                  <div className="ws-upload-placeholder">
                    <FiFolder size={22} />
                    <span>Drop file or click</span>
                  </div>
                </label>
              )}
            </div>
          )}

          {/* IMAGE/VIDEO GEN NODES — preview area */}
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
                  <div className="ws-preview-placeholder-icon"><IconComponent size={24} /></div>
                  <span>Results will appear here.</span>
                </div>
              )}
            </div>
          )}

          {/* OUTPUT NODE */}
          {nodeType === 'output' && (
            <div className="ws-node-preview-area">
              {resultUrl ? (
                <div>
                  {resultType === 'video' ? (
                    <video src={resultUrl} controls className="ws-node-preview-media" />
                  ) : (
                    <img src={resultUrl} alt="output" className="ws-node-preview-media" />
                  )}
                  <a href={resultUrl} download className="ws-node-download-btn">
                    <FiDownload size={12} /> Download
                  </a>
                </div>
              ) : (
                <div className="ws-node-preview-empty output-empty">
                  <div className="ws-preview-placeholder-icon"><FiDownload size={24} /></div>
                  <span>Output will appear here.</span>
                </div>
              )}
            </div>
          )}

          {/* Properties row — compact chips */}
          {nodeType !== 'prompt' && nodeType !== 'upload' && (def.properties || []).length > 1 && (
            <div className="ws-node-props-row">
              {(def.properties || []).slice(1, 4).map((p) => (
                <div key={p.name} className="ws-node-prop-chip">
                  <span className="prop-chip-label">{p.label || p.name}</span>
                  <span className="prop-chip-val">{getPropDisplay(p)}</span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="ws-node-error"><FiAlertTriangle size={11} /> {error}</div>
          )}
        </div>

        {/* Footer with Run button */}
        {['image_gen', 'image_edit', 'image_enhance', 'video_gen', 'video_motion', 'output'].includes(nodeType) && (
          <div className="ws-node-footer">
            <button
              className={`ws-node-run-btn ${status === 'running' ? 'running' : ''}`}
              disabled={status === 'running' || useWorkflowStore.getState().isRunning}
              onClick={(e) => {
                e.stopPropagation();
                useWorkflowStore.getState().runWorkflow();
              }}
            >
              {status === 'running' ? (
                <><div className="node-spinner" /> Generating...</>
              ) : (
                <><FiPlay size={11} /> Run</>
              )}
            </button>
          </div>
        )}

        {/* Output handles — right edge, labels outside card */}
        {nodeOutputs.map((out, i) => {
          const handleColor = HANDLE_TYPE_COLORS[out.type] || HANDLE_TYPE_COLORS.any;
          const yPos = 52 + i * 32;
          return (
          <div key={`out-${out.name}`} className="ws-handle-row ws-handle-row-right" style={{ top: yPos }}>
            <Handle
              type="source"
              position={Position.Right}
              id={out.name}
              style={{ background: handleColor }}
              className="ws-handle"
            />
            <span className="ws-handle-tag" style={{ color: handleColor }}>
              {out.label || out.name}
            </span>
          </div>
        );})}
      </div>
    </>
  );
}

export default memo(GenericNode);
