/**
 * PDF version of the Mutual NDA. Mirrors NdaPreview using the same derived
 * cover-page content; loaded on demand when the user downloads.
 *
 * Text is set in Noto Serif. The page's fontFamily is a stack of font pieces
 * (see lib/pdf-fonts) that every text node inherits; react-pdf draws each
 * character with the first family that has a glyph for it. Bold and italic
 * are chosen by fontWeight/fontStyle within each family.
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
import {
  coverPageSections,
  NDA_TITLE,
  PARTY_HEADINGS,
  partyRows,
  SIGNING_STATEMENT,
  STANDARD_TERMS_TITLE,
  type NdaData,
} from "@/lib/nda";
import type { Inline, NdaTemplate } from "@/lib/nda-template";

// Never hyphenate words across lines; it reads poorly in legal text.
Font.registerHyphenationCallback((word) => [word]);

const BORDER = "#cbd5e1";
const MUTED = "#64748b";

const styles = StyleSheet.create({
  page: {
    paddingVertical: 48,
    paddingHorizontal: 60,
    // No fi/ff/fl ligatures: some PDF readers can't turn them back into text,
    // which breaks searching and copying the agreement. Inherited by all text.
    fontFeatureSettings: { liga: false, clig: false },
    fontSize: 10,
    lineHeight: 1.4,
    color: "#0f172a",
  },
  title: {
    fontWeight: 700,
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
  },
  heading: { fontWeight: 700, fontSize: 11.5, marginTop: 8 },
  label: { fontStyle: "italic", fontSize: 9, color: MUTED },
  paragraph: { marginTop: 3 },
  bold: { fontWeight: 700 },
  term: { fontWeight: 700, color: "#3730a3" },
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
    fontWeight: 700,
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
  labelCell: { flex: 0.7, textAlign: "left", fontWeight: 700 },
  signingStatement: { marginTop: 12 },
  small: { fontSize: 8.5, color: MUTED, marginTop: 10 },
  termsTitle: { fontWeight: 700, fontSize: 15, textAlign: "center", marginBottom: 10 },
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
  /** Registered font families in fallback order (see lib/pdf-fonts/load). */
  fonts: string[];
}

export default function NdaPdfDocument({ data, template, fonts }: NdaPdfDocumentProps) {
  const pageStyle = [styles.page, { fontFamily: fonts }];
  return (
    <Document title={NDA_TITLE} creator="Prelegal">
      <Page size="LETTER" style={pageStyle}>
        <Text style={styles.title}>{NDA_TITLE}</Text>
        <Text>
          <PdfInline content={template.coverIntro} />
        </Text>

        {/* Sections may break across pages (long user text must never be
            clipped); minPresenceAhead keeps headings off the page bottom. */}
        {coverPageSections(data).map((section) => (
          <View key={section.heading}>
            <Text style={styles.heading} minPresenceAhead={40}>
              {section.heading}
            </Text>
            {section.label && <Text style={styles.label}>{section.label}</Text>}
            {section.lines?.map((line) => (
              <Text key={line} style={styles.paragraph}>{line}</Text>
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
          <Text style={styles.signingStatement}>{SIGNING_STATEMENT}</Text>
          <View style={styles.table}>
            <View style={styles.row}>
              <Text style={[styles.cell, styles.labelCell]} />
              {PARTY_HEADINGS.map((heading) => (
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
            <PdfInline content={template.coverAttribution} />
          </Text>
        </View>
      </Page>

      <Page size="LETTER" style={pageStyle}>
        <Text style={styles.termsTitle}>{STANDARD_TERMS_TITLE}</Text>
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
