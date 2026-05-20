import React from 'react';
import { Text } from 'react-native';

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

const MarkdownText = ({ text, style }) => {
  const lines = (text || '').split('\n');
  return (
    <Text style={style}>
      {lines.map((line, i) => {
        let prefix = '';
        let lineWeight = null;
        let fontSize = null;
        let content = line;

        if (line.startsWith('#### ')) {
          lineWeight = '600'; fontSize = 13; content = line.slice(5);
        } else if (line.startsWith('### ')) {
          lineWeight = '700'; fontSize = 14; content = line.slice(4);
        } else if (line.startsWith('## ')) {
          lineWeight = '800'; fontSize = 15; content = line.slice(3);
        } else if (line.startsWith('# ')) {
          lineWeight = '800'; fontSize = 16; content = line.slice(2);
        } else if (line.startsWith('- ') || line.startsWith('• ')) {
          prefix = '• '; content = line.slice(2);
        } else if (/^\d+\.\s/.test(line)) {
          const m = line.match(/^(\d+\.\s)(.*)/);
          prefix = m[1]; content = m[2];
        }

        const inlineParts = parseInline(content);
        const lineStyle = (lineWeight || fontSize)
          ? [lineWeight && { fontWeight: lineWeight }, fontSize && { fontSize }]
          : null;

        return (
          <Text key={i}>
            {i > 0 ? '\n' : ''}
            {prefix ? <Text>{prefix}</Text> : null}
            <Text style={lineStyle}>
              {inlineParts.map((p, j) => (
                <Text key={j} style={[p.bold && { fontWeight: '700' }, p.italic && { fontStyle: 'italic' }]}>
                  {p.t}
                </Text>
              ))}
            </Text>
          </Text>
        );
      })}
    </Text>
  );
};

export default MarkdownText;
