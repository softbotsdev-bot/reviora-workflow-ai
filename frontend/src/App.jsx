import { useAuthStore } from './store';
import AuthPage from './components/AuthPage';
import WorkflowEditor from './components/WorkflowEditor';
import './index.css';

export default function App() {
  const { token } = useAuthStore();

  if (!token) {
    return <AuthPage />;
  }

  return <WorkflowEditor />;
}
