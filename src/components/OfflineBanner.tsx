import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface OfflineBannerProps {
  isOnline: boolean
  offlineReady: boolean
}

export function OfflineBanner({ isOnline, offlineReady }: OfflineBannerProps) {
  const [showReady, setShowReady] = useState(false)

  useEffect(() => {
    if (offlineReady && isOnline) {
      const alreadyShown = localStorage.getItem('pwa-offline-ready-shown')
      if (!alreadyShown) {
        setShowReady(true)
        localStorage.setItem('pwa-offline-ready-shown', 'true')

        const timer = setTimeout(() => {
          setShowReady(false)
        }, 4000)

        return () => clearTimeout(timer)
      }
    }
  }, [offlineReady, isOnline])

  const showOffline = !isOnline

  return (
    <AnimatePresence>
      {showOffline && (
        <motion.div
          key="offline"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className={cn(
            'fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-2 px-4 text-sm font-medium',
            'bg-amber-100 text-amber-900 border-b border-amber-200'
          )}
        >
          You&apos;re offline — everything still works
        </motion.div>
      )}
      {!showOffline && showReady && (
        <motion.div
          key="ready"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className={cn(
            'fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-2 px-4 text-sm font-medium',
            'bg-green-100 text-green-900 border-b border-green-200'
          )}
        >
          Ready for offline use ✓
        </motion.div>
      )}
    </AnimatePresence>
  )
}
