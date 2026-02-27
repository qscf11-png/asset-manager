import { useState } from 'react';
import { Activity, Mail, Lock, AlertCircle } from 'lucide-react';
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
            // 強制使用彈出視窗選擇帳號
            provider.setCustomParameters({ prompt: 'select_account' });
            await signInWithPopup(auth, provider);
            // 登入成功後 App.js 的 onAuthStateChanged 會自動切換頁面
        } catch (err) {
            console.error("Google 登入失敗:", err);
            // 處理使用者關閉彈窗等錯誤
            if (err.code !== 'auth/popup-closed-by-user') {
                setError("登入失敗，請確認您的網路連線或稍後再試。");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleEmailLogin = (e) => {
        e.preventDefault();
        setError("目前僅開放 Google 帳號登入，以確保最佳的跨裝置體驗。");
    };

    return (
        <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
            <div className="glass-panel" style={{ padding: '3rem', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ textAlign: 'center' }}>
                    <Activity className="text-success" size={48} style={{ margin: '0 auto 1rem auto' }} />
                    <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Asset Manager</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>登入以管理您的個人資產</p>
                </div>

                {error && (
                    <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '1rem', borderRadius: '8px', fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
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
                        display: 'flex',
                        gap: '0.75rem',
                        fontWeight: 600,
                        padding: '1rem',
                        opacity: loading ? 0.7 : 1
                    }}
                >
                    {loading ? (
                        <Activity className="text-success" size={20} style={{ animation: 'pulse 1s infinite' }} />
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>或</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
                </div>

                <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', opacity: 0.5 }}>
                    <div style={{ position: 'relative' }}>
                        <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            placeholder="電子郵件 (暫不開放)"
                            disabled
                            style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.5)', color: 'white', fontFamily: 'inherit', cursor: 'not-allowed' }}
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input
                            type="password"
                            placeholder="密碼"
                            disabled
                            style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(15, 23, 42, 0.5)', color: 'white', fontFamily: 'inherit', cursor: 'not-allowed' }}
                        />
                    </div>
                    <button type="submit" className="action-btn" disabled style={{ marginTop: '0.5rem', cursor: 'not-allowed' }}>
                        使用密碼登入
                    </button>
                </form>

            </div>
        </div>
    );
}
