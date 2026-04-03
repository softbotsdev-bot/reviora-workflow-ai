import { memo, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeToolbar, NodeResizer } from '@xyflow/react';
import {
  FiUpload, FiType, FiImage, FiFilm, FiEdit3, FiZap, FiMove, FiDownload,
  FiCopy, FiTrash2, FiPlay, FiCheck, FiAlertTriangle, FiFolder,
  FiRefreshCw, FiMaximize2, FiX,
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
  const [lightbox, setLightbox] = useState(false);
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
        updateProp('file_name', file.name);
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

  // Helper: create a new node to the right and auto-connect from this node's output
  const spawnConnectedNode = useCallback((targetType, sourceHandle = 'image', targetHandle = 'reference') => {
    const store = useWorkflowStore.getState();
    const defs = store.nodeDefinitions;
    const def = defs.find(d => d.type === targetType) || { type: targetType, displayName: targetType, inputs: [], outputs: [], properties: [] };
    const defaultProps = {};
    (def.properties || []).forEach(p => { defaultProps[p.name] = p.default ?? ''; });

    const thisNode = store.nodes.find(n => n.id === id);
    const newId = `${targetType}_${Date.now()}`;
    const newNode = {
      id: newId, type: targetType,
      position: { x: (thisNode?.position?.x || 0) + 360, y: (thisNode?.position?.y || 0) },
      data: { nodeType: targetType, definition: def, properties: defaultProps },
    };
    store.setNodes([...store.nodes, newNode]);

    // Auto-connect: use first compatible input if targetHandle not found
    const tgtInput = (def.inputs || []).find(i => i.name === targetHandle)
      || (def.inputs || []).find(i => i.type === 'file')
      || (def.inputs || [])[0];
    if (tgtInput) {
      const edge = {
        id: `e-${id}-${newId}-${Date.now()}`,
        source: id, sourceHandle,
        target: newId, targetHandle: tgtInput.name,
        type: 'deletable', animated: true, style: { stroke: '#6366f1' },
      };
      store.setEdges([...store.edges, edge]);
    }
    toast.info(`Added ${def.displayName || targetType}`);
  }, [id]);

  // Determine if this node has an image to act on (uploaded or generated)
  const hasImage = !!(properties.file_url || resultUrl);
  const imageUrl = properties.file_url || resultUrl;

  return (
    <>
      {/* Toolbar — rich contextual actions */}
      <NodeToolbar isVisible={selected} position={Position.Top} offset={10}>
        <div className="ws-node-toolbar">
          {/* === Image action buttons (when image exists) === */}
          {hasImage && ['upload', 'image_gen', 'image_edit', 'image_enhance'].includes(nodeType) && (
            <>
              <button onClick={() => spawnConnectedNode('image_enhance', nodeType === 'upload' ? 'file' : 'image', 'image')} title="Enhance Image"><FiZap size={13} /></button>
              <button onClick={() => spawnConnectedNode('image_edit', nodeType === 'upload' ? 'file' : 'image', 'reference')} title="Edit Image"><FiEdit3 size={13} /></button>
              <button onClick={() => spawnConnectedNode('video_gen', nodeType === 'upload' ? 'file' : 'image', 'reference')} title="Animate / Generate Video"><FiFilm size={13} /></button>
              <div className="ws-toolbar-sep" />
            </>
          )}

          {/* Download / Full View (when image/video) */}
          {hasImage && (
            <>
              <button onClick={() => {
                const a = document.createElement('a');
                a.href = imageUrl; a.download = properties.file_name || 'download'; a.click();
              }} title="Download"><FiDownload size={13} /></button>
              <button onClick={() => setLightbox(true)} title="Full View"><FiMaximize2 size={13} /></button>
              <div className="ws-toolbar-sep" />
            </>
          )}

          {/* Duplicate — all nodes */}
          <button onClick={() => {
            const orig = useWorkflowStore.getState().nodes.find(n => n.id === id);
            if (orig) {
              const dup = { ...orig, id: `${orig.type}_${Date.now()}`, position: { x: orig.position.x + 40, y: orig.position.y + 40 }, data: { ...orig.data, _status: undefined, _outputs: undefined, _error: undefined } };
              useWorkflowStore.getState().setNodes([...useWorkflowStore.getState().nodes, dup]);
              toast.info('Duplicated');
            }
          }} title="Duplicate"><FiCopy size={13} /></button>

          {/* Prompt: clear text */}
          {nodeType === 'prompt' && (
            <button onClick={() => { updateProp('text', ''); toast.info('Cleared'); }} title="Clear text"><FiRefreshCw size={13} /></button>
          )}

          {/* Upload: re-upload */}
          {nodeType === 'upload' && properties.file_url && (
            <button onClick={() => { updateProp('file_url', ''); updateProp('file_name', ''); }} title="Remove file"><FiRefreshCw size={13} /></button>
          )}

          {/* Delete — all nodes */}
          <button onClick={() => {
            const nodes = useWorkflowStore.getState().nodes;
            const edges = useWorkflowStore.getState().edges;
            useWorkflowStore.getState().setNodes(nodes.filter((n) => n.id !== id));
            useWorkflowStore.getState().setEdges(edges.filter((e) => e.source !== id && e.target !== id));
            useWorkflowStore.getState().setSelectedNode(null);
          }} title="Delete" className="toolbar-delete"><FiTrash2 size={13} /></button>
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

          {/* UPLOAD NODE — competitor-style */}
          {nodeType === 'upload' && (
            <div className="ws-node-upload-zone">
              {properties.file_url ? (
                <div className="ws-upload-filled">
                  <div className="ws-upload-filename">
                    <FiFolder size={12} />
                    <span>{properties.file_name || 'uploaded file'}</span>
                  </div>
                  <div className="ws-upload-img-wrap">
                    <img src={properties.file_url} alt="uploaded" className="ws-upload-img" />
                    <button className="ws-upload-remove" onClick={() => { updateProp('file_url', ''); updateProp('file_name', ''); }} title="Remove">
                      <FiTrash2 size={12} />
                    </button>
                  </div>
                  <label className="ws-upload-add-btn">
                    <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }}
                      onChange={(e) => { if (e.target.files[0]) handleUpload(e.target.files[0]); }}
                    />
                    + Replace Image
                  </label>
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
                    <FiUpload size={26} />
                    <span>Drop image or click to upload</span>
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

      {/* Lightbox Modal */}
      {lightbox && imageUrl && createPortal(
        <div className="ws-lightbox-overlay" onClick={() => setLightbox(false)}>
          <div className="ws-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={imageUrl} alt="Full view" className="ws-lightbox-img" />
            <div className="ws-lightbox-actions">
              <button onClick={() => {
                const a = document.createElement('a');
                a.href = imageUrl; a.download = properties.file_name || 'download'; a.click();
              }}><FiDownload size={16} /> Download</button>
              <button onClick={() => setLightbox(false)}><FiX size={16} /> Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default memo(GenericNode);
