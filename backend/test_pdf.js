import pdfmake from 'pdfmake'
const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
}
async function run() {
  try {
    pdfmake.setFonts(fonts)
    const pdfDoc = pdfmake.createPdf({ content: 'Hello' })
    const stream = await pdfDoc.getStream()
    console.log("pdfDoc has end:", typeof pdfDoc.end)
    console.log("stream has end:", typeof stream.end)
  } catch (e) {
    console.error("Error:", e)
  }
}
run()
