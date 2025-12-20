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
import logging
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

logger = logging.getLogger(__name__)


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
    # All agents configured for YOLO/autonomous mode - no permission prompts
    AGENT_COMMANDS = {
        'claude': ['claude', '--dangerously-skip-permissions'],  # YOLO mode - skip all permission prompts
        'gemini': ['gemini'],  # Gemini uses environment variables for auto mode
        'codex': ['codex'],
        'qwen': ['qwen'],
        'aider': ['aider', '--yes', '--no-suggest-shell-commands'],  # Auto-approve all changes
        'bash': ['bash'],
        'python': ['python3'],
    }

    # Agent-specific environment setup for autonomous operation
    # Note: Model configuration is now handled dynamically via _build_agent_env()
    AGENT_ENV = {
        'claude': {
            'CLAUDE_CODE_ENTRYPOINT': '1',  # Mark as programmatic entry
            # ANTHROPIC_MODEL is set dynamically from settings via _build_agent_env()
        },
        'gemini': {
            'GEMINI_AUTO_APPROVE': 'true',  # Auto-approve changes
            'GEMINI_SANDBOX_RUN': 'true',   # Allow shell commands
            # GEMINI_MODEL is set dynamically from settings via _build_agent_env()
        },
        'aider': {
            'AIDER_AUTO_COMMITS': 'true',   # Auto-commit changes
            'AIDER_YES': 'true',            # Auto-yes to all prompts
            'AIDER_AUTO_LINT': 'true',      # Auto-lint code
            # AIDER_MODEL and OPENAI_API_KEY/BASE are set dynamically via _build_agent_env()
        },
        'codex': {
            'CODEX_AUTO_APPROVE': 'true',
            # OPENAI_MODEL and API settings are set dynamically via _build_agent_env()
        },
        'qwen': {
            'QWEN_AUTO_RUN': 'true',
            # QWEN_MODEL is set dynamically from settings via _build_agent_env()
        },
    }

    # Initial prompts to send to agents after startup
    AGENT_INITIAL_PROMPTS = {
        'claude': """Read the CLAUDE.md file in this directory for project context and instructions.
Then autonomously start working on the VLM fine-tuning task described there.
Create progress checkpoints, generate training code, and keep working until the task is complete.
Do not ask for permission - execute all necessary operations autonomously.""",
        'gemini': """Read the GEMINI.md file for project context and task instructions.
Start the VLM fine-tuning workflow autonomously. Generate code, run training, and report progress.
Execute all operations without asking for confirmation.""",
        'aider': """Read the project context from README.md and any .md files.
Start implementing the VLM fine-tuning code autonomously.
Commit changes as you go and keep working until complete.""",
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
            # Provide more helpful message with installation instructions
            install_hints = {
                'claude': 'npm install -g @anthropic-ai/claude-code',
                'gemini': 'npm install -g @anthropic-ai/gemini-cli',
                'aider': 'pip install aider-chat',
                'codex': 'npm install -g @openai/codex',
                'qwen': 'pip install qwen-cli',
            }
            hint = install_hints.get(agent, f'Install the {agent} CLI')
            # Fallback to bash with helpful message
            return ['bash', '-c', f'''
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Agent '{agent}' is not installed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  To install, run:"
echo "    {hint}"
echo ""
echo "  Starting bash shell instead..."
echo ""
exec bash
''']

        return commands

    def _build_agent_env(self, agent: str, model_config: Dict[str, str]) -> Dict[str, str]:
        """Build environment variables for agent with model config from settings.

        Args:
            agent: The agent type (claude, gemini, aider, etc.)
            model_config: Model configuration from settings containing:
                - default_model: The configured model name
                - api_key: API key for providers
                - base_url: Base URL for API

        Returns:
            Dictionary of environment variables for the agent
        """
        env = {}
        default_model = model_config.get('default_model', '')
        api_key = model_config.get('api_key', '')
        base_url = model_config.get('base_url', '')

        if agent == 'claude':
            # Claude Code uses ANTHROPIC_MODEL environment variable
            # If a model is configured in settings, use it
            if default_model:
                # Map common model names to Anthropic model IDs
                if 'claude' in default_model.lower():
                    env['ANTHROPIC_MODEL'] = default_model
                elif 'sonnet' in default_model.lower():
                    env['ANTHROPIC_MODEL'] = 'claude-sonnet-4-20250514'
                elif 'opus' in default_model.lower():
                    env['ANTHROPIC_MODEL'] = 'claude-opus-4-20250514'
                elif 'haiku' in default_model.lower():
                    env['ANTHROPIC_MODEL'] = 'claude-haiku-3-20250514'
                else:
                    # Use the default Claude model
                    env['ANTHROPIC_MODEL'] = 'claude-sonnet-4-20250514'

        elif agent == 'gemini':
            # Gemini CLI model configuration
            if default_model:
                if 'gemini' in default_model.lower():
                    env['GEMINI_MODEL'] = default_model
                else:
                    # Default to a capable Gemini model
                    env['GEMINI_MODEL'] = 'gemini-2.0-flash'
            # Pass API key if using Gemini
            if api_key and 'google' in base_url.lower() if base_url else False:
                env['GOOGLE_API_KEY'] = api_key

        elif agent == 'aider':
            # Aider supports multiple models via --model flag
            # We set AIDER_MODEL environment variable
            if default_model:
                env['AIDER_MODEL'] = default_model
            # Aider can use OpenAI-compatible APIs
            if api_key:
                env['OPENAI_API_KEY'] = api_key
            if base_url:
                env['OPENAI_API_BASE'] = base_url

        elif agent == 'codex':
            # Codex/OpenAI configuration
            if default_model:
                env['OPENAI_MODEL'] = default_model
            if api_key:
                env['OPENAI_API_KEY'] = api_key
            if base_url:
                env['OPENAI_API_BASE'] = base_url

        elif agent == 'qwen':
            # Qwen CLI configuration
            if default_model:
                env['QWEN_MODEL'] = default_model
            if api_key:
                env['DASHSCOPE_API_KEY'] = api_key

        return env

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
            except OSError as e:
                # Log to stderr since we're in child process
                import sys
                print(f"Warning: Could not change to working directory: {e}", file=sys.stderr)

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
                            except (ConnectionError, RuntimeError) as e:
                                logger.debug(f"WebSocket send failed: {e}")
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
            logger.error(f"Error in terminal output reader: {e}", exc_info=True)
            try:
                await session.websocket.send_json({
                    'type': 'error',
                    'message': str(e)
                })
            except (ConnectionError, RuntimeError):
                pass
        finally:
            session.running = False
            try:
                await session.websocket.send_json({
                    'type': 'status',
                    'running': False,
                    'message': 'Session ended'
                })
            except (ConnectionError, RuntimeError):
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
            except OSError as e:
                logger.debug(f"Failed to resize terminal: {e}")

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
            except OSError as e:
                logger.debug(f"Failed to send Ctrl+C to terminal: {e}")

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
            # Process already terminated
            pass
        except OSError as e:
            logger.debug(f"Error killing process: {e}")

        # Close file descriptor
        try:
            os.close(session.fd)
        except OSError as e:
            logger.debug(f"Error closing file descriptor: {e}")

        # Wait for process to avoid zombies
        try:
            os.waitpid(session.pid, os.WNOHANG)
        except ChildProcessError:
            # Process already reaped
            pass
        except OSError as e:
            logger.debug(f"Error waiting for process: {e}")

        # Remove from sessions
        if session_id in self.sessions:
            del self.sessions[session_id]

    async def handle_websocket(
        self,
        websocket: WebSocket,
        project_id: str,
        agent: str,
        model_config: Optional[Dict[str, str]] = None
    ):
        """Main WebSocket handler for terminal sessions."""

        await websocket.accept()

        session_id = f"{project_id}_{agent}"
        working_dir = Path(f"./projects/{project_id}")
        working_dir.mkdir(parents=True, exist_ok=True)

        session = None

        # Build environment variables for agent with model config from settings
        env_vars = self._build_agent_env(agent, model_config or {})

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
                working_dir=str(working_dir),
                env_vars=env_vars
            )

            await websocket.send_json({
                'type': 'status',
                'status': 'connected',
                'running': True,
                'session_id': session_id,
                'agent': agent,
                'model_config': {
                    'model': model_config.get('default_model', 'Not configured'),
                    'has_api_key': bool(model_config.get('api_key')),
                },
            })

            # Wait for agent to initialize - longer wait for complex agents
            await asyncio.sleep(2.0)

            # Check if session is still running before sending prompt
            if session and session.running:
                # Send initial autonomous prompt if available
                initial_prompt = self.AGENT_INITIAL_PROMPTS.get(agent)
                if initial_prompt:
                    await asyncio.sleep(1.0)  # Let agent fully start
                    await self.send_command(session_id, initial_prompt)
                    await websocket.send_json({
                        'type': 'status',
                        'status': 'autonomous',
                        'message': f'{agent} started in autonomous mode',
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
            logger.debug(f"WebSocket disconnected for session {session_id}")
        except Exception as e:
            logger.error(f"WebSocket error for session {session_id}: {e}", exc_info=True)
            try:
                await websocket.send_json({
                    'type': 'error',
                    'message': str(e)
                })
            except (ConnectionError, RuntimeError):
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
