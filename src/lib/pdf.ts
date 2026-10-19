import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export interface PDFInvoiceData {
  businessName: string;
  businessUpi: string;
  customerName: string | null;
  number: number;
  status: string;
  createdAt: string;
  items: { name: string; quantity: number; unit_price: number }[];
  total: number;
  paidAmount: number;
  notes?: string | null;
}

// Fonts that cover Telugu/Hindi item names, loaded once and cached.
const FONT_URLS: { file: string; name: string; style: string }[] = [
  { file: 'NotoSansTelugu-Regular.ttf', name: 'NotoSansTelugu', style: 'normal' },
  { file: 'NotoSansDevanagari-Regular.ttf', name: 'NotoSansDevanagari', style: 'normal' },
];

async function loadIndicFonts(doc: jsPDF): Promise<boolean> {
  try {
    for (const font of FONT_URLS) {
      const res = await fetch(`/fonts/${font.file}`);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      doc.addFileToVFS(font.file, btoa(binary));
      doc.addFont(font.file, font.name, font.style);
    }
    return true;
  } catch {
    return false;
  }
}

function fontSupports(text: string, fontName: string, doc: jsPDF): boolean {
  const telugu = /[\u0C00-\u0C7F]/.test(text);
  const devanagari = /[\u0900-\u097F]/.test(text);
  if (telugu) return fontName === 'NotoSansTelugu';
  if (devanagari) return fontName === 'NotoSansDevanagari';
  return fontName === 'helvetica';
}

export async function downloadInvoicePDF(data: PDFInvoiceData): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const GREEN: [number, number, number] = [11, 107, 79];
  const INK: [number, number, number] = [20, 17, 15];
  const MUTED: [number, number, number] = [107, 100, 92];

  const fontsLoaded = await loadIndicFonts(doc);
  const anyIndic = data.items.some(
    (it) => /[\u0C00-\u0C7F\u0900-\u097F]/.test(it.name)
  );

  if (anyIndic && !fontsLoaded) {
    // Fall back: render the items area as an image so Telugu/Hindi shows up.
    await renderWithImageTable(doc, data, W, M, GREEN, INK, MUTED);
    doc.save(`invoice-${data.number}.pdf`);
    return;
  }

  const balance = Math.max(0, data.total - data.paidAmount);
  const upiId = (data.businessUpi ?? '').trim();
  const upiParams = new URLSearchParams({
    pa: upiId,
    pn: data.businessName,
    cu: 'INR',
    tn: `Invoice INV-${String(data.number).padStart(4, '0')}`,
  });
  if (balance > 0) upiParams.set('am', balance.toFixed(2));
  const upiLink = 'upi://pay?' + upiParams.toString().replace(/\+/g, '%20');

  let qrDataUrl: string | null = null;
  if (balance > 0 && upiId) {
    qrDataUrl = await QRCode.toDataURL(upiLink, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#14110F', light: '#FFFFFF' },
    }).catch(() => null);
  }

  // Header band
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('bolo', M, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Just say it. Get paid.', M, 21);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(data.businessName, W - M, 14, { align: 'right' });
  if (data.businessUpi && data.businessName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  }

  // Invoice heading
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(`Invoice INV-${String(data.number).padStart(4, '0')}`, M, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(
    new Date(data.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    }),
    W - M, 42, { align: 'right' }
  );

  // Billed to
  doc.setTextColor(...INK);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Billed to', M, 52);
  doc.setFont('helvetica', 'normal');
  doc.text(data.customerName ?? 'Customer', M, 58);

  // Items table
  let y = 68;
  doc.setFillColor(237, 232, 224);
  doc.rect(M, y, W - 2 * M, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text('ITEM', M + 2, y + 5.5);
  doc.text('QTY', W - M - 38, y + 5.5, { align: 'right' });
  doc.text('PRICE', W - M - 20, y + 5.5, { align: 'right' });
  doc.text('AMOUNT', W - M - 2, y + 5.5, { align: 'right' });
  y += 8;

  const nf = new Intl.NumberFormat('en-IN');
  doc.setFontSize(10);
  for (const item of data.items) {
    y += 7;
    const hasIndic = /[\u0C00-\u0C7F\u0900-\u097F]/.test(item.name);
    if (hasIndic) {
      const f = /[\u0C00-\u0C7F]/.test(item.name) ? 'NotoSansTelugu' : 'NotoSansDevanagari';
      doc.setFont(f, 'normal');
    } else {
      doc.setFont('helvetica', 'normal');
    }
    doc.setTextColor(...INK);
    doc.text(item.name, M + 2, y, { maxWidth: W - 2 * M - 42 });
    doc.setFont('helvetica', 'normal');
    doc.text(String(item.quantity), W - M - 38, y, { align: 'right' });
    doc.text(`Rs.${nf.format(item.unit_price)}`, W - M - 20, y, { align: 'right' });
    doc.text(`Rs.${nf.format(item.quantity * item.unit_price)}`, W - M - 2, y, { align: 'right' });
  }

  y += 6;
  doc.setDrawColor(237, 232, 224);
  doc.line(M, y, W - M, y);

  // Totals
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('Total', W - M - 40, y);
  doc.text(`Rs.${nf.format(data.total)}`, W - M - 2, y, { align: 'right' });
  y += 6;
  doc.text('Paid', W - M - 40, y);
  doc.text(`Rs.${nf.format(data.paidAmount)}`, W - M - 2, y, { align: 'right' });
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...GREEN);
  doc.text(balance > 0 ? 'Balance due' : 'Fully paid', W - M - 40, y);
  doc.text(`Rs.${nf.format(balance)}`, W - M - 2, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  if (data.notes) {
    y += 10;
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Notes: ${data.notes}`, M, y, { maxWidth: W - 2 * M - 60 });
  }

  // QR box (44mm) or PAID stamp
  const boxSize = 44;
  const boxY = Math.max(y + 10, 240 - boxSize);
  const boxX = W - M - boxSize;
  doc.setDrawColor(237, 232, 224);
  doc.roundedRect(boxX, boxY, boxSize, boxSize, 2, 2);
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', boxX + 3, boxY + 3, boxSize - 6, boxSize - 6);
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text('Scan to pay', boxX, boxY + boxSize + 5);
    doc.setTextColor(...MUTED);
    doc.text(upiId, boxX, boxY + boxSize + 9, { maxWidth: boxSize });
  } else if (balance <= 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...GREEN);
    doc.text('PAID', boxX + boxSize / 2, boxY + boxSize / 2 + 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
  }

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Made with Bolo', M, 285);

  doc.save(`invoice-${data.number}.pdf`);
}

/** Fallback: draw items with jsPDF, then overlay a canvas-rendered table image. */
async function renderWithImageTable(
  doc: jsPDF,
  data: PDFInvoiceData,
  W: number,
  M: number,
  GREEN: [number, number, number],
  INK: [number, number, number],
  MUTED: [number, number, number]
): Promise<void> {
  // Header band
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('bolo', M, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Just say it. Get paid.', M, 21);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(data.businessName, W - M, 14, { align: 'right' });

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(`Invoice INV-${String(data.number).padStart(4, '0')}`, M, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(
    new Date(data.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    }),
    W - M, 42, { align: 'right' }
  );

  doc.setTextColor(...INK);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Billed to', M, 52);
  doc.setFont('helvetica', 'normal');
  doc.text(data.customerName ?? 'Customer', M, 58);

  // Render items + totals into a canvas so Indic scripts render via the browser.
  const scale = 2;
  const cw = Math.round((W - 2 * M) * 3.7795 * scale);
  const rowH = 30 * scale;
  const ch = Math.round((40 + data.items.length * 30 + 70) * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cw, ch);
  ctx.scale(scale, scale);
  const w = cw / scale;

  ctx.fillStyle = '#EDE8E0';
  ctx.fillRect(0, 0, w, 26);
  ctx.fillStyle = '#14110F';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('ITEM', 8, 17);
  ctx.fillText('QTY', w - 150, 17);
  ctx.fillText('PRICE', w - 100, 17);
  ctx.fillText('AMOUNT', w - 8, 17);

  ctx.font = '12px "Noto Sans Telugu", "Noto Sans Devanagari", sans-serif';
  data.items.forEach((item, i) => {
    const y = 26 + i * 30 + 20;
    ctx.fillText(item.name, 8, y);
    ctx.fillText(String(item.quantity), w - 150, y);
    ctx.fillText(`Rs.${item.unit_price}`, w - 100, y);
    ctx.fillText(`Rs.${item.quantity * item.unit_price}`, w - 8, y);
  });

  const totalsY = 26 + data.items.length * 30 + 30;
  ctx.font = '12px sans-serif';
  ctx.fillText('Total', w - 150, totalsY);
  ctx.fillText(`Rs.${data.total}`, w - 8, totalsY, { align: 'right' } as never);
  ctx.fillText('Paid', w - 150, totalsY + 20);
  ctx.fillText(`Rs.${data.paidAmount}`, w - 8, totalsY + 20, { align: 'right' } as never);
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#0B6B4F';
  ctx.fillText('Balance due', w - 150, totalsY + 44);
  ctx.fillText(`Rs.${Math.max(0, data.total - data.paidAmount)}`, w - 8, totalsY + 44, { align: 'right' } as never);

  const img = canvas.toDataURL('image/png');
  doc.addImage(img, 'PNG', M, 64, W - 2 * M, ch / scale / 3.7795);

  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Made with Bolo', M, 285);
}
