import { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  reconnectEdge,
  BaseEdge,
  getBezierPath,
  EdgeLabelRenderer,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  FiCommand, FiChevronDown, FiX, FiDownload,
  FiCheckCircle, FiAlertTriangle, FiXCircle,
} from 'react-icons/fi';

import GenericNode from './nodes/GenericNode';
import Sidebar from './Sidebar';
import PropertiesPanel from './PropertiesPanel';
import Toolbar from './Toolbar';
import KeyboardShortcuts from './KeyboardShortcuts';
import ProfileMenu from './ProfileMenu';
import { useWorkflowStore, useAuthStore, toast } from '../store';

// Custom edge with delete button
function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd }) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const onDelete = (evt) => {
    evt.stopPropagation();
    const edges = useWorkflowStore.getState().edges;
    useWorkflowStore.getState().setEdges(edges.filter((e) => e.id !== id));
  };
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="ws-edge-delete"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
        >
          <button onClick={onDelete} title="Delete connection">
            <FiX size={12} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { deletable: DeletableEdge };

const nodeTypes = {
  upload: GenericNode,
  prompt: GenericNode,
  image_gen: GenericNode,
  image_edit: GenericNode,
  image_enhance: GenericNode,
  video_gen: GenericNode,
  video_motion: GenericNode,
  output: GenericNode,
};

let nodeIdCounter = Date.now();

function addNodeToCanvas(type, rfInstance) {
  const defs = useWorkflowStore.getState().nodeDefinitions;
  const def = defs.find((d) => d.type === type) || {
    type, displayName: type, inputs: [], outputs: [], properties: [],
  };
  const defaultProps = {};
  (def.properties || []).forEach((p) => { defaultProps[p.name] = p.default ?? ''; });

  // Place at center of viewport
  let position = { x: 300 + Math.random() * 100, y: 200 + Math.random() * 100 };
  if (rfInstance) {
    const vp = rfInstance.getViewport();
    position = rfInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  }

  const newNode = {
    id: `${type}_${++nodeIdCounter}`,
    type,
    position,
    data: { nodeType: type, definition: def, properties: defaultProps },
  };
  const nodes = useWorkflowStore.getState().nodes;
  useWorkflowStore.getState().setNodes([...nodes, newNode]);
  toast.info(`Added ${def.displayName || type}`);
}

export default function WorkflowEditor() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const selectedNode = useWorkflowStore((s) => s.selectedNode);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const currentName = useWorkflowStore((s) => s.currentName);
  const setCurrentName = useWorkflowStore((s) => s.setCurrentName);
  const runResults = useWorkflowStore((s) => s.runResults);
  const workflows = useWorkflowStore((s) => s.workflows);
  const currentId = useWorkflowStore((s) => s.currentId);
  const hasUnsavedChanges = useWorkflowStore((s) => s.hasUnsavedChanges);
  const isLoading = useWorkflowStore((s) => s.isLoading);
  const isRunning = useWorkflowStore((s) => s.isRunning);
  const initialize = useWorkflowStore((s) => s.initialize);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow);

  const { user, logout } = useAuthStore();
  const reactFlowWrapper = useRef(null);
  const reactFlowInstance = useRef(null);
  const [showWfMenu, setShowWfMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [uiMinimized, setUiMinimized] = useState(false);

  // Initialize on mount
  useEffect(() => { initialize(); }, []);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      // Ctrl combos — always active
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          useWorkflowStore.getState().saveWorkflow();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          useWorkflowStore.getState().runWorkflow();
          return;
        }
        if (e.key === 'd' && !isInput) {
          e.preventDefault();
          // Duplicate selected node
          const { selectedNode, nodes } = useWorkflowStore.getState();
          if (selectedNode) {
            const orig = nodes.find((n) => n.id === selectedNode);
            if (orig) {
              const dup = {
                ...orig,
                id: `${orig.type}_${++nodeIdCounter}`,
                position: { x: orig.position.x + 40, y: orig.position.y + 40 },
                data: { ...orig.data, properties: { ...(orig.data.properties || {}) }, _status: undefined, _outputs: undefined, _error: undefined },
                selected: false,
              };
              useWorkflowStore.getState().setNodes([...nodes, dup]);
              toast.info('Node duplicated');
            }
          }
          return;
        }
      }

      // Shift combos
      if (e.shiftKey) {
        if (e.key === '!' || e.key === '1') {
          e.preventDefault();
          reactFlowInstance.current?.fitView({ duration: 300 });
          return;
        }
        if (e.key === '\\' || e.key === '|') {
          e.preventDefault();
          setUiMinimized((p) => !p);
          return;
        }
      }

      // Skip single-key shortcuts if user is in an input
      if (isInput) return;

      // ? — Show shortcuts
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(true);
        return;
      }

      // Escape — deselect
      if (e.key === 'Escape') {
        useWorkflowStore.getState().setSelectedNode(null);
        setShowWfMenu(false);
        return;
      }

      // Delete/Backspace — delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selectedNode, nodes, setNodes, setSelectedNode } = useWorkflowStore.getState();
        if (selectedNode) {
          setNodes(nodes.filter((n) => n.id !== selectedNode));
          setSelectedNode(null);
          toast.info('Node deleted');
        }
        return;
      }

      // Single key node creation
      const rf = reactFlowInstance.current;
      switch (e.key.toLowerCase()) {
        case 't':
        case 'p':
          e.preventDefault(); addNodeToCanvas('prompt', rf); break;
        case 'i':
          e.preventDefault(); addNodeToCanvas('image_gen', rf); break;
        case 'v':
          e.preventDefault(); addNodeToCanvas('video_gen', rf); break;
        case 'u':
          e.preventDefault(); addNodeToCanvas('upload', rf); break;
        case 'o':
          e.preventDefault(); addNodeToCanvas('output', rf); break;
        case 'n':
          e.preventDefault(); useWorkflowStore.getState().newWorkflow(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const onNodesChange = useCallback(
    (changes) => setNodes(applyNodeChanges(changes, useWorkflowStore.getState().nodes)),
    [setNodes]
  );
  const onEdgesChange = useCallback(
    (changes) => setEdges(applyEdgeChanges(changes, useWorkflowStore.getState().edges)),
    [setEdges]
  );
  const onConnect = useCallback(
    (params) => setEdges(addEdge({ ...params, type: 'deletable', animated: true, style: { stroke: '#6366f1' } }, useWorkflowStore.getState().edges)),
    [setEdges]
  );
  const onReconnect = useCallback(
    (oldEdge, newConnection) => setEdges(reconnectEdge(oldEdge, newConnection, useWorkflowStore.getState().edges)),
    [setEdges]
  );
  const onNodeClick = useCallback((_, node) => setSelectedNode(node.id), [setSelectedNode]);
  const onPaneClick = useCallback(() => { setSelectedNode(null); setShowWfMenu(false); }, [setSelectedNode]);

  const onDragOver = useCallback((event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = reactFlowInstance.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      if (!position) return;

      const defs = useWorkflowStore.getState().nodeDefinitions;
      const def = defs.find((d) => d.type === type) || { type, displayName: type, inputs: [], outputs: [], properties: [] };
      const defaultProps = {};
      (def.properties || []).forEach((p) => { defaultProps[p.name] = p.default ?? ''; });

      const newNode = {
        id: `${type}_${++nodeIdCounter}`,
        type,
        position,
        data: { nodeType: type, definition: def, properties: defaultProps },
      };
      setNodes([...useWorkflowStore.getState().nodes, newNode]);
      toast.info(`Added ${def.displayName || type}`);
    },
    [setNodes]
  );

  const minimapColor = useCallback((node) => {
    const colors = {
      prompt: '#e8a838', upload: '#4a90d9', image_gen: '#7c3aed',
      image_edit: '#8b5cf6', image_enhance: '#06b6d4',
      video_gen: '#ec4899', video_motion: '#f59e0b', output: '#10b981',
    };
    return colors[node.type] || '#666';
  }, []);

  return (
    <div className="ws-editor">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="ws-loading-overlay">
          <div className="ws-progress-spinner" style={{ width: 32, height: 32 }} />
          <span>Loading workflow...</span>
        </div>
      )}

      {/* Top Bar */}
      <header className="ws-topbar">
        <div className="ws-topbar-left">
          <div className="ws-logo"><FiCommand size={20} /></div>
          <div className="ws-wf-selector" style={{ position: 'relative' }}>
            <input
              className="ws-wf-name"
              value={currentName}
              onChange={(e) => setCurrentName(e.target.value)}
              placeholder="Untitled Workflow"
            />
            {hasUnsavedChanges && <span className="ws-unsaved-dot" title="Unsaved changes" />}
            <button className="ws-wf-dropdown-btn" onClick={() => setShowWfMenu(!showWfMenu)} title="Workflows">
              <FiChevronDown size={14} />
            </button>

            {showWfMenu && (
              <div className="ws-wf-dropdown">
                <div className="ws-wf-dropdown-header">
                  <span>My Workflows</span>
                  <button onClick={() => { useWorkflowStore.getState().newWorkflow(); setShowWfMenu(false); }}>+ New</button>
                </div>
                {workflows.length === 0 && <div className="ws-wf-dropdown-empty">No saved workflows</div>}
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    className={`ws-wf-dropdown-item ${wf.id === currentId ? 'active' : ''}`}
                    onClick={() => { loadWorkflow(wf.id); setShowWfMenu(false); }}
                  >
                    <span>{wf.name || 'Untitled'}</span>
                    <button className="ws-wf-delete-btn" onClick={(e) => { e.stopPropagation(); deleteWorkflow(wf.id); }} title="Delete"><FiX size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ws-topbar-right">
          <button
            className="ws-topbar-shortcut-btn"
            onClick={() => setShowShortcuts(true)}
            title="Keyboard Shortcuts (?)"
          ><FiCommand size={14} /></button>
          <ProfileMenu />
        </div>
      </header>

      <div className="ws-main">
        {!uiMinimized && <Sidebar />}

        <div className="ws-canvas-wrapper" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onInit={(instance) => { reactFlowInstance.current = instance; }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
            defaultEdgeOptions={{ type: 'deletable', animated: true, style: { stroke: '#6366f180' } }}
            proOptions={{ hideAttribution: true }}
            edgesReconnectable
            deleteKeyCode={['Delete', 'Backspace']}
          >
            <Background color="#333" gap={16} size={1} variant="dots" />
            <Controls className="ws-controls" />
            <MiniMap nodeColor={minimapColor} className="ws-minimap" pannable zoomable />
          </ReactFlow>

          <Toolbar />

          {/* Run Results Overlay */}
          {runResults && (
            <div className="ws-results-overlay">
              <div className="ws-results-card">
                <h3 className="ws-results-title">
                  {runResults.status === 'completed' && <FiCheckCircle size={20} className="ws-icon-success" />}
                  {runResults.status === 'partial' && <FiAlertTriangle size={20} className="ws-icon-warning" />}
                  {runResults.status !== 'completed' && runResults.status !== 'partial' && <FiXCircle size={20} className="ws-icon-error" />}
                  {runResults.status === 'completed' ? ' Workflow Complete' :
                   runResults.status === 'partial' ? ' Partial Results' : ' Workflow Failed'}
                </h3>
                {runResults.elapsed && <p className="ws-results-time">Elapsed: {runResults.elapsed}s</p>}

                {runResults.results?.map((r, i) => (
                  <div key={i} className="ws-result-item">
                    <span className="ws-result-label">{r.label}</span>
                    {r.data?.url && (
                      r.data.type === 'video'
                        ? <video src={r.data.url} controls className="ws-result-media" />
                        : <img src={r.data.url} alt={r.label} className="ws-result-media" />
                    )}
                    {r.data?.url && <a href={r.data.url} download className="ws-download-btn"><FiDownload size={14} /> Download</a>}
                  </div>
                ))}

                {runResults.errors && Object.keys(runResults.errors).length > 0 && (
                  <div className="ws-result-errors">
                    {Object.entries(runResults.errors).map(([nid, err]) => (
                      <div key={nid} className="ws-result-error"><strong>{nid}:</strong> {err}</div>
                    ))}
                  </div>
                )}

                <button className="ws-close-results" onClick={() => useWorkflowStore.setState({ runResults: null })}>Close</button>
              </div>
            </div>
          )}
        </div>

        {!uiMinimized && <PropertiesPanel />}
      </div>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcuts isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}
