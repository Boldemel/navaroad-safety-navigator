import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type PdfColumn = { header: string; align?: "left" | "right" | "center" };

export type PdfTableSection = {
  title: string;
  columns: PdfColumn[];
  rows: (string | number)[][];
};

export type FleetReportPdfInput = {
  title: string;
  subtitle?: string;
  filtersSummary?: string;
  kpis: { label: string; value: string }[];
  sections: PdfTableSection[];
};

export function downloadFleetReportPdf(filename: string, input: FleetReportPdfInput) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(input.title, margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  if (input.subtitle) { doc.text(input.subtitle, margin, y); y += 12; }
  if (input.filtersSummary) { doc.text(input.filtersSummary, margin, y); y += 12; }
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
  y += 18;
  doc.setTextColor(0);

  // KPI strip
  if (input.kpis.length > 0) {
    const colW = (pageWidth - margin * 2) / input.kpis.length;
    const boxH = 38;
    input.kpis.forEach((k, i) => {
      const x = margin + i * colW;
      doc.setDrawColor(220);
      doc.setLineWidth(0.5);
      doc.rect(x, y, colW - 6, boxH);
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(k.label.toUpperCase(), x + 6, y + 12);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0);
      doc.text(k.value, x + 6, y + 28);
      doc.setFont("helvetica", "normal");
    });
    y += boxH + 14;
  }

  for (const section of input.sections) {
    if (y > 480) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(section.title, margin, y);
    y += 6;

    autoTable(doc, {
      startY: y + 4,
      head: [section.columns.map((c) => c.header)],
      body: section.rows.map((r) => r.map((c) => (c == null ? "" : String(c)))),
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: Object.fromEntries(
        section.columns.map((c, i) => [i, { halign: c.align ?? "left" }]),
      ),
      didDrawPage: () => {
        const ph = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(
          `Page ${doc.getCurrentPageInfo().pageNumber}`,
          pageWidth - margin,
          ph - 16,
          { align: "right" },
        );
        doc.setTextColor(0);
      },
    });
    // @ts-expect-error autotable extends doc with lastAutoTable
    y = (doc.lastAutoTable?.finalY ?? y) + 24;
  }

  doc.save(filename);
}
