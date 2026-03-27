import { cn } from '@/lib/utils'

const FADE_MASK =
  'linear-gradient(to right, transparent, black 3rem, black calc(100% - 3rem), transparent)'

function ScrollRail({
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="scroll-rail"
      className={cn('overflow-hidden', className)}
      style={{
        maskImage: FADE_MASK,
        WebkitMaskImage: FADE_MASK,
        ...style,
      }}
      {...props}
    >
      <style>{`@keyframes scroll-rail{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <div
        className="flex w-max"
        style={{ animation: 'scroll-rail 20s linear infinite' }}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}

export { ScrollRail }
