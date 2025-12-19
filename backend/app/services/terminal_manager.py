"""
Terminal Manager Service
Real-time PTY streaming over WebSocket using xterm.js

Features:
- Spawn PTY for any CLI agent
- Stream output to frontend via WebSocket
- Handle input from user
- Terminal resize support
"""

import asyncio
import os
import pty
import select
import fcntl
import struct
import termios
import signal
import shutil
from pathlib import Path
from typing import Dict, Optional
from dataclasses import dataclass, field
from fastapi import WebSocket, WebSocketDisconnect
import json


@dataclass
class TerminalSession:
    """Active terminal session."""
    session_id: str
    project_id: str
    agent: str
    pid: int
    fd: int
    websocket: WebSocket
    running: bool = True
    cols: int = 80
    rows: int = 24


class TerminalManager:
    """
    Manages PTY sessions for CLI agents with WebSocket streaming.

    Features:
    - Spawn PTY for any CLI agent
    - Stream output to frontend via WebSocket
    - Handle input from user
    - Terminal resize support
    """

    # Agent commands - these CLI tools must be installed
    AGENT_COMMANDS = {
        'claude': ['claude'],
        'gemini': ['gemini'],
        'codex': ['codex'],
        'qwen': ['qwen'],
        'aider': ['aider', '--yes'],
        'bash': ['bash'],
        'python': ['python3'],
    }

    # Agent-specific environment setup
    AGENT_ENV = {
        'claude': {
            'ANTHROPIC_MODEL': 'claude-sonnet-4-20250514',
        },
        'aider': {
            'AIDER_AUTO_COMMITS': 'true',
        },
    }

    def __init__(self):
        self.sessions: Dict[str, TerminalSession] = {}
        self._read_tasks: Dict[str, asyncio.Task] = {}

    def _find_agent_command(self, agent: str) -> list:
        """Find the command for an agent, checking if it's installed."""

        commands = self.AGENT_COMMANDS.get(agent, ['bash'])

        # Check if the command exists
        cmd = commands[0]
        if shutil.which(cmd) is None:
            # Fallback to bash if agent not found
            return ['bash', '-c', f'echo "Agent {agent} not found. Using bash shell." && bash']

        return commands

    async def create_session(
        self,
        project_id: str,
        agent: str,
        websocket: WebSocket,
        working_dir: str,
        env_vars: Optional[Dict[str, str]] = None
    ) -> TerminalSession:
        """Create a new terminal session."""

        session_id = f"{project_id}_{agent}"

        # Kill existing session if any
        if session_id in self.sessions:
            await self.kill(session_id)

        # Set up environment
        env = os.environ.copy()
        env['TERM'] = 'xterm-256color'
        env['COLORTERM'] = 'truecolor'
        env['FORCE_COLOR'] = '1'

        # Add agent-specific environment
        agent_env = self.AGENT_ENV.get(agent, {})
        env.update(agent_env)

        # Add custom environment variables
        if env_vars:
            env.update(env_vars)

        # Get command
        command = self._find_agent_command(agent)

        # Fork PTY
        pid, fd = pty.fork()

        if pid == 0:
            # Child process
            try:
                os.chdir(working_dir)
            except:
                pass

            os.execvpe(command[0], command, env)
        else:
            # Parent process - set non-blocking
            flags = fcntl.fcntl(fd, fcntl.F_GETFL)
            fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

            session = TerminalSession(
                session_id=session_id,
                project_id=project_id,
                agent=agent,
                pid=pid,
                fd=fd,
                websocket=websocket,
                running=True
            )

            self.sessions[session_id] = session

            # Start output reader task
            self._read_tasks[session_id] = asyncio.create_task(
                self._read_output(session_id)
            )

            return session

    async def _read_output(self, session_id: str):
        """Read PTY output and send to WebSocket."""

        session = self.sessions.get(session_id)
        if not session:
            return

        try:
            while session.running:
                # Check if there's data to read
                r, _, _ = select.select([session.fd], [], [], 0.05)

                if r:
                    try:
                        data = os.read(session.fd, 4096)
                        if data:
                            try:
                                await session.websocket.send_json({
                                    'type': 'output',
                                    'data': data.decode('utf-8', errors='replace')
                                })
                            except:
                                break
                        else:
                            # EOF
                            break
                    except OSError as e:
                        if e.errno == 5:  # Input/output error (process ended)
                            break
                        raise
                else:
                    # Check if process is still running
                    try:
                        pid, status = os.waitpid(session.pid, os.WNOHANG)
                        if pid != 0:
                            # Process ended
                            break
                    except ChildProcessError:
                        break

                await asyncio.sleep(0.01)

        except Exception as e:
            try:
                await session.websocket.send_json({
                    'type': 'error',
                    'message': str(e)
                })
            except:
                pass
        finally:
            session.running = False
            try:
                await session.websocket.send_json({
                    'type': 'status',
                    'running': False,
                    'message': 'Session ended'
                })
            except:
                pass

    async def send_input(self, session_id: str, data: str):
        """Send input to PTY."""
        session = self.sessions.get(session_id)
        if session and session.running:
            try:
                os.write(session.fd, data.encode('utf-8'))
            except OSError:
                pass

    async def send_command(self, session_id: str, command: str):
        """Send a command to the agent (with newline)."""
        await self.send_input(session_id, f"{command}\n")

    async def resize(self, session_id: str, cols: int, rows: int):
        """Resize terminal."""
        session = self.sessions.get(session_id)
        if session:
            try:
                winsize = struct.pack('HHHH', rows, cols, 0, 0)
                fcntl.ioctl(session.fd, termios.TIOCSWINSZ, winsize)
                session.cols = cols
                session.rows = rows
            except:
                pass

    async def send_signal(self, session_id: str, sig: int):
        """Send a signal to the terminal process."""
        session = self.sessions.get(session_id)
        if session and session.running:
            try:
                os.kill(session.pid, sig)
            except ProcessLookupError:
                pass

    async def stop(self, session_id: str):
        """Send Ctrl+C (SIGINT) to terminal."""
        session = self.sessions.get(session_id)
        if session and session.running:
            try:
                os.write(session.fd, b'\x03')  # Ctrl+C
            except:
                pass

    async def kill(self, session_id: str):
        """Kill terminal session."""
        session = self.sessions.get(session_id)
        if not session:
            return

        session.running = False

        # Cancel read task
        if session_id in self._read_tasks:
            self._read_tasks[session_id].cancel()
            del self._read_tasks[session_id]

        # Kill process
        try:
            os.kill(session.pid, signal.SIGTERM)
            # Give it a moment to terminate gracefully
            await asyncio.sleep(0.1)
            os.kill(session.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except:
            pass

        # Close file descriptor
        try:
            os.close(session.fd)
        except OSError:
            pass

        # Wait for process
        try:
            os.waitpid(session.pid, os.WNOHANG)
        except:
            pass

        # Remove from sessions
        if session_id in self.sessions:
            del self.sessions[session_id]

    async def handle_websocket(
        self,
        websocket: WebSocket,
        project_id: str,
        agent: str
    ):
        """Main WebSocket handler for terminal sessions."""

        await websocket.accept()

        session_id = f"{project_id}_{agent}"
        working_dir = Path(f"./projects/{project_id}")
        working_dir.mkdir(parents=True, exist_ok=True)

        session = None

        try:
            # Send initial status
            await websocket.send_json({
                'type': 'status',
                'status': 'connecting',
                'session_id': session_id,
                'agent': agent,
            })

            # Create terminal session
            session = await self.create_session(
                project_id=project_id,
                agent=agent,
                websocket=websocket,
                working_dir=str(working_dir)
            )

            await websocket.send_json({
                'type': 'status',
                'status': 'connected',
                'running': True,
                'session_id': session_id,
                'agent': agent,
            })

            # Handle incoming messages
            while session.running:
                try:
                    message = await asyncio.wait_for(
                        websocket.receive_json(),
                        timeout=0.1
                    )

                    msg_type = message.get('type')

                    if msg_type == 'input':
                        # Raw input (keystrokes)
                        await self.send_input(session_id, message.get('data', ''))

                    elif msg_type == 'command':
                        # Full command with newline
                        await self.send_command(session_id, message.get('command', ''))

                    elif msg_type == 'resize':
                        await self.resize(
                            session_id,
                            message.get('cols', 80),
                            message.get('rows', 24)
                        )

                    elif msg_type == 'stop':
                        await self.stop(session_id)

                    elif msg_type == 'signal':
                        await self.send_signal(session_id, message.get('signal', signal.SIGINT))

                    elif msg_type == 'kill':
                        await self.kill(session_id)
                        break

                    elif msg_type == 'ping':
                        await websocket.send_json({'type': 'pong'})

                except asyncio.TimeoutError:
                    continue
                except WebSocketDisconnect:
                    break
                except json.JSONDecodeError:
                    continue

        except WebSocketDisconnect:
            pass
        except Exception as e:
            try:
                await websocket.send_json({
                    'type': 'error',
                    'message': str(e)
                })
            except:
                pass
        finally:
            # Cleanup
            await self.kill(session_id)

    def get_session(self, session_id: str) -> Optional[TerminalSession]:
        """Get a terminal session by ID."""
        return self.sessions.get(session_id)

    def list_sessions(self) -> list:
        """List all active sessions."""
        return [
            {
                'session_id': s.session_id,
                'project_id': s.project_id,
                'agent': s.agent,
                'running': s.running,
                'cols': s.cols,
                'rows': s.rows,
            }
            for s in self.sessions.values()
        ]


# Global instance
terminal_manager = TerminalManager()
