const STATUS_CONFIG = {
  PENDING: {
    classes: 'bg-yellow-100 text-yellow-800',
    dot: 'bg-yellow-400',
    label: 'Pending',
  },
  PROCESSING: {
    classes: 'bg-blue-100 text-blue-800',
    dot: 'bg-blue-500 animate-pulse',
    label: 'Processing',
  },
  DONE: {
    classes: 'bg-green-100 text-green-800',
    dot: 'bg-green-500',
    label: 'Done',
  },
  FAILED: {
    classes: 'bg-red-100 text-red-800',
    dot: 'bg-red-500',
    label: 'Failed',
  },
}

/**
 * Renders a coloured pill badge for a document processing status.
 * Accepts any of: PENDING | PROCESSING | DONE | FAILED.
 * Falls back to a neutral grey badge for unknown values.
 */
export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? {
    classes: 'bg-gray-100 text-gray-700',
    dot: 'bg-gray-400',
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
