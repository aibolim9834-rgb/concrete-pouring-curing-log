// A one-sheet Excel (.xlsx) file built in the browser without a library.
// Unlike CSV it carries column widths, a frozen header row, filters, cell borders,
// real dates shown as 26.10.02(목) and a landscape page that fits A4 width.
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type XlsxKind = 'text' | 'number' | 'date';
export interface XlsxColumn { header: string; kind?: XlsxKind }
export type XlsxValue = string | number | null | undefined;

const DATE_FORMAT = '[$-412]yy.mm.dd(aaa)';
const DATE_WIDTH = 14;
const encoder = new TextEncoder();

// Text Excel rejects inside XML (control characters other than tab and line breaks).
const xmlText = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlAttr = (text: string) => xmlText(text).replace(/"/g, '&quot;');

function columnName(index: number) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

// Days since 1899-12-30 for a valid YYYY-MM-DD, otherwise null (the value is then kept as text).
export function excelDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const time = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (new Date(time).toISOString().slice(0, 10) !== value) return null;
  return (time - Date.UTC(1899, 11, 30)) / 86400000;
}

const numeric = (value: XlsxValue) => typeof value === 'number' ? (Number.isFinite(value) ? value : null)
  : typeof value === 'string' && /^\s*-?\d+(?:\.\d+)?\s*$/.test(value) ? Number(value) : null;

// Korean and other wide characters take about two Excel width units.
const displayWidth = (text: string) => Array.from(text).reduce((sum, ch) => sum + (ch.codePointAt(0)! >= 0x1100 ? 2 : 1), 0);

function cellXml(ref: string, value: XlsxValue, kind: XlsxKind): { xml: string; width: number } {
  if (value === null || value === undefined || value === '') return { xml: `<c r="${ref}" s="2"/>`, width: 0 };
  if (kind === 'date' && typeof value === 'string') {
    const serial = excelDate(value);
    if (serial !== null) return { xml: `<c r="${ref}" s="4"><v>${serial}</v></c>`, width: DATE_WIDTH };
  }
  if (kind === 'number') {
    const n = numeric(value);
    if (n !== null) return { xml: `<c r="${ref}" s="3"><v>${n}</v></c>`, width: String(n).length };
  }
  // Inline strings are never evaluated, so text such as "=1+1" stays text.
  const text = String(value);
  return { xml: `<c r="${ref}" s="2" t="inlineStr"><is><t xml:space="preserve">${xmlText(text)}</t></is></c>`, width: Math.max(...text.split('\n').map(displayWidth)) };
}

// Optional lines around the table: a title and a subtitle above it, and a total row below it.
// The total uses SUBTOTAL(109, …) so Excel re-adds only the rows left visible by a filter.
export interface XlsxOptions { title?: string; subtitle?: string; total?: { label: string; columns: number[] } }

function layout(columns: XlsxColumn[], rows: XlsxValue[][], options: XlsxOptions) {
  const head = 1 + (options.title ? 1 : 0) + (options.subtitle ? 1 : 0), first = head + 1, lastData = head + rows.length;
  const total = options.total?.columns.length && rows.length ? lastData + 1 : 0;
  return { head, first, lastData, total, end: total || lastData, last: columnName(columns.length - 1) };
}

const textCell = (ref: string, style: number, text: string) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(text)}</t></is></c>`;

function sheetXml(columns: XlsxColumn[], rows: XlsxValue[][], options: XlsxOptions) {
  const { head, first, lastData, total, end, last } = layout(columns, rows, options);
  const widths = columns.map(c => displayWidth(c.header) + 3), merges: string[] = [], lines: string[] = [];
  let at = 1;
  for (const [text, style, height] of [[options.title, 5, 26], [options.subtitle, 6, 20]] as const) {
    if (!text) continue;
    lines.push(`<row r="${at}" ht="${height}" customHeight="1">${textCell(`A${at}`, style, text)}</row>`);
    if (columns.length > 1) merges.push(`A${at}:${last}${at}`);
    at++;
  }
  lines.push(`<row r="${head}">${columns.map((c, i) => textCell(`${columnName(i)}${head}`, 1, c.header)).join('')}</row>`);
  rows.forEach((row, r) => lines.push(`<row r="${first + r}">${columns.map((c, i) => {
    const cell = cellXml(`${columnName(i)}${first + r}`, row[i], c.kind || 'text');
    widths[i] = Math.max(widths[i], cell.width + 2);
    return cell.xml;
  }).join('')}</row>`));
  if (total && options.total) {
    const { label, columns: sums } = options.total, start = Math.min(...sums);
    const cells = columns.map((_, i) => {
      const ref = `${columnName(i)}${total}`;
      if (i === 0 && start > 0) return textCell(ref, 7, label);
      if (!sums.includes(i)) return `<c r="${ref}" s="${i < start ? 7 : 8}"/>`;
      const sum = Math.round(rows.reduce((s, row) => s + (numeric(row[i]) ?? 0), 0) * 1000) / 1000;
      widths[i] = Math.max(widths[i], String(sum).length + 3);
      return `<c r="${ref}" s="8"><f>SUBTOTAL(109,${columnName(i)}${first}:${columnName(i)}${lastData})</f><v>${sum}</v></c>`;
    });
    lines.push(`<row r="${total}">${cells.join('')}</row>`);
    if (start > 1) merges.push(`A${total}:${columnName(start - 1)}${total}`);
  }
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(Math.max(w, 6), 50)}" customWidth="1"/>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}${end}"/>`
    + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${head}" topLeftCell="A${first}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="16.5"/><cols>${cols}</cols>`
    + `<sheetData>${lines.join('')}</sheetData>`
    + `<autoFilter ref="A${head}:${last}${lastData}"/>`
    + (merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '')
    + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
    + '</worksheet>';
}

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + `<numFmts count="1"><numFmt numFmtId="164" formatCode="${xmlAttr(DATE_FORMAT)}"/></numFmts>`
  + '<fonts count="3"><font><sz val="10"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font>'
  + '<font><b/><sz val="10"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font>'
  + '<font><b/><sz val="14"/><name val="맑은 고딕"/><family val="3"/><charset val="129"/></font></fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right>'
  + '<top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

// Sheet names: at most 31 characters, none of []:*?/\ and no leading/trailing apostrophe.
const safeSheetName = (name: string) => name.replace(/[\[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Sheet1';

export function xlsxFile(sheetName: string, columns: XlsxColumn[], rows: XlsxValue[][], options: XlsxOptions = {}): Uint8Array<ArrayBuffer> {
  const name = safeSheetName(sheetName), quoted = `'${name.replace(/'/g, "''")}'`;
  const { head, lastData, last } = layout(columns, rows, options);
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<bookViews><workbookView/></bookViews><sheets><sheet name="${xmlAttr(name)}" sheetId="1" r:id="rId1"/></sheets>`
    + `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${xmlText(`${quoted}!$A$${head}:$${last}$${lastData}`)}</definedName>`
    + `<definedName name="_xlnm.Print_Titles" localSheetId="0">${xmlText(`${quoted}!$${head}:$${head}`)}</definedName></definedNames>`
    + '<calcPr fullCalcOnLoad="1"/>'
    + '</workbook>';
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheetXml(columns, rows, options)],
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Stored (uncompressed) ZIP entries; file times are fixed at 1980-01-01.
function zip(files: [string, string][]): Uint8Array<ArrayBuffer> {
  const entries = files.map(([path, text]) => { const name = encoder.encode(path), data = encoder.encode(text); return { name, data, crc: crc32(data), offset: 0 }; });
  const size = entries.reduce((sum, e) => sum + 30 + e.name.length + e.data.length + 46 + e.name.length, 0) + 22;
  const out = new Uint8Array(size), view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v: number) => { view.setUint16(at, v, true); at += 2; };
  const u32 = (v: number) => { view.setUint32(at, v, true); at += 4; };
  const common = (e: typeof entries[number]) => { u16(20); u16(0); u16(0); u16(0); u16(33); u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0); };
  for (const e of entries) {
    e.offset = at;
    u32(0x04034b50); common(e);
    out.set(e.name, at); at += e.name.length;
    out.set(e.data, at); at += e.data.length;
  }
  const directory = at;
  for (const e of entries) {
    u32(0x02014b50); u16(20); common(e); u16(0); u16(0); u16(0); u32(0); u32(e.offset);
    out.set(e.name, at); at += e.name.length;
  }
  const directorySize = at - directory;
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(directorySize); u32(directory); u16(0);
  return out;
}
