import { useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
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
  const {
    nodes, edges, setNodes, setEdges,
    nodeDefinitions, loadNodeDefs,
    selectedNode, setSelectedNode,
    currentName, setCurrentName,
    isRunning, runResults,
  } = useWorkflowStore();
  const { user, logout } = useAuthStore();
  const reactFlowWrapper = useRef(null);
  const reactFlowInstance = useRef(null);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges);

  // Sync store ↔ ReactFlow
  useEffect(() => { setRfNodes(nodes); }, [nodes]);
  useEffect(() => { setRfEdges(edges); }, [edges]);
  useEffect(() => { setNodes(rfNodes); }, [rfNodes]);
  useEffect(() => { setEdges(rfEdges); }, [rfEdges]);

  // Load node definitions on mount
  useEffect(() => { loadNodeDefs(); }, []);

  const onConnect = useCallback(
    (params) => setRfEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6366f1' } }, eds)),
    []
  );

  const onNodeClick = useCallback((_, node) => {
    setSelectedNode(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

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

      const def = nodeDefinitions.find((d) => d.type === type) || {};
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

      setRfNodes((nds) => [...nds, newNode]);
    },
    [nodeDefinitions]
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
            nodes={rfNodes}
            edges={rfEdges}
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
