'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/actions/auth-actions'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const router = useRouter()

  const handleLogout = async () => {
    await signOut()
  }

  const navItems = [
    { label: 'Tableau de bord', href: '/admin/dashboard', icon: '📊' },
    {
      label: 'Production',
      icon: '🏭',
      children: [
        { label: 'Vue d\'ensemble', href: '/admin/production/vue-ensemble' },
        { label: '+ Nouvelle commande', href: '/admin/production/new' },
        { label: 'File DTF', href: '/admin/queues/dtf' },
        { label: 'Flocage', href: '/admin/queues/flocage' },
        { label: 'File Broderie', href: '/admin/queues/broderie' },
        { label: 'Commande gros', href: '/admin/production/commande-gros' },
        { label: 'Commandes prêtes', href: '/admin/production/pret' },
        { label: '📦 Yalidine', href: '/admin/queues/yalidine' },
      ],
    },
    { label: 'CRM', href: '/admin/clients', icon: '👤' },
    { label: 'Ventes', href: '/admin/ventes', icon: '🛒' },
    { label: 'Réclamations', href: '/admin/reclamations', icon: '📝' },
    { label: 'Achats', href: '/admin/achats', icon: '🔒' },
    { label: 'Stock', href: '/admin/stock', icon: '📦' },
    { label: 'Comptabilité', href: '/admin/comptabilite', icon: '📊' },
    { label: 'Rapports', href: '/admin/rapports', icon: '📈' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50">
        <div className="flex items-center justify-between px-4 sm:px-6 h-16">
          {/* Menu Toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="inline-flex lg:hidden items-center justify-center w-10 h-10 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {sidebarOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Logo */}
          <div className="flex items-center gap-3 flex-1 justify-center lg:justify-start ml-4 lg:ml-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center font-bold text-sm">
              C
            </div>
            <span className="font-semibold text-slate-900 dark:text-white hidden sm:inline-block">CARACTÈRE</span>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="ml-auto px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
          >
            Déco
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed left-0 top-16 bottom-0 w-64 bg-white dark:bg-slate-900/50 border-r border-slate-200/50 dark:border-slate-800/50 backdrop-blur-sm transition-transform duration-300 ease-in-out z-40 lg:static lg:translate-x-0 overflow-y-auto ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="flex flex-col gap-1 p-4">
            {navItems.map((item, idx) => (
              <div key={idx}>
                {item.href ? (
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors text-sm no-underline"
                  >
                    <span className="text-lg w-5">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ) : (
                  <>
                    <button
                      onClick={() => setExpandedSection(expandedSection === item.label ? null : item.label)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg w-5">{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                      <span className={`text-xs transition-transform ${expandedSection === item.label ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>
                    {expandedSection === item.label && item.children && (
                      <div className="mt-1 ml-4 flex flex-col gap-1 pl-2 border-l-2 border-slate-200 dark:border-slate-700">
                        {item.children.map((child, cidx) => (
                          <Link
                            key={cidx}
                            href={child.href}
                            onClick={() => setSidebarOpen(false)}
                            className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 no-underline hover:bg-blue-50 dark:hover:bg-slate-800/50 rounded transition-colors"
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main */}
        <main className="flex-1 w-full overflow-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
