import { DownloadSimple } from '@phosphor-icons/react'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function InstallButton() {
  const { canInstall, triggerInstall, isIos, isStandalone } = usePwaInstall()

  if (isStandalone || (!canInstall && !isIos)) {
    return null
  }

  if (isIos) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            aria-label="Install app"
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
              'hover:bg-muted text-foreground'
            )}
          >
            <DownloadSimple weight="bold" className="h-4 w-4" />
            Install
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 text-sm">
          <p>Tap the Share button, then &apos;Add to Home Screen&apos;</p>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <button
      aria-label="Install app"
      onClick={() => triggerInstall()}
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
        'hover:bg-muted text-foreground'
      )}
    >
      <DownloadSimple weight="bold" className="h-4 w-4" />
      Install
    </button>
  )
}
