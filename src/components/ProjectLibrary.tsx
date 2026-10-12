import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ProjectSummary } from '@/lib/db'

interface ProjectLibraryProps {
  projects: ProjectSummary[]
  activeId: string | null
  onOpen: (id: string) => void
  onCreate: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDuplicate: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onExport: () => Promise<unknown>
  onImport: (backup: unknown) => Promise<void>
}

export function ProjectLibrary({ projects = [], activeId, onOpen, onCreate, onRename, onDuplicate, onDelete, onExport, onImport }: ProjectLibraryProps) {
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const save = async () => {
    const backup = await onExport()
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'collage-backup.json'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <section className="mb-4" aria-labelledby="projects-heading">
    <div className="flex flex-wrap gap-2 items-center"><h2 id="projects-heading" className="font-semibold">Projects</h2>
      <Button size="sm" onClick={() => void onCreate(window.prompt('Project name', 'Untitled collage') || 'Untitled collage')}>New project</Button>
      <Button size="sm" variant="outline" onClick={() => void save()}>Back up</Button>
      <Button size="sm" variant="outline" onClick={() => input.current?.click()}>Restore backup</Button>
      <input ref={input} className="sr-only" type="file" accept="application/json" aria-label="Restore backup file" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { await onImport(JSON.parse(await file.text())); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Backup could not be restored') } e.currentTarget.value = '' }} />
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Saved projects">{projects.map(project => <li key={project.id} className="border rounded p-2 flex gap-2 items-center">
      {project.preview && <img src={project.preview} alt="" className="size-8 object-cover rounded" />}<button className="underline" aria-current={project.id === activeId ? 'page' : undefined} onClick={() => onOpen(project.id)}>{project.name}</button><span className="text-xs text-muted-foreground">{new Date(project.updatedAt).toLocaleDateString()}</span>
      <Button size="sm" variant="ghost" onClick={() => void onRename(project.id, window.prompt('Project name', project.name) || project.name)}>Rename</Button><Button size="sm" variant="ghost" onClick={() => void onDuplicate(project.id)}>Duplicate</Button><Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Delete ${project.name}? This cannot be undone.`)) void onDelete(project.id) }}>Delete</Button>
    </li>)}</ul>
  </section>
}
