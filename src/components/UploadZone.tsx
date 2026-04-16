import { useCallback, useState } from 'react'
import { UploadSimple, Image as ImageIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const HEIC_EXTENSIONS = ['.heic', '.heif']

function isImageOrHeic(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  return HEIC_EXTENSIONS.includes(ext)
}

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void
  maxFiles?: number
  currentFileCount?: number
}

export function UploadZone({ 
  onFilesSelected, 
  maxFiles = 9,
  currentFileCount = 0 
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = Array.from(e.dataTransfer.files).filter(isImageOrHeic)
    
    const remainingSlots = maxFiles - currentFileCount
    const filesToAdd = files.slice(0, remainingSlots)
    
    if (filesToAdd.length > 0) {
      onFilesSelected(filesToAdd)
    }
  }, [onFilesSelected, maxFiles, currentFileCount])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(isImageOrHeic)
    const remainingSlots = maxFiles - currentFileCount
    const filesToAdd = files.slice(0, remainingSlots)
    
    if (filesToAdd.length > 0) {
      onFilesSelected(filesToAdd)
    }
    
    e.target.value = ''
  }, [onFilesSelected, maxFiles, currentFileCount])

  const remainingSlots = maxFiles - currentFileCount
  const isMaxed = remainingSlots <= 0

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-xl transition-all duration-300",
        isDragging 
          ? "border-accent bg-accent/5 shadow-lg shadow-accent/20" 
          : "border-border hover:border-accent/50 hover:bg-accent/[0.02]",
        isMaxed && "opacity-50 pointer-events-none"
      )}
      onDragOver={(e) => {
        e.preventDefault()
        if (!isMaxed) setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="photo-upload"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
        multiple
        onChange={handleFileInput}
        disabled={isMaxed}
      />
      
      <label 
        htmlFor="photo-upload" 
        className="flex flex-col items-center justify-center py-12 px-6 cursor-pointer"
      >
        <div className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-all duration-300",
          isDragging 
            ? "bg-accent/10 scale-110" 
            : "bg-secondary/50"
        )}>
          {isDragging ? (
            <ImageIcon className="w-8 h-8 text-accent" weight="duotone" />
          ) : (
            <UploadSimple className="w-8 h-8 text-primary" weight="duotone" />
          )}
        </div>
        
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {isDragging ? 'Drop your photos here' : 'Upload Photos'}
        </h3>
        
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          {isMaxed 
            ? `Maximum of ${maxFiles} photos reached`
            : `Drag and drop or click to select ${remainingSlots === maxFiles ? 'up to' : 'up to'} ${remainingSlots} ${remainingSlots === 1 ? 'photo' : 'photos'}`
          }
        </p>
        
        <p className="text-xs text-muted-foreground mt-2">
          Supports JPEG, PNG, and HEIC
        </p>
      </label>
    </div>
  )
}
