import { splitName } from '../../lib/brand.js'

export default function Logo({ name, size = 'md' }) {
  const { first, rest } = splitName(name)
  const large = size === 'lg'
  return (
    <div className="flex items-center gap-3">
      <img src="/logo.png" alt="" className={`${large ? 'h-16 w-16' : 'h-11 w-11'} object-contain`} />
      <div className={large ? 'border-l-2 border-ink/20 pl-4' : ''}>
        <div className={`${large ? 'text-4xl' : 'text-xl'} font-extrabold leading-none tracking-tight text-ink`}>
          {first}
        </div>
        {rest && (
          <div className={`${large ? 'text-2xl' : 'text-xs'} mt-1 font-semibold leading-tight text-brand-500`}>
            {rest}
          </div>
        )}
      </div>
    </div>
  )
}
