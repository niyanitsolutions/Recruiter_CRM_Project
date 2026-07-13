import { useNavigate } from 'react-router-dom'
import {
  Upload, Zap, Layers, Check, FileText, Image, Table2,
  Type, AlignLeft, Palette, Stamp, QrCode, Columns,
  ChevronRight,
} from 'lucide-react'

const CARDS = [
  {
    id: 'import',
    icon: Upload,
    iconBg: 'from-blue-500 to-cyan-500',
    badge: 'UPLOAD',
    badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    title: 'Import & Edit',
    subtitle: 'Start from your existing document',
    description: 'Upload a Word document or PDF and convert it into a fully editable template while preserving all formatting.',
    features: [
      { icon: FileText, text: 'Upload DOCX or PDF' },
      { icon: Check,    text: 'Preserve formatting, tables & images' },
      { icon: Check,    text: 'Preserve headers, footers & styles' },
      { icon: Type,     text: 'Add dynamic HR placeholders' },
      { icon: Check,    text: 'Save & generate instantly' },
    ],
    cta: 'Upload & Edit',
    path: '/hrm/doc-center/import',
    best: false,
  },
  {
    id: 'quick',
    icon: Zap,
    iconBg: 'from-[#167CFB] to-[#0267F9]',
    badge: 'RECOMMENDED',
    badgeColor: 'bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-300',
    title: 'Quick Builder',
    subtitle: 'Step-by-step form wizard — done in minutes',
    description: 'Fill in simple form fields for header, body, signature, and footer. The live preview updates instantly as you type — no design skills needed.',
    features: [
      { icon: AlignLeft, text: 'Accordion form wizard — one section at a time' },
      { icon: Type,      text: 'Document title with font & alignment controls' },
      { icon: Image,     text: 'Company logo, header & footer configuration' },
      { icon: Palette,   text: 'Rich body editor with one-click HR fields' },
      { icon: Check,     text: 'Live preview updates as you fill the form' },
    ],
    cta: 'Open Quick Builder',
    path: '/hrm/doc-center/quick',
    best: true,
  },
  {
    id: 'advanced',
    icon: Layers,
    iconBg: 'from-amber-500 to-orange-500',
    badge: 'PROFESSIONAL',
    badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    title: 'Advanced Designer',
    subtitle: 'Full professional layout control',
    description: 'Drag-and-drop block-based editor with complete typographic control, dynamic fields, tables, images, signatures, and auto-pagination.',
    features: [
      { icon: Columns,  text: 'Drag & drop content blocks' },
      { icon: Table2,   text: 'Advanced table with merge & split cells' },
      { icon: Image,    text: 'Images, QR codes & signature areas' },
      { icon: Stamp,    text: 'Watermarks, stamps & confidential marks' },
      { icon: QrCode,   text: 'Auto-pagination across A4 / Letter / Legal' },
    ],
    cta: 'Open Designer',
    path: '/hrm/doc-center/advanced',
    best: false,
  },
]

export default function NewTemplatePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-full p-8" style={{ background: 'var(--bg-primary)' }}>
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-heading)' }}>
          Create New Template
        </h1>
        <p className="text-base max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
          Choose how you want to create your HR document template. All options produce the same professional output.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {CARDS.map((card) => (
          <div
            key={card.id}
            className={`relative flex flex-col rounded-2xl border transition-all duration-200 overflow-hidden group hover:shadow-xl hover:-translate-y-1 cursor-pointer ${
              card.best
                ? 'ring-2 ring-accent-500 shadow-lg shadow-accent-100 dark:shadow-accent-900/20'
                : ''
            }`}
            style={{ background: 'var(--bg-card, var(--bg-secondary))', borderColor: card.best ? '#167CFB' : 'var(--border)' }}
            onClick={() => navigate(card.path)}
          >
            {/* Best badge ribbon */}
            {card.best && (
              <div className="absolute top-4 right-4 z-10">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-accent-600 text-white">
                  Most Popular
                </span>
              </div>
            )}

            {/* Icon header */}
            <div className={`h-28 flex items-center justify-center bg-gradient-to-br ${card.iconBg}`}>
              <card.icon className="w-14 h-14 text-white drop-shadow-lg" strokeWidth={1.5} />
            </div>

            {/* Content */}
            <div className="flex flex-col flex-1 p-6">
              {/* Badge */}
              <span className={`self-start text-[10px] font-bold tracking-widest px-2.5 py-0.5 rounded-full mb-3 ${card.badgeColor}`}>
                {card.badge}
              </span>

              <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-heading)' }}>
                {card.title}
              </h2>
              <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>
                {card.subtitle}
              </p>
              <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-body)' }}>
                {card.description}
              </p>

              {/* Features */}
              <ul className="space-y-2 flex-1">
                {card.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-body)' }}>
                    <f.icon className="w-3.5 h-3.5 flex-shrink-0 text-accent-500" />
                    {f.text}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => navigate(card.path)}
                className={`mt-6 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  card.best
                    ? 'text-white hover:opacity-90'
                    : 'hover:bg-accent-50 dark:hover:bg-accent-900/20 border'
                }`}
                style={card.best
                  ? { background: 'linear-gradient(135deg, #167CFB, #0267F9)' }
                  : { borderColor: 'var(--border)', color: 'var(--text-body)' }
                }
              >
                {card.cta}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Prebuilt hint */}
      <div className="mt-10 text-center">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Already have a template you like?{' '}
          <button
            onClick={() => navigate('/hrm/doc-center/templates?tab=prebuilt')}
            className="font-semibold text-accent-600 hover:underline"
          >
            Browse 16 pre-built templates →
          </button>
        </p>
      </div>
    </div>
  )
}
