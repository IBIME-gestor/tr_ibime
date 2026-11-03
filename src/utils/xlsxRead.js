import * as XLSX from 'xlsx';

/**
 * Algunos reportes (p. ej. Metabase) guardan el .xlsx como zip "en streaming":
 * en la cabecera local de cada archivo los tamaños vienen en 0 y los reales van
 * después (bit 3 de los flags). La librería xlsx 0.18.x no soporta eso y falla
 * con «Bad uncompressed size: N != 0», dejando el libro vacío.
 *
 * Esta función reescribe las cabeceras locales con los tamaños y el CRC que ya
 * trae el directorio central. No descomprime ni altera los datos.
 */
export function repairZip(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return bytes; // no es zip (.xls)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Fin del directorio central (EOCD)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return bytes;
  const count = dv.getUint16(eocd + 10, true);
  let cd = dv.getUint32(eocd + 16, true);

  const entries = [];
  for (let n = 0; n < count; n += 1) {
    if (dv.getUint32(cd, true) !== 0x02014b50) return bytes;
    const flags = dv.getUint16(cd + 8, true);
    const method = dv.getUint16(cd + 10, true);
    const time = dv.getUint16(cd + 12, true);
    const date = dv.getUint16(cd + 14, true);
    const crc = dv.getUint32(cd + 16, true);
    const csize = dv.getUint32(cd + 20, true);
    const usize = dv.getUint32(cd + 24, true);
    const nameLen = dv.getUint16(cd + 28, true);
    const extraLen = dv.getUint16(cd + 30, true);
    const commentLen = dv.getUint16(cd + 32, true);
    const extAttr = dv.getUint32(cd + 38, true);
    const localOffset = dv.getUint32(cd + 42, true);
    if (csize === 0xffffffff || usize === 0xffffffff || localOffset === 0xffffffff) return bytes; // zip64: no tocar
    const name = bytes.subarray(cd + 46, cd + 46 + nameLen);
    if (dv.getUint32(localOffset, true) !== 0x04034b50) return bytes;
    const dataStart = localOffset + 30 + dv.getUint16(localOffset + 26, true) + dv.getUint16(localOffset + 28, true);
    entries.push({ flags: flags & ~0x0008, method, time, date, crc, csize, usize, name, extAttr, data: bytes.subarray(dataStart, dataStart + csize) });
    cd += 46 + nameLen + extraLen + commentLen;
  }

  const total = entries.reduce((n, e) => n + 30 + e.name.length + e.csize + 46 + e.name.length, 22);
  const out = new Uint8Array(total);
  const o = new DataView(out.buffer);
  let p = 0;
  const offsets = [];
  entries.forEach((e) => {
    offsets.push(p);
    o.setUint32(p, 0x04034b50, true); o.setUint16(p + 4, 20, true); o.setUint16(p + 6, e.flags, true);
    o.setUint16(p + 8, e.method, true); o.setUint16(p + 10, e.time, true); o.setUint16(p + 12, e.date, true);
    o.setUint32(p + 14, e.crc, true); o.setUint32(p + 18, e.csize, true); o.setUint32(p + 22, e.usize, true);
    o.setUint16(p + 26, e.name.length, true); o.setUint16(p + 28, 0, true);
    out.set(e.name, p + 30); out.set(e.data, p + 30 + e.name.length);
    p += 30 + e.name.length + e.csize;
  });
  const cdStart = p;
  entries.forEach((e, i) => {
    o.setUint32(p, 0x02014b50, true); o.setUint16(p + 4, 20, true); o.setUint16(p + 6, 20, true); o.setUint16(p + 8, e.flags, true);
    o.setUint16(p + 10, e.method, true); o.setUint16(p + 12, e.time, true); o.setUint16(p + 14, e.date, true);
    o.setUint32(p + 16, e.crc, true); o.setUint32(p + 20, e.csize, true); o.setUint32(p + 24, e.usize, true);
    o.setUint16(p + 28, e.name.length, true); o.setUint32(p + 38, e.extAttr, true); o.setUint32(p + 42, offsets[i], true);
    out.set(e.name, p + 46);
    p += 46 + e.name.length;
  });
  o.setUint32(p, 0x06054b50, true); o.setUint16(p + 8, entries.length, true); o.setUint16(p + 10, entries.length, true);
  o.setUint32(p + 12, p - cdStart, true); o.setUint32(p + 16, cdStart, true);
  return out;
}

/** Lee un .xlsx/.xls de forma tolerante (repara zips en streaming antes de leer). */
export function readWorkbook(arrayBuffer) {
  let data = new Uint8Array(arrayBuffer);
  try { data = repairZip(data); } catch (e) { console.warn('No se pudo reparar el zip, se usa el original.', e); }
  return XLSX.read(data, { type: 'array' });
}
