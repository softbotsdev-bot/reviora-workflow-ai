import { useState, useEffect, useRef } from 'react';
import { FiUser, FiLogOut, FiLink, FiCheck, FiSend, FiChevronDown, FiUnlock, FiCopy, FiRefreshCw } from 'react-icons/fi';
import { useAuthStore, apiFetch, toast } from '../store';

export default function ProfileMenu() {
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [tgInput, setTgInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [verifyCode, setVerifyCode] = useState(null);
  const [unlinking, setUnlinking] = useState(false);
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
  const loadProfile = async () => {
    const data = await apiFetch('/api/auth/me');
    if (data.ok) setProfile(data.user);
  };

  useEffect(() => {
    if (open && !profile) loadProfile();
  }, [open]);

  const handleRequestLink = async () => {
    const tgId = tgInput.trim();
    if (!tgId || isNaN(tgId)) {
      toast.warning('Masukkan Telegram User ID yang valid (angka)');
      return;
    }
    setLinking(true);
    try {
      const data = await apiFetch('/api/auth/link-telegram', {
        method: 'POST',
        body: JSON.stringify({ telegram_user_id: tgId }),
      });
      if (data.ok) {
        setVerifyCode(data.code);
        toast.success('Kode verifikasi dibuat! Kirim ke bot.');
      } else {
        toast.error(data.error || 'Gagal request link');
      }
    } catch (e) {
      toast.error('Gagal request link');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Yakin ingin unlink Telegram dari akun ini?')) return;
    setUnlinking(true);
    try {
      const data = await apiFetch('/api/auth/unlink-telegram', { method: 'POST' });
      if (data.ok) {
        toast.success('Telegram berhasil di-unlink');
        setProfile((p) => p ? { ...p, telegram_user_id: null, plan: null } : p);
        setVerifyCode(null);
        setTgInput('');
      } else {
        toast.error(data.error || 'Gagal unlink');
      }
    } catch (e) {
      toast.error('Gagal unlink');
    } finally {
      setUnlinking(false);
    }
  };

  const copyCode = () => {
    if (verifyCode) {
      navigator.clipboard.writeText(`/link ${verifyCode}`);
      toast.info('Command disalin! Paste di bot Telegram.');
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
              <div className="ws-tg-linked-section">
                <div className="ws-tg-linked">
                  <FiCheck size={14} className="ws-icon-success" />
                  <span>Linked: <strong>{profile.telegram_user_id}</strong></span>
                  {profile.plan && (
                    <span className="ws-tg-plan">{profile.plan.name || 'Free'}</span>
                  )}
                </div>
                <button className="ws-tg-unlink-btn" onClick={handleUnlink} disabled={unlinking}>
                  <FiUnlock size={12} />
                  <span>{unlinking ? '...' : 'Unlink'}</span>
                </button>
              </div>
            ) : verifyCode ? (
              /* Show verification code */
              <div className="ws-tg-verify">
                <div className="ws-tg-verify-header">
                  <FiCheck size={14} className="ws-icon-success" />
                  <span>Kode verifikasi dibuat!</span>
                </div>
                <p className="ws-tg-hint">
                  Kirim command berikut ke bot Telegram:
                </p>
                <div className="ws-tg-code-box">
                  <code>/link {verifyCode}</code>
                  <button className="ws-tg-copy-btn" onClick={copyCode} title="Copy">
                    <FiCopy size={14} />
                  </button>
                </div>
                <p className="ws-tg-hint ws-tg-expire">
                  Kode berlaku 10 menit. Setelah berhasil, refresh halaman ini.
                </p>
                <div className="ws-tg-verify-actions">
                  <button className="ws-tg-refresh-btn" onClick={loadProfile}>
                    <FiRefreshCw size={12} /> Cek Status
                  </button>
                  <button className="ws-tg-retry-btn" onClick={() => setVerifyCode(null)}>
                    Ganti ID
                  </button>
                </div>
              </div>
            ) : (
              /* Input Telegram ID */
              <div className="ws-tg-link-form">
                <p className="ws-tg-hint">
                  Link akun Telegram untuk menggunakan kredit generate.
                  Kirim <code>/myid</code> ke bot untuk mendapatkan ID.
                </p>
                <div className="ws-tg-input-row">
                  <input
                    type="text"
                    className="ws-tg-input"
                    placeholder="Telegram User ID"
                    value={tgInput}
                    onChange={(e) => setTgInput(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && handleRequestLink()}
                  />
                  <button className="ws-tg-link-btn" onClick={handleRequestLink} disabled={linking}>
                    {linking ? '...' : <FiLink size={14} />}
                  </button>
                </div>
                <p className="ws-tg-note">
                  Satu akun hanya bisa link ke satu Telegram.
                </p>
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
