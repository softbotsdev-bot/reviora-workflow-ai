import { create } from 'zustand';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Helper: fetch with auth
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('ws_token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('ws_token');
    localStorage.removeItem('ws_user');
    window.location.reload();
    throw new Error('Session expired');
  }
  return res.json();
}

// ═══════════════════════════════════════════
//  AUTH STORE
// ═══════════════════════════════════════════
export const useAuthStore = create((set) => ({
  token: localStorage.getItem('ws_token') || null,
  user: JSON.parse(localStorage.getItem('ws_user') || 'null'),
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (data.ok) {
        localStorage.setItem('ws_token', data.token);
        localStorage.setItem('ws_user', JSON.stringify(data.user));
        set({ token: data.token, user: data.user, loading: false });
        return true;
      }
      set({ error: data.error || 'Login failed', loading: false });
      return false;
    } catch (e) {
      set({ error: e.message, loading: false });
      return false;
    }
  },

  register: async (email, password, displayName) => {
    set({ loading: true, error: null });
    try {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, display_name: displayName }),
      });
      if (data.ok) {
        localStorage.setItem('ws_token', data.token);
        localStorage.setItem('ws_user', JSON.stringify(data.user));
        set({ token: data.token, user: data.user, loading: false });
        return true;
      }
      set({ error: data.error || 'Registration failed', loading: false });
      return false;
    } catch (e) {
      set({ error: e.message, loading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('ws_token');
    localStorage.removeItem('ws_user');
    set({ token: null, user: null });
  },

  clearError: () => set({ error: null }),
}));

// ═══════════════════════════════════════════
//  WORKFLOW STORE
// ═══════════════════════════════════════════
export const useWorkflowStore = create((set, get) => ({
  workflows: [],
  currentId: null,
  currentName: 'Untitled Workflow',
  nodes: [],
  edges: [],
  nodeDefinitions: [],
  selectedNode: null,
  isRunning: false,
  runProgress: null,
  runResults: null,

  // Load node definitions from server
  loadNodeDefs: async () => {
    try {
      const data = await apiFetch('/api/nodes');
      if (data.ok) set({ nodeDefinitions: data.nodes });
    } catch (e) {
      console.error('Failed to load node defs:', e);
    }
  },

  // Workflow CRUD
  listWorkflows: async () => {
    const data = await apiFetch('/api/workflows');
    if (data.ok) set({ workflows: data.workflows });
  },

  loadWorkflow: async (id) => {
    const data = await apiFetch(`/api/workflows/${id}`);
    if (data.ok && data.workflow) {
      const graph = data.workflow.graph || {};
      set({
        currentId: id,
        currentName: data.workflow.name || 'Untitled',
        nodes: graph.nodes || [],
        edges: graph.edges || [],
      });
    }
  },

  saveWorkflow: async () => {
    const { currentId, currentName, nodes, edges } = get();
    const id = currentId || Math.random().toString(36).substr(2, 16);
    const data = await apiFetch('/api/workflows', {
      method: 'POST',
      body: JSON.stringify({
        id,
        name: currentName,
        graph: { nodes, edges },
      }),
    });
    if (data.ok) {
      set({ currentId: data.id });
    }
    return data.ok;
  },

  deleteWorkflow: async (id) => {
    await apiFetch(`/api/workflows/${id}`, { method: 'DELETE' });
    const { workflows, currentId } = get();
    set({ workflows: workflows.filter(w => w.id !== id) });
    if (currentId === id) {
      set({ currentId: null, currentName: 'Untitled Workflow', nodes: [], edges: [] });
    }
  },

  // Canvas state
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setCurrentName: (name) => set({ currentName: name }),
  setSelectedNode: (node) => set({ selectedNode: node }),

  newWorkflow: () => set({
    currentId: null,
    currentName: 'Untitled Workflow',
    nodes: [],
    edges: [],
    selectedNode: null,
    runResults: null,
  }),

  // Execution
  runWorkflow: async () => {
    const { nodes, edges } = get();
    set({ isRunning: true, runProgress: null, runResults: null });

    try {
      const data = await apiFetch('/api/workflows/run', {
        method: 'POST',
        body: JSON.stringify({ graph: { nodes, edges } }),
      });

      if (!data.ok) {
        set({ isRunning: false, runResults: { status: 'failed', errors: { _: data.error } } });
        return;
      }

      // Connect to SSE for progress
      const token = localStorage.getItem('ws_token');
      const evtSource = new EventSource(
        `${API_BASE}/api/workflows/run/${data.run_id}/events?token=${token}`
      );

      evtSource.addEventListener('node_start', (e) => {
        const d = JSON.parse(e.data);
        set({ runProgress: { ...d, stage: 'running' } });
      });

      evtSource.addEventListener('node_complete', (e) => {
        const d = JSON.parse(e.data);
        set((s) => ({
          runProgress: { ...d, stage: 'done' },
          nodes: s.nodes.map(n =>
            n.id === d.node_id ? { ...n, data: { ...n.data, _status: 'done', _outputs: d.outputs } } : n
          ),
        }));
      });

      evtSource.addEventListener('node_error', (e) => {
        const d = JSON.parse(e.data);
        set((s) => ({
          runProgress: { ...d, stage: 'error' },
          nodes: s.nodes.map(n =>
            n.id === d.node_id ? { ...n, data: { ...n.data, _status: 'error', _error: d.error } } : n
          ),
        }));
      });

      evtSource.addEventListener('workflow_done', (e) => {
        const result = JSON.parse(e.data);
        set({ isRunning: false, runResults: result });
        evtSource.close();
      });

      evtSource.onerror = () => {
        set({ isRunning: false });
        evtSource.close();
      };
    } catch (e) {
      set({ isRunning: false, runResults: { status: 'failed', errors: { _: e.message } } });
    }
  },
}));

export { apiFetch };
