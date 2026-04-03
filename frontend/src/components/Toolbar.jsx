import { FiPlay, FiSave, FiFile, FiTrash2, FiZoomIn, FiZoomOut, FiMaximize, FiRotateCcw, FiRotateCw } from 'react-icons/fi';
import { useWorkflowStore } from '../store';

export default function Toolbar() {
  const { saveWorkflow, runWorkflow, newWorkflow, isRunning, runProgress } = useWorkflowStore();

  return (
    <div className="ws-toolbar">
      <div className="ws-toolbar-group">
        <button className="ws-tool-btn" onClick={newWorkflow} title="New Workflow">
          <FiFile size={16} />
        </button>
        <button className="ws-tool-btn" onClick={() => {}} title="Delete Selected">
          <FiTrash2 size={16} />
        </button>
      </div>

      <div className="ws-toolbar-separator" />

      <div className="ws-toolbar-group">
        <button className="ws-tool-btn" title="Zoom In">
          <FiZoomIn size={16} />
        </button>
        <button className="ws-tool-btn" title="Zoom Out">
          <FiZoomOut size={16} />
        </button>
        <button className="ws-tool-btn" title="Fit View">
          <FiMaximize size={16} />
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
          className="ws-tool-btn ws-save-btn"
          onClick={saveWorkflow}
          title="Save Workflow"
        >
          <FiSave size={16} />
          <span>Save</span>
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
