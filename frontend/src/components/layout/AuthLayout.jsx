import { Outlet } from 'react-router-dom'

const AuthLayout = () => {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: "'Inter', system-ui, sans-serif",
      background: '#060b18',
    }}>

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT PANEL — Video (60%)
          z-index stack: fallback(0) → video(1) → overlay(2) → vignette(3) → brand(4)
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display: 'none',
        position: 'relative',
        width: '60%',
        flexShrink: 0,
        overflow: 'hidden',
      }} className="lg:!block">

        {/* Fallback gradient — sits UNDER the video */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          background: 'linear-gradient(135deg, #0d1535 0%, #130a2e 50%, #060b18 100%)',
        }} />

        {/* Video — z-index 1 so it renders above fallback */}
        <video
          autoPlay muted loop playsInline
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center',
            zIndex: 1,
          }}
        >
          <source src="/videos/crm-bg.mp4" type="video/mp4" />
        </video>

        {/* Cinematic overlay — z-index 2, moderate opacity so video stays visible */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2,
          background: [
            'linear-gradient(to right, rgba(6,11,24,0.1) 0%, rgba(6,11,24,0.35) 60%, rgba(6,11,24,0.75) 100%)',
            'linear-gradient(to top, rgba(6,11,24,0.45) 0%, transparent 45%)',
          ].join(', '),
        }} />

        {/* Vignette — z-index 3 */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 3,
          boxShadow: 'inset 0 0 100px rgba(0,0,0,0.45)',
          pointerEvents: 'none',
        }} />

        {/* Brand watermark — z-index 4 */}
        <div style={{ position: 'absolute', bottom: '28px', left: '36px', zIndex: 4 }}>
          <p style={{
            color: 'rgba(255,255,255,0.2)',
            fontSize: '11px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
            Powered by Niyan IT Solutions
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT PANEL — Login card (40% on desktop, full width on mobile)
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        flex: '1 1 0',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        position: 'relative',
        background: 'linear-gradient(160deg, #0d1535 0%, #060b18 100%)',
        overflowY: 'auto',
      }}>

        {/* Ambient glow blobs */}
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: '320px', height: '320px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.16) 0%, transparent 70%)',
          filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', bottom: '-40px', left: '-40px',
          width: '240px', height: '240px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
          filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0,
        }} />

        {/* ── Glassmorphism card ─────────────────────────────────────────── */}
        <div style={{
          position: 'relative', zIndex: 1,
          width: '100%', maxWidth: '400px',
          background: 'rgba(13,21,53,0.65)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '20px',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 32px 80px rgba(0,0,0,0.55), 0 0 48px rgba(99,102,241,0.07)',
          padding: '40px 36px',
          animation: 'authCardIn 0.45s cubic-bezier(0.16,1,0.3,1) both',
        }}>

          {/* Single logo — always inside the card, no outside duplicate */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '11px', flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, color: 'white', fontSize: '18px',
              boxShadow: '0 0 20px rgba(99,102,241,0.4)',
            }}>C</div>
            <div>
              <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '15px', lineHeight: 1.2 }}>
                CRM Platform
              </div>
              <div style={{ color: '#3d4f6e', fontSize: '11px', letterSpacing: '0.04em', marginTop: '2px' }}>
                Recruitment & Partner Management
              </div>
            </div>
          </div>

          {/* Login / Register form */}
          <Outlet />
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @keyframes authCardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.975); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

export default AuthLayout
