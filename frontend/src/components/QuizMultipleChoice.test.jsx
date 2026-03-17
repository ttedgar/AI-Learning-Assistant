import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuizMultipleChoice from './QuizMultipleChoice'

const QUESTION = {
  question: 'What is the capital of France?',
  type: 'MULTIPLE_CHOICE',
  correctAnswer: 'Paris',
  options: ['London', 'Berlin', 'Paris', 'Madrid'],
}

describe('QuizMultipleChoice', () => {
  it('renders the question and all options', () => {
    render(<QuizMultipleChoice question={QUESTION} questionNumber={1} onAnswer={() => {}} />)
    expect(screen.getByText('What is the capital of France?')).toBeInTheDocument()
    QUESTION.options.forEach((opt) => {
      expect(screen.getByText(opt)).toBeInTheDocument()
    })
  })

  it('calls onAnswer(true) when selecting the correct answer', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    render(<QuizMultipleChoice question={QUESTION} questionNumber={1} onAnswer={onAnswer} />)
    await user.click(screen.getByText('Paris'))
    expect(onAnswer).toHaveBeenCalledWith(true)
  })

  it('calls onAnswer(false) when selecting a wrong answer', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    render(<QuizMultipleChoice question={QUESTION} questionNumber={1} onAnswer={onAnswer} />)
    await user.click(screen.getByText('London'))
    expect(onAnswer).toHaveBeenCalledWith(false)
  })

  it('shows "Correct!" feedback after selecting the right answer', async () => {
    const user = userEvent.setup()
    render(<QuizMultipleChoice question={QUESTION} questionNumber={1} onAnswer={() => {}} />)
    await user.click(screen.getByText('Paris'))
    expect(screen.getByText(/Correct!/)).toBeInTheDocument()
  })

  it('reveals the correct answer text after a wrong selection', async () => {
    const user = userEvent.setup()
    render(<QuizMultipleChoice question={QUESTION} questionNumber={1} onAnswer={() => {}} />)
    await user.click(screen.getByText('London'))
    expect(screen.getByText(/Correct answer: Paris/)).toBeInTheDocument()
  })

  it('locks the question so onAnswer is only called once', async () => {
    const user = userEvent.setup()
    const onAnswer = vi.fn()
    render(<QuizMultipleChoice question={QUESTION} questionNumber={1} onAnswer={onAnswer} />)
    await user.click(screen.getByText('London'))
    await user.click(screen.getByText('Paris'))
    expect(onAnswer).toHaveBeenCalledTimes(1)
  })

  it('does not show feedback before an option is selected', () => {
    render(<QuizMultipleChoice question={QUESTION} questionNumber={1} onAnswer={() => {}} />)
    expect(screen.queryByTestId('quiz-feedback')).not.toBeInTheDocument()
  })
})
