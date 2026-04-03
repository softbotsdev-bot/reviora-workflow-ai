import { FiPlay, FiSave, FiFile, FiTrash2, FiMaximize, FiRotateCcw, FiRotateCw } from 'react-icons/fi';
import { useWorkflowStore } from '../store';

export default function Toolbar() {
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow);
  const runWorkflow = useWorkflowStore((s) => s.runWorkflow);
  const newWorkflow = useWorkflowStore((s) => s.newWorkflow);
  const isRunning = useWorkflowStore((s) => s.isRunning);
  const isSaving = useWorkflowStore((s) => s.isSaving);
  const runProgress = useWorkflowStore((s) => s.runProgress);
  const hasUnsavedChanges = useWorkflowStore((s) => s.hasUnsavedChanges);

  return (
    <div className="ws-toolbar">
      <div className="ws-toolbar-group">
        <button className="ws-tool-btn" onClick={newWorkflow} title="New Workflow">
          <FiFile size={16} />
        </button>
        <button className="ws-tool-btn" onClick={() => {
          const { selectedNode, nodes, setNodes, setSelectedNode } = useWorkflowStore.getState();
          if (selectedNode) {
            setNodes(nodes.filter((n) => n.id !== selectedNode));
            setSelectedNode(null);
          }
        }} title="Delete Selected">
          <FiTrash2 size={16} />
        </button>
      </div>

      <div className="ws-toolbar-separator" />

      <div className="ws-toolbar-group">
        <button className="ws-tool-btn" title="Undo">
          <FiRotateCcw size={16} />
        </button>
        <button className="ws-tool-btn" title="Redo">
          <FiRotateCw size={16} />
        </button>
      </div>

      <div className="ws-toolbar-spacer" />

      {/* Progress indicator */}
      {isRunning && runProgress && (
        <div className="ws-toolbar-progress">
          <div className="ws-progress-spinner" />
          <span>
            {runProgress.type} ({runProgress.index + 1}/{runProgress.total})
          </span>
        </div>
      )}

      <div className="ws-toolbar-group">
        <button
          className={`ws-tool-btn ws-save-btn ${hasUnsavedChanges ? 'unsaved' : ''}`}
          onClick={saveWorkflow}
          disabled={isSaving}
          title="Save Workflow (Ctrl+S)"
        >
          <FiSave size={16} />
          <span>{isSaving ? 'Saving...' : 'Save'}</span>
          {hasUnsavedChanges && <span className="ws-unsaved-indicator" />}
        </button>
        <button
          className={`ws-tool-btn ws-run-btn ${isRunning ? 'running' : ''}`}
          onClick={runWorkflow}
          disabled={isRunning}
          title="Run Workflow"
        >
          <FiPlay size={16} />
          <span>{isRunning ? 'Running...' : 'Run'}</span>
        </button>
      </div>
    </div>
  );
}
