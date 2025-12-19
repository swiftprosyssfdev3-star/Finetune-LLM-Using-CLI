import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  variant?: 'red' | 'blue' | 'yellow' | 'green'
  showLabel?: boolean
  label?: string
}

const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ className, value, max = 100, variant = 'blue', showLabel = true, label, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

    const variants = {
      red: 'bg-bauhaus-red',
      blue: 'bg-bauhaus-blue',
      yellow: 'bg-bauhaus-yellow',
      green: 'bg-terminal-green',
    }

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {(showLabel || label) && (
          <div className="flex justify-between text-sm mb-2">
            <span className="text-bauhaus-charcoal">{label || 'Progress'}</span>
            <span className="text-bauhaus-gray">{Math.round(percentage)}%</span>
          </div>
        )}
        <div className="w-full h-2 bg-bauhaus-silver rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all duration-300', variants[variant])}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    )
  }
)

ProgressBar.displayName = 'ProgressBar'

export { ProgressBar }
