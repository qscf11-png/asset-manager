import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, LogOut, Activity } from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './config/firebase';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 監聽 Firebase 登入狀態變更
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("登出發生錯誤:", error);
    }
  };

  if (loading) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: 'var(--text-secondary)' }}>
          <Activity className="text-success" size={48} style={{ animation: 'pulse 2s infinite' }} />
          <p>載入中...</p>
        </div>
      </div>
    );
  }

  // 如果未登入，強制導向登入頁面
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <div className="app-container">
      <header className="main-header glass-panel" style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
        <div className="brand">
          <Activity className="text-success" size={28} />
          <span>Asset Manager</span>
        </div>
        <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginRight: '1rem' }}>
            {user.photoURL && (
              <img
                src={user.photoURL}
                alt="User Avatar"
                style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid var(--border-color)' }}
              />
            )}
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {user.displayName || user.email}
            </span>
          </div>

          <button className="action-btn" onClick={handleLogout} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
            <LogOut size={16} /> 登出
          </button>
        </nav>
      </header>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
