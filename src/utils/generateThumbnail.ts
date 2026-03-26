export async function generateDashboardThumbnail(containerEl: HTMLElement): Promise<string> {
  const html2canvas = (await import('html2canvas')).default

  const isDark = document.documentElement.classList.contains('dark')

  // Capture at actual container dimensions for full page width with high quality
  const canvas = await html2canvas(containerEl, {
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    logging: false,
    backgroundColor: isDark ? '#09090b' : '#ffffff',
  })

  // Scale down to thumbnail size while maintaining aspect ratio
  const thumbnailCanvas = document.createElement('canvas')
  const maxWidth = 1200
  const maxHeight = 900
  
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height)
  thumbnailCanvas.width = canvas.width * scale
  thumbnailCanvas.height = canvas.height * scale

  const ctx = thumbnailCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to create canvas context')
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)

  return thumbnailCanvas.toDataURL('image/jpeg', 0.85)
}
