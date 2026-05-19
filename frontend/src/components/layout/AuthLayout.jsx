import { Outlet } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <>
      {/* ─── Fixed full-screen background ─────────────────────────────────── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: 'linear-gradient(135deg, #080c1a 0%, #0d1535 28%, #0f1245 55%, #0a0c24 80%, #060a17 100%)',
      }}>
        {/* Recruitment bg image — place your image at /auth-bg.jpg to activate */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: "url('/auth-bg.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }} />

        {/* Dark readability overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)' }} />

        {/* Brand colour wash */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(79,70,229,0.24) 0%, rgba(124,58,237,0.14) 52%, rgba(15,23,42,0.32) 100%)',
        }} />

        {/* Dot-grid mesh */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '30px 30px',
          pointerEvents: 'none',
        }} />

        {/* Floating glow orb — top-left */}
        <div style={{
          position: 'absolute', top: '-10%', left: '-6%',
          width: 640, height: 640, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(79,70,229,0.22) 0%, transparent 64%)',
          filter: 'blur(76px)',
          animation: 'orb1 9s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* Floating glow orb — bottom-right */}
        <div style={{
          position: 'absolute', bottom: '-10%', right: '-6%',
          width: 560, height: 560, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.22) 0%, transparent 64%)',
          filter: 'blur(76px)',
          animation: 'orb2 11s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* Floating glow orb — mid-right accent teal */}
        <div style={{
          position: 'absolute', top: '30%', right: '4%',
          width: 340, height: 340, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.11) 0%, transparent 70%)',
          filter: 'blur(60px)',
          animation: 'orb3 13s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      </div>

      {/* ─── Scrollable content layer ──────────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px 16px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}>

        {/* ── Premium liquid-glass card ───────────────────────────────────── */}
        <div
          className="auth-card"
          style={{
            width: '100%',
            maxWidth: '510px',
            background: 'rgba(255,255,255,0.07)',
            backdropFilter: 'blur(32px) saturate(180%)',
            WebkitBackdropFilter: 'blur(32px) saturate(180%)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: '28px',
            boxShadow: [
              '0 32px 80px rgba(0,0,0,0.60)',
              '0 0 0 1px rgba(255,255,255,0.04)',
              'inset 0 1px 0 rgba(255,255,255,0.11)',
            ].join(', '),
            animation: 'cardIn 0.55s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <div style={{
              background: 'rgba(255,255,255,0.97)',
              borderRadius: '14px',
              padding: '8px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '70px',
              maxWidth: '270px',
              width: '100%',
              boxShadow: '0 4px 24px rgba(0,0,0,0.32)',
            }}>
              <img
                src="/Hire_Flow_Logo.png"
                alt="HireFlow"
                loading="eager"
                style={{
                  display: 'block',
                  height: '52px',
                  width: '100%',
                  objectFit: 'contain',
                  objectPosition: 'center',
                }}
              />
            </div>
          </div>

          {/* Route content */}
          <Outlet />
        </div>
      </div>

      {/* Footer branding */}
      <p style={{
        position: 'fixed', bottom: 14, left: 0, right: 0, zIndex: 2,
        textAlign: 'center',
        color: 'rgba(255,255,255,0.20)',
        fontSize: '11px',
        letterSpacing: '0.06em',
        pointerEvents: 'none',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        © {new Date().getFullYear()} HireFlow · Recruit Smarter, Hire Faster
      </p>

      {/* ─── Global design-system styles shared with Login.jsx ─────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; }

        /* Responsive card padding */
        .auth-card { padding: 44px 40px; }
        @media (max-width: 540px) { .auth-card { padding: 36px 24px; } }
        @media (max-width: 380px) { .auth-card { padding: 28px 18px; } }

        /* ── Glass inputs ───────────────────────────────────── */
        .glass-input {
          width: 100%; height: 52px;
          background: rgba(255,255,255,0.07);
          border: 1.5px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          color: #fff; font-size: 14px; font-family: inherit;
          padding: 0 16px 0 46px;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
          -webkit-appearance: none;
        }
        .glass-input::placeholder { color: rgba(255,255,255,0.28); }
        .glass-input:focus {
          border-color: rgba(99,102,241,0.62);
          background: rgba(255,255,255,0.10);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.16), 0 0 22px rgba(99,102,241,0.10);
        }
        .glass-input:hover:not(:focus) {
          border-color: rgba(255,255,255,0.22);
          background: rgba(255,255,255,0.09);
        }
        .glass-input-pr { padding-right: 48px; }
        .glass-input:-webkit-autofill,
        .glass-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px rgba(18,24,50,0.92) inset !important;
          -webkit-text-fill-color: #fff !important;
          transition: background-color 5000s;
        }

        /* ── Buttons ────────────────────────────────────────── */
        .glass-btn-primary {
          width: 100%; height: 52px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          border: none; border-radius: 13px;
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: #fff; font-weight: 700; font-size: 15px; font-family: inherit;
          letter-spacing: 0.01em; cursor: pointer;
          transition: transform 0.18s, box-shadow 0.18s, opacity 0.15s;
          box-shadow: 0 6px 26px rgba(79,70,229,0.44), inset 0 1px 0 rgba(255,255,255,0.09);
          position: relative; overflow: hidden;
        }
        .glass-btn-primary::after {
          content: ''; position: absolute; inset: 0; border-radius: 13px;
          background: linear-gradient(180deg, rgba(255,255,255,0.10) 0%, transparent 60%);
          pointer-events: none;
        }
        .glass-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px) scale(1.014);
          box-shadow: 0 10px 38px rgba(79,70,229,0.58), inset 0 1px 0 rgba(255,255,255,0.12);
        }
        .glass-btn-primary:active:not(:disabled) { transform: translateY(1px) scale(0.99); }
        .glass-btn-primary:disabled { opacity: 0.60; cursor: not-allowed; }

        .glass-btn-trial {
          width: 100%; height: 48px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          border: 1.5px solid rgba(99,102,241,0.40); border-radius: 13px;
          background: rgba(99,102,241,0.09);
          color: #a5b4fc; font-weight: 600; font-size: 14px; font-family: inherit;
          cursor: pointer; transition: all 0.18s;
        }
        .glass-btn-trial:hover {
          background: rgba(99,102,241,0.18); border-color: rgba(99,102,241,0.62);
          color: #c7d2fe; transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(99,102,241,0.22);
        }
        .glass-btn-trial:active { transform: translateY(0); }

        .glass-btn-sub {
          width: 100%; height: 48px;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          border: 1.5px solid rgba(255,255,255,0.09); border-radius: 13px;
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.46); font-weight: 500; font-size: 14px; font-family: inherit;
          cursor: pointer; transition: all 0.18s;
        }
        .glass-btn-sub:hover {
          background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.18);
          color: rgba(255,255,255,0.80); transform: translateY(-1px);
        }
        .glass-btn-sub:active { transform: translateY(0); }

        .glass-btn-ghost {
          background: transparent; border: none; padding: 0;
          color: rgba(255,255,255,0.42); font-size: 13px; font-family: inherit;
          cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
          transition: color 0.15s; text-decoration: none;
        }
        .glass-btn-ghost:hover { color: rgba(255,255,255,0.82); }

        .glass-btn-action {
          width: 100%; height: 44px;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          border: 1.5px solid rgba(255,255,255,0.10); border-radius: 11px;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.65); font-weight: 500; font-size: 13px; font-family: inherit;
          cursor: pointer; transition: all 0.15s;
        }
        .glass-btn-action:hover {
          background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.20);
          color: rgba(255,255,255,0.90);
        }
        .glass-btn-action:disabled { opacity: 0.50; cursor: not-allowed; }

        /* ── Tenant selector item ────────────────────────────── */
        .tenant-item {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px; text-align: left;
          background: rgba(255,255,255,0.05); border: 1.5px solid rgba(255,255,255,0.09);
          border-radius: 12px; cursor: pointer; transition: all 0.15s;
        }
        .tenant-item:hover:not(:disabled) {
          background: rgba(99,102,241,0.11); border-color: rgba(99,102,241,0.30);
        }
        .tenant-item:disabled { opacity: 0.50; cursor: not-allowed; }

        /* ── Alert boxes ─────────────────────────────────────── */
        .glass-alert       { border-radius: 11px; padding: 13px 16px; }
        .glass-alert-red   { background: rgba(239,68,68,0.09);  border: 1.5px solid rgba(239,68,68,0.24);  }
        .glass-alert-amber { background: rgba(245,158,11,0.09); border: 1.5px solid rgba(245,158,11,0.24); }
        .glass-alert-green { background: rgba(34,197,94,0.09);  border: 1.5px solid rgba(34,197,94,0.24);  }

        /* ── Keyframes ───────────────────────────────────────── */
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(30px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes orb1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%     { transform: translate(26px,-20px) scale(1.06); }
          66%     { transform: translate(-14px,16px) scale(0.96); }
        }
        @keyframes orb2 {
          0%,100% { transform: translate(0,0) scale(1); }
          40%     { transform: translate(-22px,-28px) scale(1.08); }
          70%     { transform: translate(18px,10px)   scale(0.94); }
        }
        @keyframes orb3 {
          0%,100% { transform: translate(0,0); }
          50%     { transform: translate(-18px,-22px); }
        }
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%,100% { opacity:1; transform:scale(1);    }
          50%     { opacity:0.4; transform:scale(0.84); }
        }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes cardIn2 {
          from { opacity:0; transform:scale(0.95) translateY(8px); }
          to   { opacity:1; transform:scale(1)    translateY(0);   }
        }
      `}</style>
    </>
  )
}
