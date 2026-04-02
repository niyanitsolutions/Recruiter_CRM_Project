import { Outlet } from 'react-router-dom'

const AuthLayout = () => {
  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#060b18' }}>

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT PANEL — Video (60%)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:block" style={{ position: 'relative', width: '60%', overflow: 'hidden' }}>

        {/* Background video */}
        <video
          autoPlay
          muted
          loop
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
        >
          {/*
            Replace the src below with your CRM video file.
            Recommended: place a .mp4 file in /public/videos/crm-bg.mp4
            Free sources: Pexels.com → search "dashboard", "analytics", "office"
          */}
          <source src="/videos/crm-bg.mp4" type="video/mp4" />
        </video>

        {/* Fallback gradient (shown if video fails to load) */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, #0d1535 0%, #0f0a2a 50%, #060b18 100%)',
        }} />

        {/* Cinematic dark gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to right, rgba(6,11,24,0.15) 0%, rgba(6,11,24,0.5) 70%, rgba(6,11,24,0.92) 100%), linear-gradient(to top, rgba(6,11,24,0.6) 0%, transparent 40%)',
        }} />

        {/* Vignette */}
        <div style={{
          position: 'absolute', inset: 0,
          boxShadow: 'inset 0 0 120px rgba(0,0,0,0.65)',
          pointerEvents: 'none',
        }} />

        {/* Brand — bottom left only */}
        <div style={{ position: 'absolute', bottom: '28px', left: '36px', zIndex: 10 }}>
          <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Powered by Niyan IT Solutions
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT PANEL — Login form (40%)
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        width: '100%',
        flex: '0 0 100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        position: 'relative',
        background: 'linear-gradient(160deg, #0d1535 0%, #060b18 100%)',
      }}
        className="lg:!flex-none lg:!w-[40%]"
      >
        {/* Ambient glow blobs */}
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: '320px', height: '320px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
          filter: 'blur(40px)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-40px', left: '-40px',
          width: '240px', height: '240px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
          filter: 'blur(50px)', pointerEvents: 'none',
        }} />

        {/* Mobile logo (only visible on small screens) */}
        <div style={{ position: 'absolute', top: '24px', left: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}
          className="lg:hidden"
        >
          <div style={{
            width: '34px', height: '34px', borderRadius: '9px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, color: 'white', fontSize: '15px',
            boxShadow: '0 0 16px rgba(99,102,241,0.5)',
          }}>C</div>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '14px' }}>CRM Platform</span>
        </div>

        {/* ── Glassmorphism card ──────────────────────────────────────────── */}
        <div style={{
          width: '100%',
          maxWidth: '400px',
          background: 'rgba(13,21,53,0.65)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '20px',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          boxShadow: [
            '0 0 0 1px rgba(255,255,255,0.04)',
            '0 32px 80px rgba(0,0,0,0.55)',
            '0 0 48px rgba(99,102,241,0.07)',
          ].join(', '),
          padding: '40px 36px',
          animation: 'authCardIn 0.45s cubic-bezier(0.16,1,0.3,1) both',
        }}>

          {/* Logo inside card (desktop) */}
          <div className="hidden lg:flex" style={{ alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '11px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, color: 'white', fontSize: '18px',
              boxShadow: '0 0 20px rgba(99,102,241,0.45)',
              flexShrink: 0,
            }}>C</div>
            <div>
              <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '15px', lineHeight: 1.2 }}>CRM Platform</div>
              <div style={{ color: '#3d4f6e', fontSize: '11px', letterSpacing: '0.04em', marginTop: '2px' }}>
                Recruitment & Partner Management
              </div>
            </div>
          </div>

          {/* Form (Login, Register screens, etc.) */}
          <Outlet />
        </div>
      </div>

      {/* ── Global animations ─────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        @keyframes authCardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.975); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default AuthLayout
