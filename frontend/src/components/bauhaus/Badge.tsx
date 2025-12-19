import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'red' | 'blue' | 'yellow' | 'green' | 'gray'
  size?: 'sm' | 'md'
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'sm', ...props }, ref) => {
    const variants = {
      default: 'bg-bauhaus-charcoal text-white',
      red: 'bg-bauhaus-red text-white',
      blue: 'bg-bauhaus-blue text-white',
      yellow: 'bg-bauhaus-yellow text-bauhaus-black',
      green: 'bg-terminal-green text-bauhaus-black',
      gray: 'bg-bauhaus-silver text-bauhaus-charcoal',
    }

    const sizes = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-3 py-1 text-sm',
    }

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium rounded-full',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    )
  }
)

Badge.displayName = 'Badge'

export interface AgentBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  agent: 'claude' | 'gemini' | 'codex' | 'qwen' | 'aider'
}

const AgentBadge = forwardRef<HTMLSpanElement, AgentBadgeProps>(
  ({ className, agent, ...props }, ref) => {
    const agents = {
      claude: { bg: 'bg-agent-claude', label: 'Claude Code' },
      gemini: { bg: 'bg-agent-gemini', label: 'Gemini CLI' },
      codex: { bg: 'bg-agent-codex', label: 'Codex' },
      qwen: { bg: 'bg-agent-qwen', label: 'Qwen Code' },
      aider: { bg: 'bg-agent-aider', label: 'Aider' },
    }

    const { bg, label } = agents[agent]

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-3 py-1 text-sm font-medium text-white rounded-full',
          bg,
          className
        )}
        {...props}
      >
        {label}
      </span>
    )
  }
)

AgentBadge.displayName = 'AgentBadge'

export { Badge, AgentBadge }
