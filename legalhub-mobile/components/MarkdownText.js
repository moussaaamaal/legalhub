import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

const parseInline = (text) => {
  const parts = [];
  const regex = /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*)/gs;
  let last = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ t: text.slice(last, match.index) });
    const raw = match[0];
    if (raw.startsWith('***'))     parts.push({ t: raw.slice(3, -3), bold: true, italic: true });
    else if (raw.startsWith('**')) parts.push({ t: raw.slice(2, -2), bold: true });
    else                           parts.push({ t: raw.slice(1, -1), italic: true });
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push({ t: text.slice(last) });
  return parts;
};

const EMPTY_VALUES = new Set([
  // English
  'n/a', 'none', 'not available', 'not mentioned', 'not specified',
  'not provided', 'not applicable', 'not found', 'not identified',
  'not present', 'not included', 'not noted', 'unavailable', 'unknown',
  'none identified', 'none found', 'none mentioned', 'none noted',
  'none specified', 'none provided', 'none applicable', 'not stated',
  'not indicated', 'not determined', 'not disclosed', 'unspecified',
  // French
  'aucun', 'aucune', 'néant', 'non disponible', 'non mentionné', 'non mentionnée',
  'non renseigné', 'non renseignée', 'non applicable', 'non précisé', 'non précisée',
  'non fourni', 'non fournie', 'non spécifié', 'non spécifiée', 'non défini',
  'non définie', 'non identifié', 'non identifiée', 'non communiqué', 'non communiquée',
  'non indiqué', 'non indiquée', 'non déterminé', 'non déterminée',
  'indéfini', 'indéfinie', 'inconnu', 'inconnue', 'sans objet',
  'pas mentionné', 'pas mentionnée', 'pas disponible', 'pas précisé', 'pas précisée',
  // Arabic
  'غير محدد', 'غير محددة', 'غير متوفر', 'غير متوفرة', 'غير مذكور', 'غير مذكورة',
  'غير موجود', 'غير موجودة', 'لا يوجد', 'لا توجد', 'لا ينطبق', 'لا تنطبق',
  'غير معروف', 'غير معروفة', 'غير متاح', 'غير متاحة', 'غير مكتمل', 'غير مكتملة',
  'غير مبين', 'غير مبينة', 'غير مُحدد', 'غير مُحددة', 'مجهول', 'مجهولة',
  'لم يُذكر', 'لم يذكر', 'لم يُحدد', 'لم يحدد', 'لم يُعين', 'لم يعين',
  '—', '-', '~',
]);

const EMPTY_VALUE_RE = new RegExp(
  // English patterns
  '^no\\s+(specific|relevant|particular|additional|known|clear|explicit|direct|notable)\\s+\\S.{0,60}\\.?$|' +
  '^no\\s+\\S.{0,50}(mentioned|found|identified|specified|provided|available|noted|included|present)\\.?$|' +
  '^none\\s+(identified|found|mentioned|noted|specified|provided|applicable)\\.?$|' +
  '^not\\s+(available|present|mentioned|specified|provided|found|included)\\s+in\\s+.{0,60}\\.?$|' +
  '^\\w+\\s+not\\s+(available|mentioned|specified|provided|found|identified|included|present)\\.?$|' +
  // French patterns
  '^non\\s+(spécifié|spécifiée|défini|définie|mentionné|mentionnée|renseigné|renseignée|' +
  'fourni|fournie|disponible|applicable|précisé|précisée|identifié|identifiée|' +
  'communiqué|communiquée|indiqué|indiquée|déterminé|déterminée)\\.?$|' +
  '^pas\\s+(mentionné|mentionnée|précisé|précisée|disponible|applicable)\\.?$|' +
  // Arabic patterns
  '^(لم\\s+ي[^ ]{1,10}|غير\\s+\\S{1,15})\\.?$',
  'i'
);

function isEmptyValue(value) {
  const v = value.trim().toLowerCase().replace(/[.,!:]+$/, '');
  if (!v) return true;
  if (EMPTY_VALUES.has(v)) return true;
  if (EMPTY_VALUE_RE.test(v)) return true;
  return false;
}

function isEmptySectionLine(line) {
  const trimmed = line.trim();
  // Pattern: "• **Title**: value"  or  "**Title**: value"
  const m = trimmed.match(/^[•\-*\d.]*\s*\*\*[^*]+\*\*\s*:\s*(.*)$/);
  if (m) return isEmptyValue(m[1]);
  // Pattern: "**Title**" alone (no colon) — orphan title with no content
  if (/^\*\*[^*]+\*\*\s*$/.test(trimmed)) return true;
  // Standalone short placeholder phrase
  const bare = trimmed.replace(/^[•\-*\d.]+\s*/, '');
  return isEmptyValue(bare) && bare.split(/\s+/).length <= 8;
}

// A line is RTL if it contains more Arabic characters than Latin characters
const isRTLLine = (line) => {
  const arabicCount = (line.match(/[؀-ۿ]/g) || []).length;
  const latinCount = (line.match(/[a-zA-Z]/g) || []).length;
  return arabicCount > 0 && arabicCount > latinCount;
};

const MarkdownText = ({ text, style }) => {
  const lines = (text || '')
    .split('\n')
    .filter(line => !isEmptySectionLine(line));

  const flatStyle = StyleSheet.flatten(style) || {};
  const { paddingBottom, ...textStyle } = flatStyle;

  return (
    <View style={{ paddingBottom: paddingBottom ?? 0 }}>
      {lines.map((line, i) => {
        // Horizontal rule (--- separator between language sections)
        if (/^---+$/.test(line.trim())) {
          return (
            <View
              key={i}
              style={{ height: 1, backgroundColor: '#E5E7EB', marginVertical: 12 }}
            />
          );
        }

        let prefix = '';
        let headingWeight = null;
        let headingSize = null;
        let content = line;

        if (line.startsWith('#### ')) {
          headingWeight = '600'; headingSize = 13; content = line.slice(5);
        } else if (line.startsWith('### ')) {
          headingWeight = '700'; headingSize = 14; content = line.slice(4);
        } else if (line.startsWith('## ')) {
          headingWeight = '800'; headingSize = 15; content = line.slice(3);
        } else if (line.startsWith('# ')) {
          headingWeight = '800'; headingSize = 16; content = line.slice(2);
        } else if (line.startsWith('- ') || line.startsWith('• ')) {
          prefix = '• '; content = line.slice(2);
        } else if (/^\d+\.\s/.test(line)) {
          const m = line.match(/^(\d+\.\s)(.*)/);
          prefix = m[1]; content = m[2];
        }

        const rtl = isRTLLine(line);
        const inlineParts = parseInline(content);

        return (
          <Text
            key={i}
            style={[
              textStyle,
              headingWeight && { fontWeight: headingWeight },
              headingSize && { fontSize: headingSize },
              rtl && { textAlign: 'right', writingDirection: 'rtl' },
              i > 0 && { marginTop: 3 },
            ]}
          >
            {prefix ? <Text>{prefix}</Text> : null}
            {inlineParts.map((p, j) => (
              <Text
                key={j}
                style={[
                  p.bold && { fontWeight: '700' },
                  p.italic && { fontStyle: 'italic' },
                ]}
              >
                {p.t}
              </Text>
            ))}
          </Text>
        );
      })}
    </View>
  );
};

export default MarkdownText;
