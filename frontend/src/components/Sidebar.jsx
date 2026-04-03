import { useCallback } from 'react';
import { FiUpload, FiType, FiImage, FiFilm, FiEdit3, FiZap, FiMove, FiDownload, FiPlus } from 'react-icons/fi';
import { useWorkflowStore } from '../store';

const CATEGORIES = [
  {
    name: 'Add',
    icon: FiPlus,
    nodes: [
      { type: 'upload', label: 'Upload', icon: FiUpload, shortcut: 'U' },
      { type: 'prompt', label: 'Prompt', icon: FiType, shortcut: 'T/P' },
    ],
  },
  {
    name: 'Image',
    icon: FiImage,
    nodes: [
      { type: 'image_gen', label: 'Generate Image', icon: FiImage },
      { type: 'image_edit', label: 'Edit Image', icon: FiEdit3 },
      { type: 'image_enhance', label: 'Enhance Image', icon: FiZap },
    ],
  },
  {
    name: 'Video',
    icon: FiFilm,
    nodes: [
      { type: 'video_gen', label: 'Generate Video', icon: FiFilm },
      { type: 'video_motion', label: 'Video Motion', icon: FiMove },
    ],
  },
  {
    name: 'Output',
    icon: FiDownload,
    nodes: [
      { type: 'output', label: 'Output', icon: FiDownload },
    ],
  },
];

export default function Sidebar() {
  const { nodeDefinitions } = useWorkflowStore();

  const onDragStart = useCallback((event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  return (
    <aside className="ws-sidebar">
      <div className="ws-sidebar-header">
        <h2>Nodes</h2>
      </div>
      <div className="ws-sidebar-search">
        <input type="text" placeholder="Search nodes or models" className="ws-search-input" />
      </div>
      <div className="ws-sidebar-content">
        {CATEGORIES.map((cat) => (
          <div key={cat.name} className="ws-sidebar-category">
            <div className="ws-category-label">
              <cat.icon size={14} />
              <span>{cat.name}</span>
            </div>
            <div className="ws-category-nodes">
              {cat.nodes.map((node) => {
                const NodeIcon = node.icon;
                return (
                  <div
                    key={node.type}
                    className="ws-sidebar-node"
                    draggable
                    onDragStart={(e) => onDragStart(e, node.type)}
                  >
                    <NodeIcon size={16} />
                    <span>{node.label}</span>
                    {node.shortcut && <kbd className="ws-shortcut">{node.shortcut}</kbd>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
