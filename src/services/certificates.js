import { apiFetch } from './api'
import html2pdf from 'html2pdf.js'

const certificateTemplateUrl = new URL('../../Certificate.png', import.meta.url).href

export async function issueCertificateForPath(pathId) {
  return apiFetch('/certificates/issue', {
    method: 'POST',
    body: JSON.stringify({ pathId }),
  })
}

export async function verifyCertificate(certificateId) {
  return apiFetch(`/certificates/${encodeURIComponent(certificateId)}/verify`)
}

export function buildCertificateHtml(certificate, pathTitle, artworkData) {
  const fullName = String(certificate?.fullName || 'Learner').trim()
  const resolvedPathTitle = String(
    pathTitle || certificate?.pathTitle || 'Learning Path'
  ).trim()

  const certificateId = String(
    certificate?.certificateId || 'CERT-000000'
  ).trim()

  // Always generate a verification URL that points to the current frontend origin.
  // This prevents links from pointing to the backend (which can cause login redirects).
  const verificationUrl = `${window.location.origin}/verify-certificate/${encodeURIComponent(certificateId)}`
  const certificateImage = artworkData || certificateTemplateUrl

  // ===== NEW DATE LOGIC =====
  // Uses the issue date if available, otherwise falls back to the current date
  const dateObj = certificate?.issuedAt ? new Date(certificate.issuedAt) : new Date()
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Certificate - ${fullName}</title>
  </head>

  <body>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        background: #000;
      }

      .certificate-shell {
        position: relative;
        width: 1600px;
        height: 1130px; 
        overflow: hidden;
        font-family: Arial, sans-serif;
        background: #041019;
      }

      .certificate-image {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        z-index: 1;
      }

      .overlay {
        position: absolute;
        inset: 0;
        z-index: 2;
      }

      /* ===== DYNAMIC TEXT ALIGNMENT ===== */

      .name-field {
        position: absolute;
        top: 45%; 
        left: 0;
        width: 100%;
        text-align: center;
        font-size: 52px; 
        font-weight: 900;
        letter-spacing: 0.12em;
        text-transform:;
        color: #10d66a;
        z-index: 3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .course-field {
        position: absolute;
        top: 56%; 
        left: 0;
        width: 100%;
        line-height: 3.5;
        padding-bottom: 10px;
        text-align: center;
        font-size: 28px; 
        font-weight: 700;
        color: #18d66d;
        z-index: 3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .certificate-id-field {
        position: absolute;
        left: 16.5%; 
        bottom: 17.5%; 
        font-size: 17px; 
        color: #e2e2e2;
        z-index: 3;
        white-space: nowrap;
      }

      .verification-field {
        position: absolute;
        left: 17.5%; 
        bottom: 12%; 
        max-width: 70%;
        font-size: 16px;
        color: #e2e2e2;
        z-index: 3;
        line-height: 3.5;
        padding-bottom: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .verification-field a {
        color: #11d96a;
        text-decoration: none;
      }

      /* ===== NEW DATE ALIGNMENT ===== */
      .date-field {
        position: absolute;
        left: 15%; /* NUDGE THIS to align horizontally with your DATE line */
        bottom: 10.4%; /* NUDGE THIS to align vertically above your DATE line */
        font-size: 21px;
        color: #e2e2e2;
        z-index: 3;
        white-space: nowrap;
      }
    </style>

    <div class="certificate-shell" id="certificate-container">

      <img
        class="certificate-image"
        src="${certificateImage}"
        alt="Certificate"
      />

      <div class="overlay">

        <div class="name-field">
          ${fullName}
        </div>

        <div class="course-field">
          ${resolvedPathTitle}
        </div>

        <div class="certificate-id-field">
          ${certificateId}
        </div>

        <div class="verification-field">
          <a href="${verificationUrl}">
            ${verificationUrl}
          </a>
        </div>

        <!-- NEW DATE FIELD ADDED HERE -->
        <div class="date-field">
          ${formattedDate}
        </div>

      </div>
    </div>
  </body>
  </html>
  `
}

export async function downloadCertificateAsPDF(
  certificate,
  pathTitle,
  artworkData
) {
  const htmlContent = buildCertificateHtml(
    certificate,
    pathTitle,
    artworkData
  )

  const container = document.createElement('div')
  container.innerHTML = htmlContent

  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '0'
  container.style.zIndex = '-9999'
  document.body.appendChild(container)

  const pdfOptions = {
    margin: 0,
    filename: `Certificate_${certificate?.fullName || 'Learner'}.pdf`,
    image: { type: 'jpeg', quality: 1.0 },
    html2canvas: { 
      scale: 2, 
      useCORS: true, 
      letterRendering: true,
      backgroundColor: '#041019',
      width: 1600,         
      height: 1130,        
      windowWidth: 1600,   
      windowHeight: 1130   
    },
    jsPDF: { 
      unit: 'px', 
      format: [1600, 1130], 
      orientation: 'landscape' 
    }
  }

  const elementToPrint = container.querySelector('.certificate-shell')
  
  html2pdf().set(pdfOptions).from(elementToPrint).save().then(() => {
    document.body.removeChild(container)
  })
}