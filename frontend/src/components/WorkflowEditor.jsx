import { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  reconnectEdge,
  BaseEdge,
  getBezierPath,
  EdgeLabelRenderer,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  FiCommand, FiChevronDown, FiX, FiDownload,
  FiCheckCircle, FiAlertTriangle, FiXCircle,
  FiImage, FiType, FiUpload, FiFilm, FiTrash2, FiCopy,
  FiEdit3, FiZap, FiMove, FiScissors,
} from 'react-icons/fi';

import GenericNode from './nodes/GenericNode';
import Sidebar from './Sidebar';
import PropertiesPanel from './PropertiesPanel';
import Toolbar from './Toolbar';
import KeyboardShortcuts from './KeyboardShortcuts';
import ProfileMenu from './ProfileMenu';
import { useWorkflowStore, useAuthStore, toast } from '../store';

// Edge colors by data type
const EDGE_COLORS = { text: '#e8a838', file: '#3b82f6', any: '#6366f1' };

// Custom edge with delete button
function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const color = data?.color || style?.stroke || '#6366f1';
  const edgeStyle = { ...style, stroke: color, strokeWidth: 2.5, opacity: 0.85 };
  const onDelete = (evt) => {
    evt.stopPropagation();
    const edges = useWorkflowStore.getState().edges;
    useWorkflowStore.getState().setEdges(edges.filter((e) => e.id !== id));
  };
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
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
  const pendingConnection = useRef(null); // tracks dragged edge for drop-to-add
  const [showWfMenu, setShowWfMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [uiMinimized, setUiMinimized] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null); // {x, y, nodeId?, edgeDrop?}

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

  // Autosave — debounced 2s after changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const timer = setTimeout(() => {
      const { isRunning, isSaving } = useWorkflowStore.getState();
      if (!isRunning && !isSaving) {
        useWorkflowStore.getState().saveWorkflow(true);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [hasUnsavedChanges, nodes, edges]);

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
  // ── Type-safe connection validation ──
  // Text handles can only connect to text inputs, file handles to file inputs
  const isValidConnection = useCallback((connection) => {
    const nodes = useWorkflowStore.getState().nodes;
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    if (!sourceNode || !targetNode) return false;

    // Don't allow self-connection
    if (connection.source === connection.target) return false;

    const srcDef = sourceNode.data?.definition || {};
    const tgtDef = targetNode.data?.definition || {};
    const srcOutput = (srcDef.outputs || []).find(o => o.name === connection.sourceHandle);
    const tgtInput = (tgtDef.inputs || []).find(i => i.name === connection.targetHandle);
    if (!srcOutput || !tgtInput) return false;

    // Type compatibility: text→text, file→file, file→any (flexible)
    const srcType = srcOutput.type || 'any';
    const tgtType = tgtInput.type || 'any';
    if (srcType === 'any' || tgtType === 'any') return true;
    if (srcType === tgtType) return true;

    // Block incompatible: text→file, file→text
    return false;
  }, []);

  const onConnect = useCallback(
    (params) => {
      // Validate before connecting
      const nodes = useWorkflowStore.getState().nodes;
      const sourceNode = nodes.find(n => n.id === params.source);
      const targetNode = nodes.find(n => n.id === params.target);
      const srcDef = sourceNode?.data?.definition || {};
      const tgtDef = targetNode?.data?.definition || {};
      const srcOutput = (srcDef.outputs || []).find(o => o.name === params.sourceHandle);
      const tgtInput = (tgtDef.inputs || []).find(i => i.name === params.targetHandle);

      if (srcOutput && tgtInput && srcOutput.type !== 'any' && tgtInput.type !== 'any' && srcOutput.type !== tgtInput.type) {
        toast.error(`Cannot connect ${srcOutput.type} → ${tgtInput.type}`);
        return;
      }

      // Determine edge color from source handle type
      const srcType = srcOutput?.type || 'any';
      const edgeColor = EDGE_COLORS[srcType] || EDGE_COLORS.any;

      setEdges(addEdge({
        ...params, type: 'deletable', animated: false,
        style: { stroke: edgeColor, strokeWidth: 2.5 },
        data: { color: edgeColor, sourceType: srcType },
      }, useWorkflowStore.getState().edges));
    },
    [setEdges]
  );
  const onReconnect = useCallback(
    (oldEdge, newConnection) => setEdges(reconnectEdge(oldEdge, newConnection, useWorkflowStore.getState().edges)),
    [setEdges]
  );
  const onNodeClick = useCallback((_, node) => setSelectedNode(node.id), [setSelectedNode]);
  const onPaneClick = useCallback(() => { setSelectedNode(null); setShowWfMenu(false); setCtxMenu(null); }, [setSelectedNode]);

  // Track connection start for edge-drop
  const onConnectStart = useCallback((_, params) => {
    pendingConnection.current = params;
  }, []);
  const onConnectEnd = useCallback((event) => {
    // Check if dropped on empty canvas (not on a handle)
    const target = event.target;
    if (target.classList.contains('react-flow__handle')) return;

    const conn = pendingConnection.current;
    if (!conn) return;

    const { clientX, clientY } = event.changedTouches ? event.changedTouches[0] : event;
    const flowPos = reactFlowInstance.current?.screenToFlowPosition({ x: clientX, y: clientY });
    if (!flowPos) return;

    // Determine source handle type for filtering
    const srcNode = useWorkflowStore.getState().nodes.find(n => n.id === conn.nodeId);
    const srcDef = srcNode?.data?.definition || {};
    const srcHandle = (srcDef.outputs || []).find(o => o.name === conn.handleId);
    const srcType = srcHandle?.type || 'any';

    setCtxMenu({
      x: clientX, y: clientY, flowPos, nodeId: null,
      edgeDrop: { sourceNodeId: conn.nodeId, sourceHandleId: conn.handleId, sourceType: srcType },
    });
    pendingConnection.current = null;
  }, []);

  // Custom right-click context menu
  const onPaneContextMenu = useCallback((event) => {
    event.preventDefault();
    const position = reactFlowInstance.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setCtxMenu({ x: event.clientX, y: event.clientY, flowPos: position, nodeId: null });
  }, []);
  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setCtxMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
  }, []);
  const ctxAddNode = useCallback((type) => {
    if (ctxMenu?.flowPos) {
      const defs = useWorkflowStore.getState().nodeDefinitions;
      const def = defs.find((d) => d.type === type) || { type, displayName: type, inputs: [], outputs: [], properties: [] };
      const defaultProps = {};
      (def.properties || []).forEach((p) => { defaultProps[p.name] = p.default ?? ''; });
      const newId = `${type}_${Date.now()}`;
      const newNode = {
        id: newId,
        type,
        position: ctxMenu.flowPos,
        data: { nodeType: type, definition: def, properties: defaultProps },
      };
      const currentNodes = useWorkflowStore.getState().nodes;
      setNodes([...currentNodes, newNode]);

      // Auto-connect if this was an edge-drop
      if (ctxMenu.edgeDrop) {
        const { sourceNodeId, sourceHandleId, sourceType } = ctxMenu.edgeDrop;
        // Find a compatible target input on the new node
        const targetInput = (def.inputs || []).find(inp => {
          const tType = inp.type || 'any';
          return sourceType === 'any' || tType === 'any' || sourceType === tType;
        });
        if (targetInput) {
          const edgeColor = EDGE_COLORS[sourceType] || EDGE_COLORS.any;
          const newEdge = {
            id: `e-${sourceNodeId}-${newId}-${Date.now()}`,
            source: sourceNodeId,
            sourceHandle: sourceHandleId,
            target: newId,
            targetHandle: targetInput.name,
            type: 'deletable', animated: false,
            style: { stroke: edgeColor, strokeWidth: 2.5 },
            data: { color: edgeColor, sourceType },
          };
          setEdges([...useWorkflowStore.getState().edges, newEdge]);
        }
      }

      toast.info(`Added ${def.displayName || type}`);
    }
    setCtxMenu(null);
  }, [ctxMenu, setNodes, setEdges]);
  const ctxDeleteNode = useCallback(() => {
    if (ctxMenu?.nodeId) {
      setNodes(useWorkflowStore.getState().nodes.filter(n => n.id !== ctxMenu.nodeId));
      setEdges(useWorkflowStore.getState().edges.filter(e => e.source !== ctxMenu.nodeId && e.target !== ctxMenu.nodeId));
      setSelectedNode(null);
    }
    setCtxMenu(null);
  }, [ctxMenu, setNodes, setEdges, setSelectedNode]);
  const ctxDuplicateNode = useCallback(() => {
    if (ctxMenu?.nodeId) {
      const orig = useWorkflowStore.getState().nodes.find(n => n.id === ctxMenu.nodeId);
      if (orig) {
        const dup = { ...orig, id: `${orig.type}_${Date.now()}`, position: { x: orig.position.x + 40, y: orig.position.y + 40 }, data: { ...orig.data, _status: undefined, _outputs: undefined, _error: undefined } };
        setNodes([...useWorkflowStore.getState().nodes, dup]);
        toast.info('Node duplicated');
      }
    }
    setCtxMenu(null);
  }, [ctxMenu, setNodes]);

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
        {!uiMinimized && !sidebarCollapsed && <Sidebar />}

        {/* Sidebar collapse toggle */}
        <button
          className="ws-sidebar-toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          {sidebarCollapsed ? '▶' : '◀'}
        </button>

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
            snapToGrid
            snapGrid={[16, 16]}
            connectionLineStyle={{ stroke: '#e8a838', strokeWidth: 2.5 }}
            defaultEdgeOptions={{ type: 'deletable', animated: false, style: { stroke: '#6366f1', strokeWidth: 2.5 } }}
            proOptions={{ hideAttribution: true }}
            edgesReconnectable
            deleteKeyCode={['Delete', 'Backspace']}
            isValidConnection={isValidConnection}
            onPaneContextMenu={onPaneContextMenu}
            onNodeContextMenu={onNodeContextMenu}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            minZoom={0.1}
            maxZoom={3}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          >
            <Background color="#333" gap={16} size={1} variant="dots" />
            <Controls className="ws-controls" showInteractive={false} />
          </ReactFlow>

          <Toolbar />

          {/* Custom Context Menu */}
          {ctxMenu && (
            <div className="ws-ctx-overlay" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}>
              <div className="ws-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
                {ctxMenu.nodeId ? (
                  <>
                    <div className="ws-ctx-header">Node</div>
                    <button onClick={ctxDuplicateNode}><FiCopy size={13} /> Duplicate</button>
                    <button onClick={() => { setSelectedNode(ctxMenu.nodeId); setCtxMenu(null); }}><FiEdit3 size={13} /> Properties</button>
                    <div className="ws-ctx-sep" />
                    <button className="ws-ctx-danger" onClick={ctxDeleteNode}><FiTrash2 size={13} /> Delete</button>
                  </>
                ) : (
                  <>
                    <div className="ws-ctx-header">Add Node</div>
                    <button onClick={() => ctxAddNode('prompt')}><FiType size={13} /> Prompt</button>
                    <button onClick={() => ctxAddNode('upload')}><FiUpload size={13} /> Upload</button>
                    <div className="ws-ctx-sep" />
                    <button onClick={() => ctxAddNode('image_gen')}><FiImage size={13} /> Generate Image</button>
                    <button onClick={() => ctxAddNode('image_edit')}><FiEdit3 size={13} /> Edit Image</button>
                    <button onClick={() => ctxAddNode('image_enhance')}><FiZap size={13} /> Enhance Image</button>
                    <div className="ws-ctx-sep" />
                    <button onClick={() => ctxAddNode('video_gen')}><FiFilm size={13} /> Generate Video</button>
                    <button onClick={() => ctxAddNode('video_motion')}><FiMove size={13} /> Video Motion</button>
                    <div className="ws-ctx-sep" />
                    <button onClick={() => ctxAddNode('output')}><FiDownload size={13} /> Output</button>
                  </>
                )}
              </div>
            </div>
          )}


        </div>

        {selectedNode && <PropertiesPanel />}
      </div>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcuts isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}
