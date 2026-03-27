import { useState } from 'react'
import { Link } from 'react-router-dom'

const BADGES = [
  'Single Writer',
  'Dead Letter Queue',
  'Rate Limited',
  'Map-Reduce AI',
  'RFC 7807 Errors',
  'Testcontainers',
]

const ARCHITECTURE_HIGHLIGHTS = [
  'Backend\u2192Worker via RabbitMQ \u2014 worker never writes to DB (single writer principle)',
  'Failed messages retry 3\u00d7 then route to a dead letter queue',
  'Redis-backed rate limiting with Bucket4j (10 uploads/hr per user)',
  'Long documents: chunk + map-reduce summarization via LangChain',
  'correlationId tracing propagated across async queue boundaries',
  'Worker depends on AI-service interface, not the LLM provider directly (proven by Gemini \u2192 OpenRouter migration)',
  'Liquibase migrations, structured JSON logging, OpenAPI docs',
]

/**
 * Shared footer used across all pages.
 * Draws attention to the project's architecture without being gaudy.
 */
export default function Footer() {
  const [open, setOpen] = useState(false)

  return (
    <footer className="mt-auto border-t border-gray-100 dark:border-gray-800 text-center text-xs pb-6">
      <div className="max-w-4xl mx-auto px-6 pt-8 space-y-5">
        {/* Architecture badge pills */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {BADGES.map((badge) => (
            <span
              key={badge}
              className="inline-block rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400"
            >
              {badge}
            </span>
          ))}
        </div>

        {/* Expandable "Under the Hood" panel */}
        <div>
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
            Under the Hood
          </button>

          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              open ? 'max-h-96 opacity-100 mt-3' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="rounded-lg bg-gray-50 dark:bg-gray-900 px-5 py-4 text-left text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
              <ul className="space-y-1.5 list-none">
                {ARCHITECTURE_HIGHLIGHTS.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-gray-300 dark:text-gray-600 select-none">&bull;</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Navigation row with GitHub CTA */}
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-gray-400 dark:text-gray-600">
          <a
            href="https://github.com/ttedgar/AI-Learning-Assistant"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.338c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
              />
            </svg>
            View Source
          </a>
          <span className="hidden sm:inline">&middot;</span>
          <Link to="/how-to-use" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
            How to Use
          </Link>
          <span>&middot;</span>
          <Link to="/technical" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
            Technical Information
          </Link>
          <span>&middot;</span>
          <Link to="/architecture" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
            Architecture
          </Link>
          <span>&middot;</span>
          <Link to="/load-test" className="hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
            Load Test Results
          </Link>
        </nav>

        {/* Tagline */}
        <p className="text-gray-400 dark:text-gray-600">
          Built with React, Spring Boot, RabbitMQ, Redis &amp; AI
        </p>
      </div>
    </footer>
  )
}
