import type { Metadata } from 'next'
import './globals.css'
import { ModeProvider } from '@/lib/modeContext'
import { ModeToggle } from '@/components/ModeToggle'

export const metadata: Metadata = {
  title: 'Minion HQ — Agent Task Dashboard',
  description: 'Monitor your AI-delegated worker fleet in real time',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">
        <ModeProvider>
          <ModeToggle />
          {children}
        </ModeProvider>
      </body>
    </html>
  )
}
