import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface UpdateToastProps {
  needRefresh: boolean
  onRefresh: () => void
}

export function UpdateToast({ needRefresh, onRefresh }: UpdateToastProps) {
  const [dismissed, setDismissed] = useState(false)

  const visible = needRefresh && !dismissed

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          className={cn(
            'fixed bottom-4 right-4 z-50 rounded-lg border border-border bg-background p-4 shadow-lg',
            'flex flex-col gap-3'
          )}
        >
          <p className="text-sm font-medium text-foreground">
            A new version is available
          </p>
          <div className="flex gap-2">
            <button
              onClick={onRefresh}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              Refresh Now
            </button>
            <button
              onClick={() => setDismissed(true)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
