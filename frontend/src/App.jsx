import { useAuthStore, useToastStore } from './store';
import { FiCheck, FiX, FiAlertTriangle, FiInfo } from 'react-icons/fi';
import AuthPage from './components/AuthPage';
import WorkflowEditor from './components/WorkflowEditor';
import './index.css';

const TOAST_ICONS = {
  success: FiCheck,
  error: FiX,
  warning: FiAlertTriangle,
  info: FiInfo,
};

function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  if (toasts.length === 0) return null;

  return (
    <div className="ws-toast-container">
      {toasts.map((t) => {
        const Icon = TOAST_ICONS[t.type] || FiInfo;
        return (
          <div key={t.id} className={`ws-toast ws-toast-${t.type}`} onClick={() => removeToast(t.id)}>
            <span className="ws-toast-icon"><Icon size={16} /></span>
            <span className="ws-toast-msg">{t.message}</span>
          </div>
        );
      })}
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
