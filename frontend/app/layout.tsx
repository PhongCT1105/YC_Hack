import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Minion HQ — Agent Task Dashboard',
  description: 'Monitor your AI-delegated worker fleet in real time',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  )
}
