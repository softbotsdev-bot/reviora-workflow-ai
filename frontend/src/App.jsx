import { useAuthStore, useToastStore } from './store';
import AuthPage from './components/AuthPage';
import WorkflowEditor from './components/WorkflowEditor';
import './index.css';

function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div className="ws-toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`ws-toast ws-toast-${t.type}`} onClick={() => removeToast(t.id)}>
          <span className="ws-toast-icon">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : t.type === 'warning' ? '⚠' : 'ℹ'}
          </span>
          <span className="ws-toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const token = useAuthStore((s) => s.token);

  return (
    <>
      {token ? <WorkflowEditor /> : <AuthPage />}
      <ToastContainer />
    </>
  );
}
