import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'red' | 'blue' | 'yellow' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'red', size = 'md', loading, disabled, children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

    const variants = {
      red: 'bg-bauhaus-red text-white hover:bg-bauhaus-red-dark focus:ring-bauhaus-red',
      blue: 'bg-bauhaus-blue text-white hover:bg-bauhaus-blue-dark focus:ring-bauhaus-blue',
      yellow: 'bg-bauhaus-yellow text-bauhaus-black hover:bg-bauhaus-yellow-dark focus:ring-bauhaus-yellow',
      outline: 'bg-transparent border-2 border-bauhaus-black text-bauhaus-black hover:bg-bauhaus-black hover:text-white',
      ghost: 'bg-transparent text-bauhaus-charcoal hover:bg-bauhaus-light',
    }

    const sizes = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
