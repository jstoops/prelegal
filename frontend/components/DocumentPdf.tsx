/**
 * PDF version of a document. Mirrors DocumentPreview using the same derived
 * Cover Page content; loaded on demand when the user downloads.
 */
import { Document, Font, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CreatorDocument } from "@/lib/catalog";
import {
  coverPageSections,
  partyHeadings,
  partyRows,
  STANDARD_TERMS_TITLE,
  type DocumentData,
} from "@/lib/document";
import type { Clause, Inline } from "@/lib/template";

// Never hyphenate words across lines; it reads poorly in legal text.
Font.registerHyphenationCallback((word) => [word]);

const BORDER = "#cbd5e1";
const MUTED = "#64748b";

const styles = StyleSheet.create({
  page: {
    paddingVertical: 48,
    paddingHorizontal: 60,
    fontFamily: "Times-Roman",
    fontSize: 10,
    lineHeight: 1.4,
    color: "#0f172a",
  },
  title: {
    fontFamily: "Times-Bold",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
  },
  heading: { fontFamily: "Times-Bold", fontSize: 11.5, marginTop: 8 },
  label: { fontFamily: "Times-Italic", fontSize: 9, color: MUTED },
  paragraph: { marginTop: 3 },
  bold: { fontFamily: "Times-Bold" },
  term: { fontFamily: "Times-Bold", color: "#3730a3" },
  // Overrides react-pdf's default blue link color.
  link: { color: "#0f172a" },
  option: { flexDirection: "row", marginTop: 3 },
  optionText: { flex: 1 },
  checkbox: {
    width: 9,
    height: 9,
    borderWidth: 0.8,
    borderColor: "#0f172a",
    marginTop: 2.5,
    marginRight: 6,
    fontSize: 7,
    lineHeight: 1,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
  },
  unchecked: { color: "#94a3b8" },
  table: { marginTop: 10, borderTopWidth: 0.8, borderLeftWidth: 0.8, borderColor: BORDER },
  row: { flexDirection: "row" },
  cell: {
    flex: 1,
    minHeight: 22,
    padding: 4,
    borderRightWidth: 0.8,
    borderBottomWidth: 0.8,
    borderColor: BORDER,
    textAlign: "center",
  },
  signatureCell: { minHeight: 44 },
  labelCell: { flex: 0.7, textAlign: "left", fontFamily: "Times-Bold" },
  signingStatement: { marginTop: 12 },
  small: { fontSize: 8.5, color: MUTED, marginTop: 10 },
  termsTitle: { fontFamily: "Times-Bold", fontSize: 15, textAlign: "center", marginBottom: 10 },
  clause: { marginTop: 7, textAlign: "justify" },
  subClause: { marginTop: 4, marginLeft: 14, textAlign: "justify" },
});

function PdfInline({ content }: { content: Inline[] }) {
  return content.map((part, i) => {
    const bold = part.bold ? styles.bold : {};
    switch (part.kind) {
      case "term":
        return <Text key={i} style={styles.term}>{part.text}</Text>;
      case "link":
        return <Link key={i} src={part.href} style={[styles.link, bold]}>{part.text}</Link>;
      default:
        return part.bold ? <Text key={i} style={bold}>{part.text}</Text> : part.text;
    }
  });
}

function PdfClauses({ clauses, depth = 0 }: { clauses: Clause[]; depth?: number }) {
  return clauses.map((clause) => (
    <View key={clause.label} style={depth === 0 ? styles.clause : styles.subClause}>
      <Text>
        {clause.label} {clause.heading && <Text style={styles.bold}>{clause.heading} </Text>}
        <PdfInline content={clause.body} />
      </Text>
      {clause.children.length > 0 && <PdfClauses clauses={clause.children} depth={depth + 1} />}
    </View>
  ));
}

interface DocumentPdfProps {
  document: CreatorDocument;
  /** The document's data, with blank dates already shown as today. */
  data: DocumentData;
}

export default function DocumentPdf({ document, data }: DocumentPdfProps) {
  const { definition, terms } = document;
  return (
    <Document title={definition.name} creator="Prelegal">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{definition.name}</Text>
        <Text>
          <PdfInline content={document.intro} />
        </Text>

        {/* Sections may break across pages (long user text must never be
            clipped); minPresenceAhead keeps headings off the page bottom. */}
        {coverPageSections(definition, data).map((section) => (
          <View key={section.heading}>
            <Text style={styles.heading} minPresenceAhead={40}>
              {section.heading}
            </Text>
            {section.label && <Text style={styles.label}>{section.label}</Text>}
            {section.lines?.map((line, i) => (
              <Text key={i} style={styles.paragraph}>{line}</Text>
            ))}
            {section.options?.map((option) => (
              <View key={option.text} style={styles.option} wrap={false}>
                <Text style={styles.checkbox}>{option.checked ? "X" : ""}</Text>
                <Text
                  style={option.checked ? styles.optionText : [styles.optionText, styles.unchecked]}
                >
                  {option.text}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View wrap={false}>
          <Text style={styles.signingStatement}>{definition.signingStatement}</Text>
          <View style={styles.table}>
            <View style={styles.row}>
              <Text style={[styles.cell, styles.labelCell]} />
              {partyHeadings(definition).map((heading) => (
                <Text key={heading} style={[styles.cell, styles.bold]}>
                  {heading}
                </Text>
              ))}
            </View>
            {partyRows(data).map((row) => (
              <View key={row.label} style={styles.row}>
                <View style={[styles.cell, styles.labelCell]}>
                  <Text>{row.label}</Text>
                  {row.hint && <Text style={styles.label}>{row.hint}</Text>}
                </View>
                {row.values.map((value, i) => (
                  <Text
                    key={i}
                    style={row.signature ? [styles.cell, styles.signatureCell] : styles.cell}
                  >
                    {value}
                  </Text>
                ))}
              </View>
            ))}
          </View>
          <Text style={styles.small}>
            <PdfInline content={document.attribution} />
          </Text>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.termsTitle}>{STANDARD_TERMS_TITLE}</Text>
        <PdfClauses clauses={terms.clauses} />
        {terms.attribution && (
          <Text style={styles.small}>
            <PdfInline content={terms.attribution} />
          </Text>
        )}
      </Page>
    </Document>
  );
}
