import { zipSync, strToU8 } from 'fflate';

// Fictional engineering artifacts. Deliberately include plans, ambiguous mentions and a conflict.
export const sampleContent = [
  { filename: '01-firmware.pdf', type: 'pdf', sections: [
    { title: 'Argos firmware implementation', text: 'On November 7, 2026, Darun implemented the battery monitor firmware state machine and CAN fault messages. Darun completed bench validation of undervoltage detection. Teja wrote the Python telemetry decoder and documented its JSON fields.' },
    { title: 'Validation and remaining work', text: 'Darun and Teja ran battery monitor integration tests together. Sriram reviewed the event log schema; this review does not establish that Sriram wrote firmware. Active cell balancing is planned and has not been implemented. A draft threshold of 3.0 V per cell was recorded.' }
  ] },
  { filename: '02-battery-review.docx', type: 'docx', sections: [
    { title: 'Battery management review', text: 'Vaibhav designed the battery monitor connector bracket and documented its mounting dimensions. Darun implemented undervoltage detection firmware. The approved November 14 bench configuration uses 3.2 V per cell, superseding the 3.0 V draft value in the firmware note.' },
    { title: 'Unresolved ownership', text: 'Sriram attended the battery safety review. The minutes do not identify who developed active balancing. A future balancing task is assigned to Darun; completion has not been recorded.' }
  ] },
  { filename: '03-software.pdf', type: 'pdf', sections: [
    { title: 'Telemetry and event logging', text: 'Teja implemented the Python telemetry decoder for CAN battery messages. Sriram implemented the event log persistence adapter and its duplicate-event guard. Darun supplied firmware message definitions and tested the decoder with Teja.' },
    { title: 'Integration evidence', text: 'Sriram and Teja completed a replay test using battery undervoltage traces. Vaibhav is mentioned in the release attendee list; this list alone does not document software implementation. No contribution percentages were measured.' }
  ] },
  { filename: '04-handoff.docx', type: 'docx', sections: [
    { title: 'Engineering handoff', text: 'Vaibhav wrote the assembly and connector inspection guide. Teja documented the telemetry JSON fields and replay command. Sriram wrote the event log recovery checklist. Darun documented the battery monitor state transitions and undervoltage bench procedure.' },
    { title: 'Team collaboration', text: 'Darun and Teja paired on firmware-to-software integration testing. Vaibhav reviewed connector orientation with Darun. The handoff repeats a 3.0 V undervoltage threshold from an older draft; consult the November 14 battery review for the approved value.' }
  ] },
  { filename: '05-bracket.step', type: 'step', text: "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Argos battery monitor connector bracket; metadata only'),'2;1');\nFILE_NAME('bracket.step','2026-11-14T12:00:00',('Vaibhav'),('Fictional Argos Team'),'CAD exporter','Demo CAD','');\nFILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n" }
];

export function makePdf(pages) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (const page of pages) {
    const pageId = objects.length + 1; const streamId = pageId + 1; kids.push(`${pageId} 0 R`);
    const lines = `${page.title}\n${page.text}`.match(/[^\n]{1,85}(?:\s|$)|[^\n]{1,85}/g) || [];
    const escape = value => value.replace(/[\\()]/g, '\\$&');
    const stream = `BT /F1 11 Tf 40 760 Td 15 TL\n${lines.map(line => `(${escape(line.trim())}) Tj T*`).join('\n')}\nET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let text = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(text);
}
export function makeDocx(sections) {
  const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${sections.map(s => `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escape(s.title)}</w:t></w:r></w:p><w:p><w:r><w:t>${escape(s.text)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`)
  }));
}
export function sampleFiles() {
  return sampleContent.map(sample => ({ originalname: sample.filename, mimetype: sample.type === 'pdf' ? 'application/pdf' : sample.type === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/step', buffer: sample.type === 'pdf' ? makePdf(sample.sections) : sample.type === 'docx' ? makeDocx(sample.sections) : Buffer.from(sample.text) }));
}
