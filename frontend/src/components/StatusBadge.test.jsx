import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from './StatusBadge'

const STATUSES = ['PENDING', 'PROCESSING', 'DONE', 'FAILED']

describe('StatusBadge', () => {
  it.each(STATUSES)('renders a badge for status %s', (status) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByTestId(`status-badge-${status}`)).toBeInTheDocument()
  })

  it('displays the human-readable label for PENDING', () => {
    render(<StatusBadge status="PENDING" />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('displays the human-readable label for PROCESSING', () => {
    render(<StatusBadge status="PROCESSING" />)
    expect(screen.getByText('Processing')).toBeInTheDocument()
  })

  it('displays the human-readable label for DONE', () => {
    render(<StatusBadge status="DONE" />)
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('displays the human-readable label for FAILED', () => {
    render(<StatusBadge status="FAILED" />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('renders a neutral badge for an unknown status', () => {
    render(<StatusBadge status="UNKNOWN" />)
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
  })
})
