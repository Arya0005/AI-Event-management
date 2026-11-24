import { Sparkles } from 'lucide-react'

export function BrandMark({ size = 'md' }) {
  const sizes = { md: 'size-8 rounded-lg', lg: 'size-11 rounded-xl' }
  return (
    <span className={`relative flex items-center justify-center bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-on-accent shadow-glow ${sizes[size]}`}>
      <Sparkles className={size === 'lg' ? 'size-5' : 'size-4'} aria-hidden />
    </span>
  )
}

export default function Brand({ subtitle = true }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="leading-tight">
        <p className="text-[15px] font-semibold tracking-tight text-slate-900">EventIQ</p>
        {subtitle && <p className="text-[11px] font-medium text-slate-500">AI event intelligence</p>}
      </div>
    </div>
  )
}
