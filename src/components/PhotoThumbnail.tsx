import { X } from '@phosphor-icons/react'
import { UploadedPhoto } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

interface PhotoThumbnailProps {
  photo: UploadedPhoto
  onRemove: (photoId: string) => void
  index: number
}

export function PhotoThumbnail({ photo, onRemove, index }: PhotoThumbnailProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ delay: index * 0.05 }}
      className="relative group aspect-square rounded-lg overflow-hidden bg-muted"
    >
      <img
        src={photo.dataUrl}
        alt={photo.file.name}
        className="w-full h-full object-cover"
      />
      
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200" />
      
      <Button
        size="icon"
        variant="destructive"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 w-7 h-7"
        onClick={() => onRemove(photo.id)}
      >
        <X className="w-4 h-4" weight="bold" />
      </Button>
      
      <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <p className="text-xs text-white font-medium truncate bg-black/50 px-2 py-1 rounded">
          {photo.file.name}
        </p>
      </div>
    </motion.div>
  )
}
