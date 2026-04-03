import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import GenericNode from './nodes/GenericNode';
import Sidebar from './Sidebar';
import PropertiesPanel from './PropertiesPanel';
import Toolbar from './Toolbar';
import { useWorkflowStore, useAuthStore } from '../store';
import { useEffect } from 'react';

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

let nodeIdCounter = 0;

export default function WorkflowEditor() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const setNodes = useWorkflowStore((s) => s.setNodes);
  const setEdges = useWorkflowStore((s) => s.setEdges);
  const nodeDefinitions = useWorkflowStore((s) => s.nodeDefinitions);
  const loadNodeDefs = useWorkflowStore((s) => s.loadNodeDefs);
  const selectedNode = useWorkflowStore((s) => s.selectedNode);
  const setSelectedNode = useWorkflowStore((s) => s.setSelectedNode);
  const currentName = useWorkflowStore((s) => s.currentName);
  const setCurrentName = useWorkflowStore((s) => s.setCurrentName);
  const isRunning = useWorkflowStore((s) => s.isRunning);
  const runResults = useWorkflowStore((s) => s.runResults);

  const { user, logout } = useAuthStore();
  const reactFlowWrapper = useRef(null);
  const reactFlowInstance = useRef(null);

  // Load node definitions on mount
  useEffect(() => { loadNodeDefs(); }, []);

  // Direct handlers — no bidirectional sync needed
  const onNodesChange = useCallback(
    (changes) => {
      setNodes(applyNodeChanges(changes, useWorkflowStore.getState().nodes));
    },
    [setNodes]
  );

  const onEdgesChange = useCallback(
    (changes) => {
      setEdges(applyEdgeChanges(changes, useWorkflowStore.getState().edges));
    },
    [setEdges]
  );

  const onConnect = useCallback(
    (params) => {
      setEdges(
        addEdge(
          { ...params, animated: true, style: { stroke: '#6366f1' } },
          useWorkflowStore.getState().edges
        )
      );
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node.id);
  }, [setSelectedNode]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = reactFlowInstance.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (!position) return;

      const defs = useWorkflowStore.getState().nodeDefinitions;
      const def = defs.find((d) => d.type === type) || {
        type,
        displayName: type,
        inputs: [],
        outputs: [],
        properties: [],
      };
      const defaultProps = {};
      (def.properties || []).forEach((p) => {
        defaultProps[p.name] = p.default ?? '';
      });

      const newNode = {
        id: `${type}_${++nodeIdCounter}_${Date.now().toString(36)}`,
        type,
        position,
        data: {
          nodeType: type,
          definition: def,
          properties: defaultProps,
        },
      };

      setNodes([...useWorkflowStore.getState().nodes, newNode]);
    },
    [setNodes]
  );

  // Memoize minimap node color
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
      {/* Top Bar */}
      <header className="ws-topbar">
        <div className="ws-topbar-left">
          <div className="ws-logo">◈</div>
          <input
            className="ws-wf-name"
            value={currentName}
            onChange={(e) => setCurrentName(e.target.value)}
            placeholder="Untitled Workflow"
          />
        </div>
        <div className="ws-topbar-right">
          <div className="ws-user-info">
            <span>{user?.display_name || user?.email || 'User'}</span>
            <button className="ws-logout-btn" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      <div className="ws-main">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Canvas */}
        <div className="ws-canvas-wrapper" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onInit={(instance) => { reactFlowInstance.current = instance; }}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
            defaultEdgeOptions={{ animated: true, style: { stroke: '#6366f180' } }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#333" gap={16} size={1} variant="dots" />
            <Controls className="ws-controls" />
            <MiniMap nodeColor={minimapColor} className="ws-minimap" pannable zoomable />
          </ReactFlow>

          {/* Bottom Toolbar */}
          <Toolbar />

          {/* Run Results Overlay */}
          {runResults && (
            <div className="ws-results-overlay">
              <div className="ws-results-card">
                <h3>
                  {runResults.status === 'completed' ? '✅ Workflow Complete' :
                   runResults.status === 'partial' ? '⚠️ Partial Results' : '❌ Workflow Failed'}
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
                    {r.data?.url && (
                      <a href={r.data.url} download className="ws-download-btn">⬇ Download</a>
                    )}
                  </div>
                ))}

                {runResults.errors && Object.keys(runResults.errors).length > 0 && (
                  <div className="ws-result-errors">
                    {Object.entries(runResults.errors).map(([nid, err]) => (
                      <div key={nid} className="ws-result-error">
                        <strong>{nid}:</strong> {err}
                      </div>
                    ))}
                  </div>
                )}

                <button className="ws-close-results" onClick={() => useWorkflowStore.setState({ runResults: null })}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Properties Panel */}
        <PropertiesPanel />
      </div>
    </div>
  );
}
