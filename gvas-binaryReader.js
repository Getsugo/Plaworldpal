/**
 * BinaryReader — lecteur séquentiel bas-niveau sur un ArrayBuffer/Uint8Array,
 * en little-endian (convention Unreal Engine).
 *
 * Toutes les méthodes avancent le curseur interne. En cas de lecture au-delà
 * de la fin du buffer, une erreur explicite est levée plutôt que de renvoyer
 * des données invalides silencieusement — ça facilite énormément le débogage
 * d'un format binaire non documenté.
 */
export class BinaryReader {
  constructor(bytes) {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.pos = 0;
  }

  get length() {
    return this.bytes.byteLength;
  }

  tell() {
    return this.pos;
  }

  eof() {
    return this.pos >= this.bytes.byteLength;
  }

  remaining() {
    return this.bytes.byteLength - this.pos;
  }

  _check(n) {
    if (this.pos + n > this.bytes.byteLength) {
      throw new Error(
        `Lecture hors limites : tentative de lire ${n} octet(s) à la position ${this.pos}, ` +
          `mais le buffer ne fait que ${this.bytes.byteLength} octets. ` +
          `Le format binaire lu ne correspond probablement pas à ce que le parser attend ici.`
      );
    }
  }

  skip(n) {
    this._check(n);
    this.pos += n;
  }

  seek(pos) {
    if (pos < 0 || pos > this.bytes.byteLength) {
      throw new Error(`Position de seek invalide: ${pos}`);
    }
    this.pos = pos;
  }

  bytesRaw(n) {
    this._check(n);
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  u8() {
    this._check(1);
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  i8() {
    this._check(1);
    const v = this.view.getInt8(this.pos);
    this.pos += 1;
    return v;
  }

  bool() {
    return this.u8() !== 0;
  }

  u16() {
    this._check(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  i16() {
    this._check(2);
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32() {
    this._check(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  i32() {
    this._check(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f32() {
    this._check(4);
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f64() {
    this._check(8);
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  // Renvoie un BigInt (les 64 bits complets comptent pour des tailles/offsets)
  u64() {
    this._check(8);
    const v = this.view.getBigUint64(this.pos, true);
    this.pos += 8;
    return v;
  }

  i64() {
    this._check(8);
    const v = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return v;
  }

  // Convertit un u64/i64 "raisonnable" (< 2^53) en Number JS classique,
  // pratique pour des tailles de propriétés qui ne dépasseront jamais ça.
  u64AsNumber() {
    const big = this.u64();
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`Valeur u64 trop grande pour être représentée sûrement: ${big}`);
    }
    return Number(big);
  }

  guid() {
    const b = this.bytesRaw(16);
    return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
  }

  /**
   * FString Unreal : int32 length.
   *  - length > 0  : chaîne ASCII/UTF-8 de `length` octets, incluant le \0 final.
   *  - length < 0  : chaîne UTF-16LE de `-length` unités (2 octets chacune),
   *                  incluant le \0 final.
   *  - length == 0 : chaîne vide.
   */
  fstring() {
    const length = this.i32();
    if (length === 0) return "";
    if (length > 0) {
      const raw = this.bytesRaw(length);
      // on retire le \0 terminal
      const str = new TextDecoder("utf-8").decode(raw.subarray(0, length - 1));
      return str;
    }
    const charCount = -length;
    const raw = this.bytesRaw(charCount * 2);
    const str = new TextDecoder("utf-16le").decode(raw.subarray(0, (charCount - 1) * 2));
    return str;
  }
}
