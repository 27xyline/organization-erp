import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AppLayout } from '@/components/app-layout'
import { ToastProvider } from '@/components/ui/toast'
import { Providers } from '@/components/providers'

const inter = Inter({ subsets: ['latin', 'cyrillic'] })

export const metadata: Metadata = {
  title: 'Consilium - Управление активами',
  description: 'Система управления активами и имуществом',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <body className={`${inter.className} antialiased min-h-screen bg-background text-foreground`}>
        <Providers>
          <ToastProvider>
            <AppLayout>{children}</AppLayout>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  )
}