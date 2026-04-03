import { useState, useEffect, useRef } from 'react';
import { FiUser, FiLogOut, FiLink, FiCheck, FiSend, FiChevronDown } from 'react-icons/fi';
import { useAuthStore, apiFetch, toast } from '../store';

export default function ProfileMenu() {
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [tgInput, setTgInput] = useState('');
  const [linking, setLinking] = useState(false);
  const menuRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load profile on open
  useEffect(() => {
    if (open && !profile) {
      apiFetch('/api/auth/me').then((data) => {
        if (data.ok) setProfile(data.user);
      });
    }
  }, [open]);

  const handleLink = async () => {
    const tgId = tgInput.trim();
    if (!tgId) { toast.warning('Masukkan Telegram User ID'); return; }
    setLinking(true);
    try {
      const data = await apiFetch('/api/auth/link-telegram', {
        method: 'POST',
        body: JSON.stringify({ telegram_user_id: tgId }),
      });
      if (data.ok) {
        toast.success('Telegram berhasil di-link!');
        setProfile((p) => p ? { ...p, telegram_user_id: parseInt(tgId) } : p);
        setTgInput('');
      } else {
        toast.error(data.error || 'Gagal link Telegram');
      }
    } catch (e) {
      toast.error('Gagal link Telegram');
    } finally {
      setLinking(false);
    }
  };

  const isLinked = profile?.telegram_user_id;

  return (
    <div className="ws-profile-menu" ref={menuRef}>
      <button className="ws-profile-btn" onClick={() => setOpen(!open)}>
        <div className="ws-profile-avatar">
          <FiUser size={14} />
        </div>
        <span className="ws-profile-name">{user?.display_name || user?.email?.split('@')[0] || 'User'}</span>
        <FiChevronDown size={12} />
      </button>

      {open && (
        <div className="ws-profile-dropdown">
          {/* User info */}
          <div className="ws-profile-info">
            <div className="ws-profile-avatar-lg"><FiUser size={20} /></div>
            <div>
              <div className="ws-profile-display">{user?.display_name || 'User'}</div>
              <div className="ws-profile-email">{user?.email}</div>
            </div>
          </div>

          <div className="ws-profile-divider" />

          {/* Telegram link */}
          <div className="ws-profile-section">
            <div className="ws-profile-section-title">
              <FiSend size={13} />
              <span>Telegram Account</span>
            </div>

            {isLinked ? (
              <div className="ws-tg-linked">
                <FiCheck size={14} className="ws-icon-success" />
                <span>Linked: <strong>{profile.telegram_user_id}</strong></span>
                {profile.plan && (
                  <span className="ws-tg-plan">{profile.plan.name || 'Free'}</span>
                )}
              </div>
            ) : (
              <div className="ws-tg-link-form">
                <p className="ws-tg-hint">
                  Link akun Telegram untuk menggunakan kredit generate. Kirim <code>/myid</code> ke bot untuk mendapatkan ID.
                </p>
                <div className="ws-tg-input-row">
                  <input
                    type="text"
                    className="ws-tg-input"
                    placeholder="Telegram User ID"
                    value={tgInput}
                    onChange={(e) => setTgInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLink()}
                  />
                  <button className="ws-tg-link-btn" onClick={handleLink} disabled={linking}>
                    {linking ? '...' : <FiLink size={14} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="ws-profile-divider" />

          {/* Logout */}
          <button className="ws-profile-logout" onClick={logout}>
            <FiLogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}
