import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuizOpenEnded from './QuizOpenEnded'

const QUESTION = {
  question: 'What does REST stand for?',
  type: 'OPEN_ENDED',
  correctAnswer: 'Representational State Transfer',
  options: [],
}

describe('QuizOpenEnded', () => {
  it('renders the question and text input', () => {
    render(<QuizOpenEnded question={QUESTION} questionNumber={2} onAnswer={() => {}} />)
    expect(screen.getByText('What does REST stand for?')).toBeInTheDocument()
    expect(screen.getByTestId('open-ended-input')).toBeInTheDocument()
  })

  it('reveals the correct answer after submitting', async () => {
    const user = userEvent.setup()
    render(<QuizOpenEnded question={QUESTION} questionNumber={2} onAnswer={() => {}} />)
    await user.type(screen.getByTestId('open-ended-input'), 'my answer')
    await user.click(screen.getByTestId('open-ended-submit'))
    expect(screen.getByText(/Representational State Transfer/)).toBeInTheDocument()
  })

  it('calls onAnswer after submitting', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    render(<QuizOpenEnded question={QUESTION} questionNumber={2} onAnswer={onAnswer} />)
    await user.type(screen.getByTestId('open-ended-input'), 'my answer')
    await user.click(screen.getByTestId('open-ended-submit'))
    expect(onAnswer).toHaveBeenCalledOnce()
  })

  it('does not submit on empty input', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    render(<QuizOpenEnded question={QUESTION} questionNumber={2} onAnswer={onAnswer} />)
    await user.click(screen.getByTestId('open-ended-submit'))
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByTestId('open-ended-input')).toBeInTheDocument()
  })

  it('hides the input after submission', async () => {
    const user = userEvent.setup()
    render(<QuizOpenEnded question={QUESTION} questionNumber={2} onAnswer={() => {}} />)
    await user.type(screen.getByTestId('open-ended-input'), 'my answer')
    await user.click(screen.getByTestId('open-ended-submit'))
    expect(screen.queryByTestId('open-ended-input')).not.toBeInTheDocument()
  })

  it('shows the user\'s submitted answer', async () => {
    const user = userEvent.setup()
    render(<QuizOpenEnded question={QUESTION} questionNumber={2} onAnswer={() => {}} />)
    await user.type(screen.getByTestId('open-ended-input'), 'REST stands for Representational State Transfer')
    await user.click(screen.getByTestId('open-ended-submit'))
    expect(
      screen.getByText(/REST stands for Representational State Transfer/),
    ).toBeInTheDocument()
  })
})
