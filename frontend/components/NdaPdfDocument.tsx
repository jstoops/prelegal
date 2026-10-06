/**
 * PDF version of the Mutual NDA. Mirrors NdaPreview using the same derived
 * cover-page content; loaded on demand when the user downloads.
 */
import {
  Document,
  Font,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { coverPageSections, partyRows, type NdaData } from "@/lib/nda";
import type { Inline, NdaTemplate } from "@/lib/nda-template";

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
  link: { color: "#0f172a" },
  option: { flexDirection: "row", marginTop: 3 },
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
  labelCell: { flex: 0.7, textAlign: "left", fontFamily: "Times-Bold" },
  small: { fontSize: 8.5, color: MUTED, marginTop: 10 },
  termsTitle: { fontFamily: "Times-Bold", fontSize: 15, textAlign: "center", marginBottom: 10 },
  termSection: { marginTop: 7, textAlign: "justify" },
});

function PdfInline({ content }: { content: Inline[] }) {
  return content.map((part, i) => {
    switch (part.kind) {
      case "bold":
        return <Text key={i} style={styles.bold}>{part.text}</Text>;
      case "term":
        return <Text key={i} style={styles.term}>{part.text}</Text>;
      case "link":
        return <Link key={i} src={part.href} style={styles.link}>{part.text}</Link>;
      default:
        return part.text;
    }
  });
}

interface NdaPdfDocumentProps {
  data: NdaData;
  template: NdaTemplate;
}

export function NdaPdfDocument({ data, template }: NdaPdfDocumentProps) {
  return (
    <Document title="Mutual Non-Disclosure Agreement" creator="Prelegal">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Mutual Non-Disclosure Agreement</Text>
        <Text>
          <PdfInline content={template.coverIntro} />
        </Text>

        {coverPageSections(data).map((section) => (
          <View key={section.heading} wrap={false}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.label && <Text style={styles.label}>{section.label}</Text>}
            {section.lines?.map((line) => (
              <Text key={line} style={styles.paragraph}>{line}</Text>
            ))}
            {section.options?.map((option) => (
              <View key={option.text} style={styles.option}>
                <Text style={styles.checkbox}>{option.checked ? "X" : ""}</Text>
                <Text style={[{ flex: 1 }, option.checked ? {} : styles.unchecked]}>
                  {option.text}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <View wrap={false}>
          <Text style={{ marginTop: 12 }}>
            By signing this Cover Page, each party agrees to enter into this MNDA
            as of the Effective Date.
          </Text>
          <View style={styles.table}>
            <View style={styles.row}>
              <Text style={[styles.cell, styles.labelCell]} />
              <Text style={[styles.cell, styles.bold]}>PARTY 1</Text>
              <Text style={[styles.cell, styles.bold]}>PARTY 2</Text>
            </View>
            {partyRows(data).map((row) => (
              <View key={row.label} style={styles.row}>
                <View style={[styles.cell, styles.labelCell]}>
                  <Text>{row.label}</Text>
                  {row.hint && <Text style={styles.label}>{row.hint}</Text>}
                </View>
                {row.values.map((value, i) => (
                  <Text key={i} style={styles.cell}>{value}</Text>
                ))}
              </View>
            ))}
          </View>
          <Text style={styles.small}>
            <PdfInline content={template.coverAttribution} />
          </Text>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Text style={styles.termsTitle}>Standard Terms</Text>
        {template.standardTerms.map((section) => (
          <Text key={section.number} style={styles.termSection}>
            {section.number}. <Text style={styles.bold}>{section.title}</Text>.{" "}
            <PdfInline content={section.body} />
          </Text>
        ))}
        <Text style={styles.small}>
          <PdfInline content={template.standardTermsAttribution} />
        </Text>
      </Page>
    </Document>
  );
}
