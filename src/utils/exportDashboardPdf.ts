export async function exportDashboardPdf(containerEl: HTMLElement, dashboardName: string) {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  const canvas = await html2canvas(containerEl, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  })

  const imgData = canvas.toDataURL('image/png')
  const imgWidth = canvas.width
  const imgHeight = canvas.height

  const pdfWidth = 297 // A4 landscape width in mm
  const pdfHeight = 210 // A4 landscape height in mm
  const margin = 10

  const contentWidth = pdfWidth - margin * 2
  const contentHeight = pdfHeight - margin * 2 - 10 // reserve space for title

  const scale = contentWidth / imgWidth
  const scaledHeight = imgHeight * scale

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  // Title
  pdf.setFontSize(16)
  pdf.text(dashboardName, margin, margin + 6)
  pdf.setFontSize(8)
  pdf.setTextColor(128)
  pdf.text(new Date().toLocaleString(), margin, margin + 12)
  pdf.setTextColor(0)

  const startY = margin + 16

  if (scaledHeight <= contentHeight) {
    pdf.addImage(imgData, 'PNG', margin, startY, contentWidth, scaledHeight)
  } else {
    // Multi-page: slice the image across pages
    let yOffset = 0
    let page = 0

    while (yOffset < imgHeight) {
      if (page > 0) {
        pdf.addPage()
      }

      const pageStartY = page === 0 ? startY : margin
      const availableHeight = page === 0 ? contentHeight : pdfHeight - margin * 2
      const sliceHeight = availableHeight / scale

      // Create a slice canvas
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = imgWidth
      sliceCanvas.height = Math.min(sliceHeight, imgHeight - yOffset)
      const ctx = sliceCanvas.getContext('2d')!
      ctx.drawImage(canvas, 0, yOffset, imgWidth, sliceCanvas.height, 0, 0, imgWidth, sliceCanvas.height)

      const sliceData = sliceCanvas.toDataURL('image/png')
      const sliceScaledHeight = sliceCanvas.height * scale
      pdf.addImage(sliceData, 'PNG', margin, pageStartY, contentWidth, sliceScaledHeight)

      yOffset += sliceCanvas.height
      page++
    }
  }

  const safeName = dashboardName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50)
  pdf.save(`${safeName}.pdf`)
}
