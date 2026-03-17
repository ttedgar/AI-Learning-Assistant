import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScoreSummary from './ScoreSummary'

describe('ScoreSummary', () => {
  it('displays the correct score and total', () => {
    render(<ScoreSummary score={7} total={10} onRestart={() => {}} />)
    expect(screen.getByTestId('score-detail')).toHaveTextContent('7')
    expect(screen.getByTestId('score-detail')).toHaveTextContent('10')
  })

  it('calculates and displays the correct percentage', () => {
    render(<ScoreSummary score={8} total={10} onRestart={() => {}} />)
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('80%')
  })

  it('displays 0% for a zero score', () => {
    render(<ScoreSummary score={0} total={5} onRestart={() => {}} />)
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('0%')
  })

  it('displays 100% for a perfect score', () => {
    render(<ScoreSummary score={5} total={5} onRestart={() => {}} />)
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('100%')
  })

  it('rounds fractional percentages', () => {
    render(<ScoreSummary score={1} total={3} onRestart={() => {}} />)
    // 1/3 = 33.33... → rounds to 33%
    expect(screen.getByTestId('score-percentage')).toHaveTextContent('33%')
  })

  it('calls onRestart when "Try again" is clicked', async () => {
    const user = userEvent.setup()
    const onRestart = vi.fn()
    render(<ScoreSummary score={3} total={5} onRestart={onRestart} />)
    await user.click(screen.getByTestId('restart-quiz-button'))
    expect(onRestart).toHaveBeenCalledOnce()
  })

  it('renders the score summary container', () => {
    render(<ScoreSummary score={4} total={10} onRestart={() => {}} />)
    expect(screen.getByTestId('score-summary')).toBeInTheDocument()
  })
})
