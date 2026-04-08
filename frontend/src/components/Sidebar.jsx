import { useCallback, useState } from 'react';
import {
  FiUpload, FiType, FiImage, FiFilm, FiEdit3, FiZap, FiMove,
  FiDownload, FiPlus, FiChevronDown, FiChevronRight, FiSearch,
} from 'react-icons/fi';
import { useWorkflowStore } from '../store';

const CATEGORIES = [
  {
    name: 'Add',
    icon: FiPlus,
    defaultOpen: true,
    nodes: [
      { type: 'upload', label: 'Upload', icon: FiUpload, shortcut: 'U' },
      { type: 'prompt', label: 'Prompt', icon: FiType, shortcut: 'T' },
    ],
  },
  {
    name: 'Image',
    icon: FiImage,
    defaultOpen: true,
    nodes: [
      { type: 'image_gen', label: 'Generate Image', icon: FiImage },
      { type: 'image_edit', label: 'Edit Image', icon: FiEdit3 },
      { type: 'image_enhance', label: 'Enhance Image', icon: FiZap },
    ],
  },
  {
    name: 'Video',
    icon: FiFilm,
    defaultOpen: true,
    nodes: [
      { type: 'video_gen', label: 'Generate Video', icon: FiFilm },
    ],
  },
];

export default function Sidebar() {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});

  const toggle = (name) => setCollapsed((c) => ({ ...c, [name]: !c[name] }));

  const onDragStart = useCallback((event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const filteredCategories = CATEGORIES.map((cat) => ({
    ...cat,
    nodes: cat.nodes.filter((n) =>
      n.label.toLowerCase().includes(search.toLowerCase()) ||
      n.type.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((cat) => cat.nodes.length > 0);

  return (
    <aside className="ws-sidebar">
      <div className="ws-sidebar-header">
        <h2>Nodes</h2>
      </div>
      <div className="ws-sidebar-search">
        <div className="ws-search-wrapper">
          <FiSearch size={14} className="ws-search-icon" />
          <input
            type="text"
            placeholder="Search nodes or models"
            className="ws-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="ws-sidebar-content">
        {filteredCategories.map((cat) => {
          const isOpen = collapsed[cat.name] === undefined ? cat.defaultOpen : !collapsed[cat.name];
          return (
            <div key={cat.name} className="ws-sidebar-category">
              <button className="ws-category-toggle" onClick={() => toggle(cat.name)}>
                <div className="ws-category-left">
                  <cat.icon size={14} />
                  <span>{cat.name}</span>
                </div>
                {isOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
              </button>
              {isOpen && (
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
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
