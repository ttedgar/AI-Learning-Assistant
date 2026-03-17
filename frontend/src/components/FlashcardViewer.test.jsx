import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FlashcardViewer from './FlashcardViewer'

const FLASHCARDS = [
  { question: 'What is React?', answer: 'A JavaScript library for building UIs.' },
  { question: 'What is Vite?', answer: 'A fast frontend build tool.' },
  { question: 'What is Zustand?', answer: 'A small state management library.' },
]

describe('FlashcardViewer', () => {
  it('shows the first question on mount', () => {
    render(<FlashcardViewer flashcards={FLASHCARDS} />)
    expect(screen.getByTestId('flashcard')).toHaveAttribute('aria-label', 'What is React?')
  })

  it('shows progress counter', () => {
    render(<FlashcardViewer flashcards={FLASHCARDS} />)
    expect(screen.getByTestId('flashcard-progress')).toHaveTextContent('1 / 3')
  })

  it('flips to show the answer when clicked', async () => {
    const user = userEvent.setup()
    render(<FlashcardViewer flashcards={FLASHCARDS} />)
    await user.click(screen.getByTestId('flashcard'))
    expect(screen.getByTestId('flashcard')).toHaveAttribute(
      'aria-label',
      'A JavaScript library for building UIs.',
    )
  })

  it('flips back to the question when clicked again', async () => {
    const user = userEvent.setup()
    render(<FlashcardViewer flashcards={FLASHCARDS} />)
    await user.click(screen.getByTestId('flashcard'))
    await user.click(screen.getByTestId('flashcard'))
    expect(screen.getByTestId('flashcard')).toHaveAttribute('aria-label', 'What is React?')
  })

  it('navigates to the next card and updates progress', async () => {
    const user = userEvent.setup()
    render(<FlashcardViewer flashcards={FLASHCARDS} />)
    await user.click(screen.getByTestId('flashcard-next'))
    expect(screen.getByTestId('flashcard')).toHaveAttribute('aria-label', 'What is Vite?')
    expect(screen.getByTestId('flashcard-progress')).toHaveTextContent('2 / 3')
  })

  it('navigates to the previous card', async () => {
    const user = userEvent.setup()
    render(<FlashcardViewer flashcards={FLASHCARDS} />)
    await user.click(screen.getByTestId('flashcard-next'))
    await user.click(screen.getByTestId('flashcard-prev'))
    expect(screen.getByTestId('flashcard')).toHaveAttribute('aria-label', 'What is React?')
    expect(screen.getByTestId('flashcard-progress')).toHaveTextContent('1 / 3')
  })

  it('disables prev button on first card', () => {
    render(<FlashcardViewer flashcards={FLASHCARDS} />)
    expect(screen.getByTestId('flashcard-prev')).toBeDisabled()
  })

  it('disables next button on last card', async () => {
    const user = userEvent.setup()
    render(<FlashcardViewer flashcards={FLASHCARDS} />)
    await user.click(screen.getByTestId('flashcard-next'))
    await user.click(screen.getByTestId('flashcard-next'))
    expect(screen.getByTestId('flashcard-next')).toBeDisabled()
  })

  it('resets flip state when navigating to next card', async () => {
    const user = userEvent.setup()
    render(<FlashcardViewer flashcards={FLASHCARDS} />)
    // flip card to see answer
    await user.click(screen.getByTestId('flashcard'))
    expect(screen.getByTestId('flashcard')).toHaveAttribute(
      'aria-label',
      'A JavaScript library for building UIs.',
    )
    // navigate to next card — should show question, not answer
    await user.click(screen.getByTestId('flashcard-next'))
    expect(screen.getByTestId('flashcard')).toHaveAttribute('aria-label', 'What is Vite?')
  })
})
