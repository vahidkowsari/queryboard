export function formatDate(date: Date, includeTime = false): string {
  const options: Intl.DateTimeFormatOptions = includeTime
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  return new Date(date).toLocaleDateString(undefined, options)
}
