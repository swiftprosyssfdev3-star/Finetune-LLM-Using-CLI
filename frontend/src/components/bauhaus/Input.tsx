import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-bauhaus-black mb-2"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-4 py-3 border-2 bg-white',
            'focus:outline-none transition-colors',
            'placeholder:text-bauhaus-gray',
            error
              ? 'border-bauhaus-red focus:border-bauhaus-red'
              : 'border-bauhaus-charcoal focus:border-bauhaus-blue',
            className
          )}
          {...props}
        />
        {hint && !error && (
          <p className="mt-2 text-sm text-bauhaus-gray">{hint}</p>
        )}
        {error && (
          <p className="mt-2 text-sm text-bauhaus-red">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }
