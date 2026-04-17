import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { GithubLogo, Info, Camera, Shuffle, Export, PaintBrush } from '@phosphor-icons/react'

export function AppFooter() {
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <footer className="border-t border-border mt-12 py-6">
      <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Collage Maker
        </p>
        <div className="flex items-center gap-4">
          <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Info className="w-4 h-4 mr-1.5" weight="duotone" />
                About
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-xl">About Collage Maker</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>
                  A free, privacy-first photo collage builder that runs entirely in your browser.
                  No uploads to any server — your photos never leave your device.
                </p>

                <div className="space-y-3">
                  <h3 className="text-foreground font-medium">How to use</h3>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <Camera className="w-5 h-5 mt-0.5 text-accent shrink-0" weight="duotone" />
                      <p><strong className="text-foreground">Upload photos</strong> — drag and drop or click to browse. Supports JPEG, PNG, WebP, and HEIC formats (up to 16 photos).</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Shuffle className="w-5 h-5 mt-0.5 text-accent shrink-0" weight="duotone" />
                      <p><strong className="text-foreground">Choose a layout</strong> — browse layouts in the sidebar, shuffle randomly, or explore auto-generated arrangements.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <PaintBrush className="w-5 h-5 mt-0.5 text-accent shrink-0" weight="duotone" />
                      <p><strong className="text-foreground">Customize</strong> — adjust spacing, corner radius, and background color. Drag photos to reorder. Double-click to crop and adjust.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Export className="w-5 h-5 mt-0.5 text-accent shrink-0" weight="duotone" />
                      <p><strong className="text-foreground">Export</strong> — download as PNG, JPEG, or WebP in your preferred quality.</p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  <p className="text-xs">
                    Built with React, Tailwind CSS, and IndexedDB. Works offline as a PWA.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <a
            href="https://github.com/esmcelroy/photo-grid-collage-maker"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="View source on GitHub"
          >
            <GithubLogo className="w-5 h-5" weight="duotone" />
          </a>
        </div>
      </div>
    </footer>
  )
}
