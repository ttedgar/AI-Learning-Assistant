const STATUS_CONFIG = {
  PENDING: {
    classes: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    dot: 'bg-yellow-400 dark:bg-yellow-500',
    label: 'Pending',
  },
  IN_PROGRESS: {
    classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    dot: 'bg-blue-500 animate-pulse dark:bg-blue-400',
    label: 'Processing',
  },
  DONE: {
    classes: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    dot: 'bg-green-500 dark:bg-green-400',
    label: 'Done',
  },
  FAILED: {
    classes: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    dot: 'bg-red-500 dark:bg-red-400',
    label: 'Failed',
  },
}

/**
 * Renders a coloured pill badge for a document processing status.
 * Accepts any of: PENDING | IN_PROGRESS | DONE | FAILED.
 * Falls back to a neutral grey badge for unknown values.
 */
export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? {
    classes: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    dot: 'bg-gray-400 dark:bg-gray-500',
    label: status,
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.classes}`}
      data-testid={`status-badge-${status}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}
