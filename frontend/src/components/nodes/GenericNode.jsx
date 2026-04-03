import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FiUpload, FiType, FiImage, FiFilm, FiEdit3, FiZap, FiMove, FiDownload } from 'react-icons/fi';

const TYPE_ICONS = {
  upload: FiUpload,
  prompt: FiType,
  image_gen: FiImage,
  image_edit: FiEdit3,
  image_enhance: FiZap,
  video_gen: FiFilm,
  video_motion: FiMove,
  output: FiDownload,
};

const TYPE_COLORS = {
  upload: '#4a90d9',
  prompt: '#e8a838',
  image_gen: '#7c3aed',
  image_edit: '#8b5cf6',
  image_enhance: '#06b6d4',
  video_gen: '#ec4899',
  video_motion: '#f59e0b',
  output: '#10b981',
};

function GenericNode({ id, data, selected }) {
  const nodeType = data?.nodeType || 'unknown';
  const def = data?.definition || {};
  const status = data?._status;
  const error = data?._error;
  const outputs = data?._outputs;
  const color = TYPE_COLORS[nodeType] || '#666';
  const Icon = TYPE_ICONS[nodeType] || FiImage;

  const statusClass = status === 'done' ? 'node-done' : status === 'error' ? 'node-error' : status === 'running' ? 'node-running' : '';

  // Preview for outputs
  let preview = null;
  if (outputs) {
    const fileOutput = outputs.image || outputs.video || outputs.file;
    if (fileOutput?.url) {
      const isVideo = fileOutput.type === 'video' || fileOutput.url?.includes('.mp4');
      preview = isVideo
        ? <video src={fileOutput.url} className="node-preview" controls muted />
        : <img src={fileOutput.url} className="node-preview" alt="result" />;
    }
  }

  return (
    <div className={`ws-node ${statusClass} ${selected ? 'selected' : ''}`}>
      {/* Header */}
      <div className="ws-node-header" style={{ background: `linear-gradient(135deg, ${color}, ${color}88)` }}>
        <Icon size={14} />
        <span className="ws-node-title">{def.displayName || nodeType}</span>
        {status === 'running' && <div className="node-spinner" />}
      </div>

      {/* Body */}
      <div className="ws-node-body">
        {/* Show properties summary */}
        {data?.properties && Object.entries(data.properties).slice(0, 3).map(([key, val]) => {
          if (key === 'text' || key === 'file_url') return null;
          if (typeof val === 'string' && val.length > 30) val = val.substring(0, 30) + '...';
          return (
            <div key={key} className="ws-node-prop">
              <span className="prop-key">{key}:</span>
              <span className="prop-val">{String(val)}</span>
            </div>
          );
        })}

        {/* Prompt preview */}
        {nodeType === 'prompt' && data?.properties?.text && (
          <div className="ws-node-prompt-preview">
            {data.properties.text.substring(0, 80)}
            {data.properties.text.length > 80 ? '...' : ''}
          </div>
        )}

        {/* Result preview */}
        {preview}

        {/* Error display */}
        {error && <div className="ws-node-error">{error}</div>}
      </div>

      {/* Input handles */}
      {def.inputs?.map((inp, i) => (
        <Handle
          key={`in-${inp.name}`}
          type="target"
          position={Position.Left}
          id={inp.name}
          style={{ top: `${30 + (i + 1) * 24}px`, background: color }}
          title={inp.label || inp.name}
        />
      ))}

      {/* Output handles */}
      {def.outputs?.map((out, i) => (
        <Handle
          key={`out-${out.name}`}
          type="source"
          position={Position.Right}
          id={out.name}
          style={{ top: `${30 + (i + 1) * 24}px`, background: color }}
          title={out.label || out.name}
        />
      ))}
    </div>
  );
}

export default memo(GenericNode);
export { TYPE_COLORS, TYPE_ICONS };
