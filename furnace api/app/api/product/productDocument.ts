import pdfmake from 'pdfmake';
import type { Content } from 'pdfmake';
import roboto from 'pdfmake/fonts/Roboto';
import type { ProductDocumentPicture, ProductRecord } from '../../interface/product';

const bundledFonts = new Set(Object.values(roboto.Roboto));
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(filename => bundledFonts.has(filename));
pdfmake.addFonts(roboto);

const submittedDate = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Australia/Melbourne',
});

// Builds the PDF included alongside the original pictures in the product ZIP.
export function buildProductDocument(product: ProductRecord, pictures: ProductDocumentPicture[]) {
  const submittedAt = new Date(product.submittedAt);
  const amountFormat = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const values = [
    ['Manufacturing cost', product.manufacturingCostCents],
    ['Packaging cost', product.packagingCostCents],
    ['Shipping cost', product.shippingCostCents],
    ['Sale value', product.saleValueCents],
  ] as const;
  const content: Content[] = [
    { text: 'Product record', style: 'title' },
    { text: product.name, style: 'heading' },
    `Product ID ${product.id}`,
    `Added ${submittedDate.format(submittedAt)} Melbourne time`,
    `Initial stock ${(product.initialStock ?? product.stock).toLocaleString('en-AU')}`,
    `Current stock ${product.stock.toLocaleString('en-AU')}`,
    ...values.flatMap(([label, cents]) => cents == null ? [] : [`${label} A$${amountFormat.format(cents / 100)} per unit`]),
    { text: 'Description', style: 'subheading' },
    product.description || 'No description recorded.',
    { text: 'Product note', style: 'subheading' },
    product.note || 'No note recorded.',
    { text: 'Pictures', style: 'heading' },
    ...pictures.flatMap((picture, index): Content[] => [
      { text: `${index + 1} ${picture.main ? 'Main picture' : 'Gallery picture'}`, style: 'subheading' },
      picture.name,
      ...(picture.title ? [picture.title] : []),
      ...(picture.note ? [picture.note] : []),
    ]),
  ];

  return pdfmake.createPdf({
    pageSize: 'A4',
    pageMargins: [64, 64, 64, 64],
    // Use a saved date so the size check and download produce the same PDF.
    info: { title: 'Product record', creationDate: submittedAt },
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.2, margin: [0, 0, 0, 5] },
    styles: {
      title: { fontSize: 24, bold: true, margin: [0, 0, 0, 18] },
      heading: { fontSize: 17, bold: true, margin: [0, 12, 0, 6] },
      subheading: { fontSize: 12, bold: true, margin: [0, 9, 0, 3] },
    },
    content,
  }).getBuffer();
}
