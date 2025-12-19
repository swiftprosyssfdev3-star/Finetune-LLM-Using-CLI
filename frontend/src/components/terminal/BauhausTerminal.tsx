import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'
import { cn, getAgentColor, getAgentLabel } from '@/lib/utils'
import { Pause, X, Maximize2, Minimize2 } from 'lucide-react'
import { createTerminalWebSocket } from '@/lib/api'

interface BauhausTerminalProps {
  projectId: string
  agent: 'claude' | 'gemini' | 'codex' | 'qwen' | 'aider' | 'bash'
  className?: string
  onStatusChange?: (running: boolean) => void
}

export function BauhausTerminal({
  projectId,
  agent,
  className,
  onStatusChange,
}: BauhausTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)
  const ws = useRef<WebSocket | null>(null)

  const [isConnected, setIsConnected] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return

    const websocket = createTerminalWebSocket(projectId, agent)

    websocket.onopen = () => {
      setIsConnected(true)
      terminal.current?.writeln('\x1b[32mConnected to ' + getAgentLabel(agent) + '\x1b[0m')

      // Send initial size
      if (terminal.current) {
        websocket.send(JSON.stringify({
          type: 'resize',
          cols: terminal.current.cols,
          rows: terminal.current.rows,
        }))
      }
    }

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'output') {
          terminal.current?.write(data.data)
        } else if (data.type === 'status') {
          setIsRunning(data.running)
          onStatusChange?.(data.running)
          if (!data.running && data.message) {
            terminal.current?.writeln('\x1b[33m' + data.message + '\x1b[0m')
          }
        } else if (data.type === 'error') {
          terminal.current?.writeln('\x1b[31mError: ' + data.message + '\x1b[0m')
        }
      } catch {
        // Raw output
        terminal.current?.write(event.data)
      }
    }

    websocket.onclose = () => {
      setIsConnected(false)
      setIsRunning(false)
      onStatusChange?.(false)
      terminal.current?.writeln('\x1b[33mDisconnected\x1b[0m')
    }

    websocket.onerror = () => {
      terminal.current?.writeln('\x1b[31mConnection error\x1b[0m')
    }

    ws.current = websocket
  }, [projectId, agent, onStatusChange])

  const sendInput = useCallback((data: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'input', data }))
    }
  }, [])

  const stop = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'stop' }))
    }
  }, [])

  const kill = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'kill' }))
      ws.current.close()
    }
  }, [])

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 14,
      lineHeight: 1.4,
      theme: {
        background: '#0D1117',
        foreground: '#C9D1D9',
        cursor: '#79C0FF',
        cursorAccent: '#0D1117',
        selectionBackground: '#30363D',
        black: '#0D1117',
        red: '#FF7B72',
        green: '#7EE787',
        yellow: '#FFA657',
        blue: '#79C0FF',
        magenta: '#D2A8FF',
        cyan: '#A5D6FF',
        white: '#C9D1D9',
        brightBlack: '#6E7681',
        brightRed: '#FFA198',
        brightGreen: '#A5D6FF',
        brightYellow: '#FFD33D',
        brightBlue: '#A5D6FF',
        brightMagenta: '#D2A8FF',
        brightCyan: '#A5D6FF',
        brightWhite: '#FFFFFF',
      },
    })

    const fit = new FitAddon()
    const webLinks = new WebLinksAddon()

    term.loadAddon(fit)
    term.loadAddon(webLinks)

    term.open(terminalRef.current)
    fit.fit()

    terminal.current = term
    fitAddon.current = fit

    // Handle input
    term.onData((data) => {
      sendInput(data)
    })

    // Handle resize
    const handleResize = () => {
      fit.fit()
      if (ws.current?.readyState === WebSocket.OPEN && term) {
        ws.current.send(JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows,
        }))
      }
    }

    window.addEventListener('resize', handleResize)

    // Connect
    connect()

    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
      ws.current?.close()
    }
  }, [connect, sendInput])

  // Refit on fullscreen change
  useEffect(() => {
    setTimeout(() => fitAddon.current?.fit(), 100)
  }, [isFullscreen])

  const agentColor = getAgentColor(agent)

  return (
    <div
      className={cn(
        'terminal-container flex flex-col',
        isFullscreen && 'fixed inset-0 z-50',
        className
      )}
    >
      {/* Header */}
      <div className="terminal-header">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: agentColor }}
          />
          <span className="text-terminal-text font-medium">
            {getAgentLabel(agent)}
          </span>
          <span className="text-terminal-text/50 text-sm">
            {projectId}
          </span>
          {isConnected && (
            <span className="flex items-center gap-1 text-terminal-green text-xs">
              <span className="w-2 h-2 rounded-full bg-terminal-green animate-pulse" />
              {isRunning ? 'Running' : 'Connected'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={stop}
              className="p-1.5 text-terminal-orange hover:bg-terminal-border rounded transition"
              title="Stop (Ctrl+C)"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-terminal-text/70 hover:bg-terminal-border rounded transition"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={kill}
            className="p-1.5 text-terminal-red hover:bg-terminal-border rounded transition"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={terminalRef}
        className={cn(
          'flex-1 min-h-[400px]',
          isFullscreen && 'h-[calc(100vh-48px)]'
        )}
      />
    </div>
  )
}
