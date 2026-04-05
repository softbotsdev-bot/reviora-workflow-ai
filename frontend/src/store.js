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
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    return { ok: false, error: `Server error (${res.status}): ${text.substring(0, 200)}` };
  }
  return res.json();
}

// ═══════════════════════════════════════════
//  TOAST STORE
// ═══════════════════════════════════════════
let _toastId = 0;
export const useToastStore = create((set) => ({
  toasts: [],
  addToast: (message, type = 'info', duration = 3500) => {
    const id = ++_toastId;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Shortcut helpers
export const toast = {
  success: (msg) => useToastStore.getState().addToast(msg, 'success'),
  error: (msg) => useToastStore.getState().addToast(msg, 'error', 5000),
  info: (msg) => useToastStore.getState().addToast(msg, 'info'),
  warning: (msg) => useToastStore.getState().addToast(msg, 'warning', 4000),
};

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
        toast.success('Login berhasil!');
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
        toast.success('Akun berhasil dibuat!');
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
    localStorage.removeItem('ws_last_wf');
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
  isSaving: false,
  isLoading: false,
  hasUnsavedChanges: false,

  // Load node definitions from server
  loadNodeDefs: async () => {
    try {
      const data = await apiFetch('/api/nodes');
      if (data.ok) set({ nodeDefinitions: data.nodes });
    } catch (e) {
      console.error('Failed to load node defs:', e);
    }
  },

  // Initialize: load workflow list + auto-load last workflow
  initialize: async () => {
    const { loadNodeDefs, listWorkflows } = get();
    await loadNodeDefs();
    await listWorkflows();

    // Auto-load last workflow
    const lastId = localStorage.getItem('ws_last_wf');
    const { workflows } = get();
    if (lastId && workflows.some((w) => w.id === lastId)) {
      await get().loadWorkflow(lastId);
    } else if (workflows.length > 0) {
      await get().loadWorkflow(workflows[0].id);
    }
  },

  // Workflow CRUD
  listWorkflows: async () => {
    try {
      const data = await apiFetch('/api/workflows');
      if (data.ok) set({ workflows: data.workflows || [] });
    } catch (e) {
      console.error('Failed to list workflows:', e);
    }
  },

  loadWorkflow: async (id) => {
    set({ isLoading: true });
    try {
      const data = await apiFetch(`/api/workflows/${id}`);
      if (data.ok && data.workflow) {
        const graph = data.workflow.graph || {};
        set({
          currentId: id,
          currentName: data.workflow.name || 'Untitled',
          nodes: graph.nodes || [],
          edges: graph.edges || [],
          selectedNode: null,
          runResults: null,
          hasUnsavedChanges: false,
        });
        localStorage.setItem('ws_last_wf', id);
        toast.info(`Loaded: ${data.workflow.name || 'Untitled'}`);
      }
    } catch (e) {
      toast.error('Gagal memuat workflow');
    } finally {
      set({ isLoading: false });
    }
  },

  saveWorkflow: async (silent = false) => {
    const { currentId, currentName, nodes, edges, isSaving } = get();
    if (isSaving) return false;

    set({ isSaving: true });
    const id = currentId || Math.random().toString(36).substr(2, 16);

    try {
      const data = await apiFetch('/api/workflows', {
        method: 'POST',
        body: JSON.stringify({
          id,
          name: currentName,
          graph: { nodes, edges },
        }),
      });
      if (data.ok) {
        set({ currentId: data.id, hasUnsavedChanges: false });
        localStorage.setItem('ws_last_wf', data.id);
        if (!silent) toast.success('Workflow tersimpan!');
        // Refresh list
        get().listWorkflows();
        return true;
      }
      if (!silent) toast.error(data.error || 'Gagal menyimpan');
      return false;
    } catch (e) {
      if (!silent) toast.error('Gagal menyimpan workflow');
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  deleteWorkflow: async (id) => {
    try {
      await apiFetch(`/api/workflows/${id}`, { method: 'DELETE' });
      const { workflows, currentId } = get();
      set({ workflows: workflows.filter((w) => w.id !== id) });
      if (currentId === id) {
        set({ currentId: null, currentName: 'Untitled Workflow', nodes: [], edges: [], hasUnsavedChanges: false });
        localStorage.removeItem('ws_last_wf');
      }
      toast.info('Workflow dihapus');
    } catch (e) {
      toast.error('Gagal menghapus workflow');
    }
  },

  // Canvas state — mark unsaved
  setNodes: (nodes) => set({ nodes, hasUnsavedChanges: true }),
  setEdges: (edges) => set({ edges, hasUnsavedChanges: true }),
  setCurrentName: (name) => set({ currentName: name, hasUnsavedChanges: true }),
  setSelectedNode: (nodeId) => set({ selectedNode: nodeId }),

  newWorkflow: () => {
    set({
      currentId: null,
      currentName: 'Untitled Workflow',
      nodes: [],
      edges: [],
      selectedNode: null,
      runResults: null,
      hasUnsavedChanges: false,
    });
    localStorage.removeItem('ws_last_wf');
    toast.info('New workflow created');
  },

  // Execution — targetNodeId: only run up to that node (null = run all)
  runWorkflow: async (targetNodeId = null) => {
    const { nodes, edges, isRunning } = get();
    if (isRunning) return;
    if (nodes.length === 0) {
      toast.warning('Canvas kosong — tambahkan node dulu');
      return;
    }

    set({ isRunning: true, runProgress: null, runResults: null });
    toast.info(targetNodeId ? 'Running node...' : 'Menjalankan workflow...');

    try {
      const body = { graph: { nodes, edges } };
      if (targetNodeId) body.target_node_id = targetNodeId;

      const data = await apiFetch('/api/workflows/run', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!data.ok) {
        set({ isRunning: false, runResults: { status: 'failed', errors: { _: data.error } } });
        toast.error(data.error || 'Workflow gagal');
        return;
      }

      // Connect to SSE for progress
      const token = localStorage.getItem('ws_token');
      const evtSource = new EventSource(
        `${API_BASE}/api/workflows/run/${data.run_id}/events?token=${token}`
      );

      evtSource.addEventListener('node_start', (e) => {
        const d = JSON.parse(e.data);
        set((s) => ({
          runProgress: { ...d, stage: 'running' },
          nodes: s.nodes.map((n) =>
            n.id === d.node_id ? { ...n, data: { ...n.data, _status: 'running', _error: null } } : n
          ),
        }));
      });

      evtSource.addEventListener('node_complete', (e) => {
        const d = JSON.parse(e.data);
        set((s) => ({
          runProgress: { ...d, stage: 'done' },
          nodes: s.nodes.map((n) =>
            n.id === d.node_id ? { ...n, data: { ...n.data, _status: 'done', _outputs: d.outputs } } : n
          ),
        }));
      });

      evtSource.addEventListener('node_error', (e) => {
        const d = JSON.parse(e.data);
        set((s) => ({
          runProgress: { ...d, stage: 'error' },
          nodes: s.nodes.map((n) =>
            n.id === d.node_id ? { ...n, data: { ...n.data, _status: 'error', _error: d.error } } : n
          ),
        }));
        toast.error(`Node error: ${d.error}`);
      });

      evtSource.addEventListener('workflow_done', (e) => {
        const result = JSON.parse(e.data);
        set({ isRunning: false, runResults: null, runProgress: null });
        evtSource.close();
        const elapsed = result.elapsed ? ` (${result.elapsed}s)` : '';
        if (result.status === 'completed') {
          toast.success(`✅ Selesai${elapsed}`);
        } else if (result.status === 'partial') {
          const errCount = result.errors ? Object.keys(result.errors).length : 0;
          toast.warning(`⚠️ Selesai dengan ${errCount} error${elapsed}`);
        } else {
          toast.error(`❌ Workflow gagal${elapsed}`);
        }
      });

      evtSource.onerror = () => {
        set({ isRunning: false, runProgress: null });
        evtSource.close();
        toast.error('Koneksi SSE terputus');
      };
    } catch (e) {
      set({ isRunning: false, runResults: { status: 'failed', errors: { _: e.message } } });
      toast.error(e.message);
    }
  },
}));

export { apiFetch };
