'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/lib/auth';
import { isOfflineMode } from '@/lib/app-mode';

const navItems = [
// ... (rest of the preamble)
  { href: '/', label: 'Dashboard', icon: '◈' },
  { href: '/portfolio', label: 'Portfolio', icon: '▦' },
  { href: '/stocks/new', label: 'Add Stock', icon: '+' },
  { href: '/history', label: 'Trading History', icon: '▤' },
  { href: '/transactions', label: 'ฝากเงิน / ถอนเงิน', icon: '⇄' },
  { href: '/bank-accounts', label: 'บัญชีเงินฝาก', icon: '▣' },
  { href: '/files', label: 'จัดการไฟล์ (Files)', icon: '📂' },
  { href: '/info', label: 'คลังความรู้ (Inf.)', icon: 'ℹ' },
  { href: '/backup', label: 'Backup / Restore', icon: '⊡' },
  { href: '/activity', label: 'Activity Log', icon: '▦' },
];

import { useState, useEffect } from 'react';
import { MobileHeader } from './MobileHeader';

export function SidebarManager() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  if (pathname === '/login') return null;

  return (
    <>
      <MobileHeader onMenuClick={() => setIsOpen(true)} />
      <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

import { useFirebaseAuth } from './AuthProvider';
import { loginWithGoogle, logoutFirebase } from '@/lib/services/authService';

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, isFirebaseActive } = useFirebaseAuth();
  const closeOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) onClose?.();
  };
  const handleSecureLogout = async () => {
    await logoutFirebase();
    closeOnMobile();
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div className="mobile-overlay" onClick={onClose} />
      )}
      
      <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="nav-header desktop-only">
          <div className="nav-logo">
            <div className="nav-logo-title">◈ PORT_TRACK</div>
            <div className="nav-logo-sub">Stock Portfolio Manager</div>
          </div>
        </div>

        <div className="mobile-only" style={{ padding: '20px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div className="nav-logo-title">◈ PORT_TRACK</div>
          <button onClick={onClose} className="btn-ghost" style={{ fontSize: '20px' }}>✕</button>
        </div>

        <div className="nav-section">
          <div className="nav-section-label">Menu</div>
          {navItems.map((item) => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={closeOnMobile}
              >
                <span className="mono" style={{ fontSize: '12px', width: '14px', textAlign: 'center' }}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Firebase Account Panel */}
        {isFirebaseActive && (
          <div className="nav-section" style={{ background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: '4px', margin: '10px 12px 0 12px', border: '1px solid var(--border)' }}>
            <div className="nav-section-label" style={{ marginBottom: '6px', color: 'var(--amber)' }}>☁ Firebase Account</div>
            {user ? (
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.displayName || user.email}
              </div>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await loginWithGoogle();
                  } catch (e: any) {
                    alert(e.message);
                  }
                }}
                className="btn btn-secondary btn-xs"
                style={{ width: '100%', fontSize: '11px', padding: '4px 6px' }}
              >
                🔑 Google Sign-In
              </button>
            )}
          </div>
        )}

        {isOfflineMode && (
          <div className="nav-section" style={{ background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: '4px', margin: '10px 12px 0 12px', border: '1px solid var(--border)' }}>
            <div className="nav-section-label" style={{ marginBottom: '6px', color: 'var(--green)' }}>● Offline Mode</div>
            <div style={{ fontSize: '11px', color: 'var(--text-primary)' }}>Local PostgreSQL</div>
            <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>ไม่ใช้ Google Login หรือ Firebase</div>
          </div>
        )}

        <div className="nav-section" style={{ marginTop: 'auto' }}>
          <div className="nav-section-label">System</div>
          {!isFirebaseActive && !isOfflineMode && (
            <>
              <Link
                href="/settings"
                className={`nav-item ${pathname === '/settings' ? 'active' : ''}`}
                onClick={closeOnMobile}
              >
                <span className="mono" style={{ fontSize: '12px', width: '14px', textAlign: 'center' }}>⚙</span>
                Change User/Pass
              </Link>
              <Link
                href="/settings/logs"
                className={`nav-item ${pathname === '/settings/logs' ? 'active' : ''}`}
                onClick={closeOnMobile}
              >
                <span className="mono" style={{ fontSize: '12px', width: '14px', textAlign: 'center' }}>▤</span>
                Access Logs
              </Link>
              <button
                onClick={() => {
                  if (confirm('ต้องการออกจากระบบใช่หรือไม่?')) {
                    logout();
                    closeOnMobile();
                  }
                }}
                className="nav-item"
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}
              >
                <span className="mono" style={{ fontSize: '12px', width: '14px', textAlign: 'center' }}>⎋</span>
                Logout
              </button>
            </>
          )}
          {isFirebaseActive && user && (
            <button
              onClick={handleSecureLogout}
              className="nav-item"
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)' }}
            >
              <span className="mono" style={{ fontSize: '12px', width: '14px', textAlign: 'center' }}>⎋</span>
              Logout
            </button>
          )}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <div>PORT_TRACK v2.0</div>
            <div>Database: {isFirebaseActive ? 'Firebase' : 'Local PostgreSQL'}</div>
          </div>
        </div>
      </nav>
    </>
  );
}
