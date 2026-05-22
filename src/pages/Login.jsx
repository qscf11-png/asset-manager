import { useState } from 'react';
import { Activity, AlertCircle } from 'lucide-react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../config/firebase';
import '../App.css';

export default function Login() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleGoogleLogin = async () => {
        try {
            setLoading(true);
            setError(null);
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            await signInWithPopup(auth, provider);
        } catch (err) {
            console.error("Google 登入失敗:", err);
            if (err.code !== 'auth/popup-closed-by-user') {
                setError("登入失敗，請確認您的網路連線或稍後再試。");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '15%', left: '30%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '20%', right: '25%', width: '350px', height: '350px', background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <div className="glass-panel" style={{
                padding: '2.5rem',
                width: '100%',
                maxWidth: '380px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.75rem',
                animation: 'slideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
                position: 'relative',
                zIndex: 1
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', padding: '0.75rem', borderRadius: '16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.15)', marginBottom: '1rem' }}>
                        <Activity className="text-success" size={32} style={{ filter: 'drop-shadow(0 0 10px rgba(16,185,129,0.4))' }} />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.35rem', letterSpacing: '-0.03em' }}>
                        <span className="text-gradient">Asset Manager</span>
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>登入以管理您的個人資產</p>
                </div>

                {error && (
                    <div style={{ background: 'var(--danger-glow)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '0.85rem', borderRadius: '10px', fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>{error}</span>
                    </div>
                )}

                <button
                    className="action-btn"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    style={{
                        background: 'white',
                        color: '#1f2937',
                        padding: '0.85rem',
                        fontWeight: 600,
                        fontSize: '0.95rem',
                        opacity: loading ? 0.7 : 1,
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.15)',
                    }}
                >
                    {loading ? (
                        <Activity className="text-success" size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                    )}
                    {loading ? '登入中...' : '使用 Google 登入'}
                </button>

                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    僅支援 Google 帳號登入
                </div>
            </div>
        </div>
    );
}
