import { Routes, Route, Link, useLocation } from 'react-router-dom'
import {
  Home,
  FolderPlus,
  Search,
  Settings,
  Terminal,
  Box,
  LayoutDashboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Pages
import Welcome from '@/pages/Welcome'
import Dashboard from '@/pages/Dashboard'
import NewProject from '@/pages/NewProject'
import ProjectView from '@/pages/ProjectView'
import HuggingFaceBrowser from '@/pages/HuggingFaceBrowser'
import Training from '@/pages/Training'
import SettingsPage from '@/pages/Settings'

const navigation = [
  { name: 'Home', href: '/home', icon: Home },
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'New Project', href: '/new', icon: FolderPlus },
  { name: 'Model Browser', href: '/models', icon: Search },
  { name: 'Settings', href: '/settings', icon: Settings },
]

function Sidebar() {
  const location = useLocation()

  // Hide sidebar on welcome page
  if (location.pathname === '/' || location.pathname === '/home') {
    return null
  }

  return (
    <div className="w-64 bg-white border-r border-bauhaus-silver h-screen fixed left-0 top-0 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-bauhaus-silver">
        <Link to="/home" className="flex items-center gap-3 hover:opacity-80 transition">
          <div className="w-10 h-10 bg-bauhaus-red flex items-center justify-center">
            <Box className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-bauhaus-black leading-tight">
              Bauhaus
            </h1>
            <p className="text-xs text-bauhaus-gray">Fine-Tuning Studio</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive =
              item.href === '/home'
                ? location.pathname === '/home'
                : location.pathname.startsWith(item.href)

            return (
              <li key={item.name}>
                <Link
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-none transition-all',
                    isActive
                      ? 'bg-bauhaus-black text-white'
                      : 'text-bauhaus-charcoal hover:bg-bauhaus-light'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-bauhaus-silver">
        <div className="flex items-center gap-2 text-sm text-bauhaus-gray">
          <Terminal className="w-4 h-4" />
          <span>v1.0.0</span>
        </div>
      </div>
    </div>
  )
}

function App() {
  const location = useLocation()
  const isWelcomePage = location.pathname === '/' || location.pathname === '/home'

  return (
    <div className="flex min-h-screen bg-bauhaus-light">
      <Sidebar />

      <main className={cn('flex-1', !isWelcomePage && 'ml-64')}>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/home" element={<Welcome />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/new" element={<NewProject />} />
          <Route path="/project/:projectId" element={<ProjectView />} />
          <Route path="/project/:projectId/train" element={<Training />} />
          <Route path="/models" element={<HuggingFaceBrowser />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
