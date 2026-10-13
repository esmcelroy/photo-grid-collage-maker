import { describe, it, expect } from '@jest/globals'
import { useState } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { ProjectLibrary } from '@/components/ProjectLibrary'

function Library({ saveDelay }: { saveDelay?: Promise<void> }) {
  const [projects, setProjects] = useState([{ id: 'one', name: 'Original', updatedAt: '2026-01-01', photoCount: 0 }])
  const [activeId, setActiveId] = useState('one')
  return <ProjectLibrary projects={projects} activeId={activeId}
    onOpen={setActiveId}
    onCreate={async name => { await saveDelay; setProjects(previous => [...previous, { id: 'two', name, updatedAt: '2026-01-02', photoCount: 0 }]); setActiveId('two') }}
    onRename={async (id, name) => setProjects(previous => previous.map(project => project.id === id ? { ...project, name } : project))}
    onDuplicate={async () => { throw new Error('Storage is full; existing projects were kept.') }}
    onDelete={async id => setProjects(previous => previous.filter(project => project.id !== id))}
    onExport={async () => ({})} onImport={async () => {}} />
}

describe('ProjectLibrary', () => {
  it('creates a named project through an accessible form; cancellation changes nothing', async () => {
    const user = userEvent.setup()
    render(<Library />)
    const trigger = screen.getByRole('button', { name: 'New project' })
    await user.click(trigger)
    expect(await screen.findByLabelText('Project name')).toHaveFocus()
    await user.type(screen.getByLabelText('Project name'), 'Cancelled')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    await user.click(trigger)
    await user.clear(screen.getByLabelText('Project name'))
    await user.type(screen.getByLabelText('Project name'), 'Trip')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText(/Editing: Trip/)).toBeVisible()
  })

  it('explains failed project actions and requires explicit deletion confirmation', async () => {
    const user = userEvent.setup()
    render(<Library />)
    await user.click(screen.getByRole('button', { name: 'Manage projects' }))
    await user.click(await screen.findByRole('button', { name: 'Duplicate Original' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is full')
    await user.click(screen.getByRole('button', { name: 'Delete Original' }))
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete project?')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Manage projects' }))
    expect(await screen.findByRole('button', { name: 'Open Original' })).toBeVisible()
  })

  it('prevents repeated submission and dismissal while a project is saving', async () => {
    let finish!: () => void
    const saveDelay = new Promise<void>(resolve => { finish = resolve })
    const user = userEvent.setup()
    render(<Library saveDelay={saveDelay} />)
    await user.click(screen.getByRole('button', { name: 'New project' }))
    await user.clear(screen.getByLabelText('Project name'))
    await user.type(screen.getByLabelText('Project name'), 'Trip')
    await user.dblClick(screen.getByRole('button', { name: 'Create project' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeVisible()
    await act(async () => { finish(); await saveDelay })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Manage projects' }))
    expect(screen.getAllByRole('button', { name: 'Open Trip' })).toHaveLength(1)
  })

  it('renames saved work and removes it only after confirming deletion', async () => {
    const user = userEvent.setup()
    render(<Library />)
    await user.click(screen.getByRole('button', { name: 'Manage projects' }))
    await user.click(screen.getByRole('button', { name: 'Rename Original' }))
    await user.clear(screen.getByLabelText('Project name'))
    await user.type(screen.getByLabelText('Project name'), 'Renamed{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Editing: Renamed')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Manage projects' }))
    await user.click(screen.getByRole('button', { name: 'Delete Renamed' }))
    expect(await axe(document.body)).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: 'Delete project' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Manage projects' }))
    expect(screen.queryByRole('button', { name: 'Open Renamed' })).not.toBeInTheDocument()
  })

  it('rejects oversized files before parsing them and keeps the active project', async () => {
    const user = userEvent.setup()
    render(<Library />)
    const file = new File(['broken JSON'], 'backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 })
    Object.defineProperty(file, 'text', { value: async () => 'broken JSON' })
    await user.upload(screen.getByLabelText('Restore backup file'), file)
    expect(await screen.findByRole('alert')).toHaveTextContent('Backup file is too large')
    expect(screen.getByText('Editing: Original')).toBeVisible()
    expect(screen.getByLabelText('Restore backup file')).toHaveValue('')
  })

  it('has no accessibility violations in the library and naming form', async () => {
    const user = userEvent.setup()
    const { baseElement } = render(<Library />)
    expect(await axe(baseElement)).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: 'Manage projects' }))
    await screen.findByRole('dialog')
    expect(await axe(baseElement)).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: 'New project' }))
    await screen.findByLabelText('Project name')
    expect(await axe(baseElement)).toHaveNoViolations()
  })
})
