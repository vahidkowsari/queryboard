export async function generateDashboardThumbnail(containerEl: HTMLElement): Promise<string> {
  const html2canvas = (await import('html2canvas')).default

  // Capture at actual container dimensions for full page width
  const canvas = await html2canvas(containerEl, {
    scale: 0.3,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  })

  // Scale down to thumbnail size while maintaining aspect ratio
  const thumbnailCanvas = document.createElement('canvas')
  const maxWidth = 400
  const maxHeight = 300
  
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height)
  thumbnailCanvas.width = canvas.width * scale
  thumbnailCanvas.height = canvas.height * scale

  const ctx = thumbnailCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to create canvas context')
  }
  ctx.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)

  return thumbnailCanvas.toDataURL('image/jpeg', 0.7)
}
