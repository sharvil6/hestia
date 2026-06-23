import { Sparkles } from 'lucide-react'
import { DEMO_MODE } from '@/lib/demo'

// Persistent strip shown on every page of the public demo. Renders nothing in
// the real app (DEMO_MODE is false there).
export default function DemoBanner() {
  if (!DEMO_MODE) return null
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '8px 16px',
        background: 'var(--color-brand)',
        color: 'white',
        fontSize: 13,
        fontWeight: 500,
        textAlign: 'center',
        lineHeight: 1.3,
      }}
    >
      <Sparkles size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
      <span>
        Demo mode — sample recipes, shared by everyone and reset daily. AI photo
        scanning is disabled.
      </span>
    </div>
  )
}
