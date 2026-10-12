import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_BACKUP_BYTES, type ProjectSummary } from '@/lib/db'

interface ProjectLibraryProps {
  projects: ProjectSummary[]
  activeId: string | null
  activeName?: string
  loading?: boolean
  loadError?: Error | null
  onRetry?: () => void
  onOpen: (id: string) => void | Promise<void>
  onCreate: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDuplicate: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onExport: () => Promise<unknown>
  onImport: (backup: unknown) => Promise<void>
}

export function ProjectLibrary({ projects = [], activeId, activeName, loading, loadError, onRetry, onOpen, onCreate, onRename, onDuplicate, onDelete, onExport, onImport }: ProjectLibraryProps) {
  const [view, setView] = useState<'library' | 'create' | 'rename' | 'delete' | null>(null)
  const [selected, setSelected] = useState<ProjectSummary | null>(null)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const manage = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const run = async (action: () => Promise<unknown> | void, close = true) => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setError('')
    try {
      await action()
      if (close) setView(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project operation failed. Please try again.')
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }
  const save = async () => {
    const backup = await onExport()
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
    try {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'collage-backup.json'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
    } finally {
      // Let the browser consume the download URL before releasing it.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
  return <section className="mb-4" aria-labelledby="projects-heading">
    <div className="flex flex-wrap gap-2 items-center">
      <div className="min-w-0 mr-auto"><h2 id="projects-heading" className="font-semibold">Projects</h2>
        <p className="text-sm text-muted-foreground break-all" aria-live="polite">Editing: {activeName ?? projects.find(project => project.id === activeId)?.name ?? 'Untitled collage'}</p>
      </div>
      <Button size="sm" disabled={pending} onClick={event => { returnFocus.current = event.currentTarget; setError(''); setName('Untitled collage'); setView('create') }}>New project</Button>
      <Button ref={manage} size="sm" variant="outline" disabled={pending} onClick={event => { returnFocus.current = event.currentTarget; setError(''); setView('library') }}>Manage projects</Button>
      <Button size="sm" variant="outline" disabled={pending || !activeId} onClick={() => void run(save, false)}>Back up</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => input.current?.click()}>Restore backup</Button>
      <input ref={input} className="sr-only" type="file" accept="application/json,.json" aria-label="Restore backup file" disabled={pending} onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        void run(async () => {
          if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup file is too large (maximum 50 MiB)')
          await onImport(JSON.parse(await file.text()))
        })
      }} />
    </div>
    {!view && error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    <Dialog open={view !== null} onOpenChange={open => { if (!open && !pendingRef.current) setView(null) }}>
      <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto" aria-busy={pending} onCloseAutoFocus={event => {
        event.preventDefault()
        const target = returnFocus.current?.isConnected ? returnFocus.current : manage.current
        target?.focus()
      }}>
        <DialogHeader>
          <DialogTitle>{view === 'library' ? 'Saved projects' : view === 'create' ? 'New project' : view === 'rename' ? 'Rename project' : 'Delete project?'}</DialogTitle>
          <DialogDescription>{view === 'delete'
            ? `Delete “${selected?.name}” and all its photos? This cannot be undone. Other projects and downloaded backups will be kept.`
            : 'Saved only in this browser. Back up a project to keep a portable copy.'}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {view === 'library' && <>
          {loading && <p role="status">Loading projects…</p>}
          {loadError && <div role="alert">Projects could not be loaded. <Button variant="outline" onClick={onRetry}>Retry projects</Button></div>}
          <ul className="grid gap-3 sm:grid-cols-2" aria-label="Saved projects">{projects.map(project => <li key={project.id} className="border rounded-lg p-3 min-w-0">
            <div className="flex gap-3 items-center">
              {project.preview && <img src={project.preview} alt="" className="size-12 object-cover rounded" />}
              <div className="min-w-0"><p className="font-medium break-all">{project.name}</p><p className="text-xs text-muted-foreground">{project.photoCount} photos · Modified {new Date(project.updatedAt).toLocaleDateString()}</p></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              <Button size="sm" disabled={pending} aria-label={`Open ${project.name}`} aria-pressed={project.id === activeId} onClick={() => void run(() => onOpen(project.id))}>Open</Button>
              <Button size="sm" variant="outline" disabled={pending} aria-label={`Rename ${project.name}`} onClick={() => { setSelected(project); setName(project.name); setError(''); setView('rename') }}>Rename</Button>
              <Button size="sm" variant="ghost" disabled={pending} aria-label={`Duplicate ${project.name}`} onClick={() => void run(() => onDuplicate(project.id))}>Duplicate</Button>
              <Button size="sm" variant="ghost" disabled={pending} aria-label={`Delete ${project.name}`} onClick={() => { setSelected(project); setError(''); setView('delete') }}>Delete</Button>
            </div>
          </li>)}</ul>
          <DialogFooter><Button disabled={pending} onClick={() => { setName('Untitled collage'); setView('create') }}>New project</Button></DialogFooter>
        </>}
        {(view === 'create' || view === 'rename') && <form onSubmit={event => { event.preventDefault(); void run(() => view === 'create' ? onCreate(name.trim()) : onRename(selected!.id, name.trim())) }}>
          <Label htmlFor="project-name">Project name</Label>
          <Input id="project-name" className="mt-2" autoFocus required maxLength={200} value={name} disabled={pending} onChange={event => setName(event.target.value)} />
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setView(null)}>Cancel</Button>
            <Button type="submit" disabled={pending || !name.trim()}>{pending ? 'Saving…' : view === 'create' ? 'Create project' : 'Save name'}</Button>
          </DialogFooter>
        </form>}
        {view === 'delete' && <DialogFooter>
          <Button variant="outline" autoFocus disabled={pending} onClick={() => setView(null)}>Cancel</Button>
          <Button variant="destructive" disabled={pending} onClick={() => void run(() => onDelete(selected!.id))}>{pending ? 'Deleting…' : 'Delete project'}</Button>
        </DialogFooter>}
      </DialogContent>
    </Dialog>
  </section>
}
