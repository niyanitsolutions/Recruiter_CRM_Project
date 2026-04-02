import { useEffect, useRef } from 'react'
import { Outlet, Link } from 'react-router-dom'

// ── Animated left-panel particle canvas ──────────────────────────────────────
const ParticleCanvas = () => {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animId
    let W = canvas.width  = canvas.offsetWidth
    let H = canvas.height = canvas.offsetHeight

    const onResize = () => {
      W = canvas.width  = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
    }
    window.addEventListener('resize', onResize)

    // Particles
    const particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.8 + 0.4,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      alpha: Math.random() * 0.5 + 0.15,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(139,92,246,${p.alpha})`
        ctx.fill()
      })
      // Connection lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(99,102,241,${0.12 * (1 - dist / 120)})`
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }
      }
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize) }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
}

// ── Floating KPI card ─────────────────────────────────────────────────────────
const FloatingCard = ({ style, children }) => (
  <div
    className="absolute rounded-2xl border border-white/10 backdrop-blur-md shadow-2xl"
    style={{
      background: 'rgba(15,23,42,0.75)',
      animation: 'floatY 6s ease-in-out infinite',
      ...style,
    }}
  >
    {children}
  </div>
)

// ── Micro sparkline SVG ───────────────────────────────────────────────────────
const Sparkline = ({ color = '#8b5cf6', points = '0,28 15,18 30,22 45,10 60,16 75,5 90,12' }) => (
  <svg width="90" height="32" viewBox="0 0 90 32" fill="none">
    <polyline points={points} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <polyline
      points={points + ' 90,32 0,32'}
      fill={`${color}18`}
      stroke="none"
    />
  </svg>
)

// ── Donut ring SVG ────────────────────────────────────────────────────────────
const DonutRing = ({ pct = 72, color = '#6366f1', size = 56 }) => {
  const r = 22; const circ = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
      <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${circ * pct / 100} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="33" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">{pct}%</text>
    </svg>
  )
}

// ── Bar chart mini ────────────────────────────────────────────────────────────
const BarChart = () => {
  const bars = [40, 65, 50, 80, 60, 90, 70]
  return (
    <svg width="100" height="36" viewBox="0 0 100 36">
      {bars.map((h, i) => (
        <rect key={i} x={i * 14 + 2} y={36 - h * 0.36} width="10" height={h * 0.36}
          rx="2" fill={i === 5 ? '#22c55e' : 'rgba(99,102,241,0.6)'} />
      ))}
    </svg>
  )
}

const AuthLayout = () => {
  return (
    <div className="min-h-screen flex font-sans" style={{ background: '#060b18' }}>

      {/* ── LEFT PANEL ───────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[58%] relative overflow-hidden">
        {/* Deep gradient background */}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, #060b18 0%, #0d1535 40%, #130a2e 70%, #060b18 100%)' }} />

        {/* Radial glow blobs */}
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #22c55e 0%, transparent 70%)', filter: 'blur(60px)' }} />

        {/* Particle canvas */}
        <ParticleCanvas />

        {/* ── Floating KPI cards ──────────────────────────────────────────── */}

        {/* Top-left: Placements card */}
        <FloatingCard style={{ top: '8%', left: '6%', padding: '16px 20px', minWidth: '200px', animationDelay: '0s' }}>
          <p style={{ color: '#94a3b8', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
            Total Placements
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '10px' }}>
            <span style={{ color: '#f8fafc', fontSize: '28px', fontWeight: '800', lineHeight: 1 }}>1,284</span>
            <span style={{ color: '#22c55e', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>↑ 18.4%</span>
          </div>
          <Sparkline color="#6366f1" />
        </FloatingCard>

        {/* Top-right: Pipeline */}
        <FloatingCard style={{ top: '6%', right: '5%', padding: '14px 18px', minWidth: '160px', animationDelay: '1.5s', animationDuration: '7s' }}>
          <p style={{ color: '#94a3b8', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Pipeline Health
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <DonutRing pct={72} color="#6366f1" />
            <div>
              <div style={{ color: '#f8fafc', fontSize: '13px', fontWeight: '600' }}>72% Active</div>
              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>248 candidates</div>
            </div>
          </div>
        </FloatingCard>

        {/* Mid-left: Revenue */}
        <FloatingCard style={{ top: '35%', left: '4%', padding: '14px 18px', minWidth: '180px', animationDelay: '0.8s', animationDuration: '8s' }}>
          <p style={{ color: '#94a3b8', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
            Monthly Revenue
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', marginBottom: '8px' }}>
            <span style={{ color: '#f8fafc', fontSize: '22px', fontWeight: '800', lineHeight: 1 }}>₹8.4L</span>
            <span style={{ color: '#22c55e', fontSize: '11px', fontWeight: '600', marginBottom: '3px' }}>↑ 12%</span>
          </div>
          <Sparkline color="#22c55e" points="0,28 15,22 30,26 45,14 60,18 75,8 90,4" />
        </FloatingCard>

        {/* Mid-right: Bar chart */}
        <FloatingCard style={{ top: '32%', right: '4%', padding: '14px 18px', minWidth: '168px', animationDelay: '2.2s', animationDuration: '6.5s' }}>
          <p style={{ color: '#94a3b8', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Weekly Interviews
          </p>
          <BarChart />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            {['M','T','W','T','F','S','S'].map((d, i) => (
              <span key={i} style={{ color: '#475569', fontSize: '10px', width: '14px', textAlign: 'center' }}>{d}</span>
            ))}
          </div>
        </FloatingCard>

        {/* Notification popup */}
        <FloatingCard style={{ bottom: '30%', left: '5%', padding: '12px 16px', minWidth: '220px', animationDelay: '1s', animationDuration: '9s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: 'white', fontSize: '14px' }}>✓</span>
            </div>
            <div>
              <div style={{ color: '#f1f5f9', fontSize: '12px', fontWeight: '600' }}>Candidate Placed</div>
              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>Rahul S. → TCS · 2m ago</div>
            </div>
          </div>
        </FloatingCard>

        {/* Bottom-right: Active clients */}
        <FloatingCard style={{ bottom: '28%', right: '4%', padding: '14px 18px', minWidth: '160px', animationDelay: '3s', animationDuration: '7.5s' }}>
          <p style={{ color: '#94a3b8', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Active Clients
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DonutRing pct={88} color="#22c55e" size={48} />
            <div>
              <div style={{ color: '#f8fafc', fontSize: '18px', fontWeight: '800' }}>64</div>
              <div style={{ color: '#64748b', fontSize: '11px' }}>of 73 total</div>
            </div>
          </div>
        </FloatingCard>

        {/* Bottom center: open roles badge */}
        <FloatingCard style={{ bottom: '10%', left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', animationDelay: '0.5s', animationDuration: '8s', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }} />
            <span style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: '600' }}>142 open roles · 38 interviews today</span>
          </div>
        </FloatingCard>

        {/* Brand wordmark bottom-left */}
        <div className="absolute bottom-6 left-8" style={{ zIndex: 10 }}>
          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '11px', letterSpacing: '0.1em' }}>
            POWERED BY NIYAN IT SOLUTIONS
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────────────── */}
      <div
        className="w-full lg:w-[42%] flex items-center justify-center relative"
        style={{ background: 'linear-gradient(160deg, #0d1535 0%, #060b18 100%)' }}
      >
        {/* Subtle right-panel glow */}
        <div className="absolute top-0 right-0 w-64 h-64 opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle at top right, #6366f1, transparent 70%)', filter: 'blur(40px)' }} />
        <div className="absolute bottom-0 left-0 w-48 h-48 opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(circle at bottom left, #8b5cf6, transparent 70%)', filter: 'blur(40px)' }} />

        {/* Mobile logo */}
        <div className="lg:hidden absolute top-6 left-6 flex items-center gap-3">
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', color: 'white', fontSize: '16px', boxShadow: '0 0 16px rgba(99,102,241,0.5)' }}>C</div>
          <span style={{ color: '#e2e8f0', fontWeight: '700', fontSize: '15px' }}>CRM Platform</span>
        </div>

        {/* Glassmorphism card */}
        <div
          className="w-full mx-6 lg:mx-auto"
          style={{
            maxWidth: '420px',
            background: 'rgba(15,23,42,0.7)',
            border: '1px solid rgba(99,102,241,0.18)',
            borderRadius: '20px',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.08)',
            padding: '40px 36px',
            animation: 'cardEntrance 0.5s cubic-bezier(0.16,1,0.3,1) both',
          }}
        >
          {/* Logo */}
          <div className="hidden lg:flex items-center gap-3 mb-8">
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', color: 'white', fontSize: '18px', boxShadow: '0 0 20px rgba(99,102,241,0.4)' }}>C</div>
            <div>
              <div style={{ color: '#f1f5f9', fontWeight: '700', fontSize: '15px', lineHeight: 1.2 }}>CRM Platform</div>
              <div style={{ color: '#475569', fontSize: '11px', letterSpacing: '0.05em' }}>Recruitment & Partner Management</div>
            </div>
          </div>

          {/* Form content via Outlet (Login.jsx renders here) */}
          <Outlet />
        </div>
      </div>

      {/* ── Global keyframe animations ─────────────────────────────────────── */}
      <style>{`
        @keyframes floatY {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-10px); }
        }
        @keyframes cardEntrance {
          from { opacity: 0; transform: translateY(28px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  )
}

export default AuthLayout
