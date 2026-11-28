// 엑셀(.xlsx) 파일 만들기(외부 도구 없이). 시트마다 글자·숫자 칸만 쓴다. 압축하지 않는 zip(store) 이라 크기는 크지만 엑셀·구글 시트·한글이 모두 연다.
export interface Sheet { name: string; rows: (string | number | null | undefined)[][] }

const enc = new TextEncoder();
let table: Uint32Array | null = null;
function crc32(b: Uint8Array): number {
  if (!table) { table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const col = (i: number) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };

/** 시트 이름: 31자까지, [ ] : * ? / \ 는 못 씀, 겹치면 번호를 붙인다 */
function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    let b = n.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 28) || "시트";
    let x = b, i = 2;
    while (used.has(x.toLowerCase())) x = `${b.slice(0, 26)} ${i++}`;
    used.add(x.toLowerCase());
    b = x;
    return b;
  });
}

function sheetXml(rows: Sheet["rows"]): string {
  const out: string[] = [];
  rows.forEach((r, ri) => {
    const cells = r.map((v, ci) => {
      if (v == null || v === "") return "";
      const ref = col(ci) + (ri + 1);
      if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : "";
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
    }).join("");
    out.push(`<row r="${ri + 1}">${cells}</row>`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${out.join("")}</sheetData></worksheet>`;
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let off = 0;
  const u16 = (v: number) => [v & 255, (v >> 8) & 255], u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0)]);
    parts.push(local, name, f.data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(n), ...u32(n),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += local.length + name.length + n;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  const all = [...parts, ...central, end];
  const buf = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const a of all) { buf.set(a, p); p += a.length; }
  return buf;
}

/** 시트 목록 → .xlsx 파일 내용 */
export function xlsxBytes(sheets: Sheet[]): Uint8Array {
  const names = sheetNames(sheets.map((s) => s.name));
  const T = (s: string) => enc.encode(s);
  const head = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  const files = [
    { name: "[Content_Types].xml", data: T(`${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`) },
    { name: "_rels/.rels", data: T(`${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: T(`${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: T(`${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: "xl/styles.xml", data: T(`${head}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Malgun Gothic"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: T(sheetXml(s.rows)) })),
  ];
  return zip(files);
}

let lastUrl = "";
/** 파일로 내려받기(브라우저 저장 창). 직전에 만든 주소는 다음 내려받기 때 거둔다(타이머 없이). */
export function downloadXlsx(filename: string, sheets: Sheet[]): void {
  const blob = new Blob([xlsxBytes(sheets) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  const url = lastUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}
