import { useEffect } from 'react';
import { FiX } from 'react-icons/fi';

const SHORTCUTS = [
  // Left column
  [
    { keys: 'Ctrl + Enter', desc: 'Run Workflow' },
    { keys: 'Ctrl + S', desc: 'Save Workflow' },
    { keys: 'T / P', desc: 'Prompt Node' },
    { keys: 'I', desc: 'Image Node' },
    { keys: 'V', desc: 'Video Node' },
    { keys: 'U', desc: 'Upload Node' },
    { keys: 'O', desc: 'Output Node' },
    { keys: 'N', desc: 'New Workflow' },
    { keys: 'Delete / Backspace', desc: 'Delete selected elements' },
    { keys: 'Ctrl + D', desc: 'Duplicate Node' },
    { keys: 'Ctrl + A', desc: 'Select All' },
  ],
  // Right column
  [
    { keys: 'Ctrl + C', desc: 'Copy' },
    { keys: 'Ctrl + V', desc: 'Paste' },
    { keys: 'Ctrl + Z', desc: 'Undo' },
    { keys: 'Ctrl + Y', desc: 'Redo' },
    { keys: 'Ctrl + +', desc: 'Zoom in' },
    { keys: 'Ctrl + -', desc: 'Zoom out' },
    { keys: 'Ctrl + Scroll', desc: 'Zoom In / Zoom Out' },
    { keys: 'Shift + 1', desc: 'Zoom to fit' },
    { keys: 'Shift + \\', desc: 'Minimize UI' },
    { keys: 'Escape', desc: 'Deselect / Close panel' },
    { keys: '?', desc: 'Show Shortcuts' },
  ],
];

export default function KeyboardShortcuts({ isOpen, onClose }) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="ws-shortcuts-overlay" onClick={onClose}>
      <div className="ws-shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ws-shortcuts-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="ws-shortcuts-close" onClick={onClose}><FiX size={18} /></button>
        </div>
        <div className="ws-shortcuts-body">
          {SHORTCUTS.map((column, ci) => (
            <div key={ci} className="ws-shortcuts-column">
              {column.map((s, si) => (
                <div key={si} className="ws-shortcut-row">
                  <div className="ws-shortcut-keys">
                    {s.keys.split(' + ').map((k, ki) => (
                      <span key={ki}>
                        {ki > 0 && <span className="ws-shortcut-plus">+</span>}
                        <kbd className="ws-shortcut-key">{k.trim()}</kbd>
                      </span>
                    ))}
                  </div>
                  <span className="ws-shortcut-desc">{s.desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
