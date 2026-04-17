import { jest } from '@jest/globals'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { AppFooter } from '@/components/AppFooter'

describe('AppFooter', () => {
  it('renders the app name', () => {
    render(<AppFooter />)
    expect(screen.getByText('Collage Maker')).toBeInTheDocument()
  })

  it('renders the About button', () => {
    render(<AppFooter />)
    expect(screen.getByRole('button', { name: /about/i })).toBeInTheDocument()
  })

  it('renders the GitHub link', () => {
    render(<AppFooter />)
    expect(screen.getByLabelText(/view source on github/i)).toBeInTheDocument()
  })

  it('opens the About dialog when clicked', async () => {
    const user = userEvent.setup()
    render(<AppFooter />)

    await user.click(screen.getByRole('button', { name: /about/i }))
    expect(screen.getByText('About Collage Maker')).toBeInTheDocument()
    expect(screen.getByText(/privacy-first/i)).toBeInTheDocument()
    expect(screen.getByText(/never leave your device/i)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<AppFooter />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
