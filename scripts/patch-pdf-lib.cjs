/* No install-time dependency or network access. Apply reviewed hooks to the
 * exact pdf-lib 1.17.1 build we audited; fail closed on upstream drift.
 * Both CJS (Node/Jest) and ESM (browser/Workers) use the same budget module.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.dirname(require.resolve('pdf-lib/package.json'));
const sha = text => createHash('sha256').update(text).digest('hex');
const hashes = {
  cjs: {
    'parser/PDFParser': '390fc8e6464b2938e9e8726b3ae23649514dc157beed55f333e58a0bc6899c58',
    'parser/PDFObjectParser': '627b964fae4377458e0eaff03862aba6994747b0d49a5dfccd85fb71ae3d4547',
    'parser/PDFObjectStreamParser': '55a12aa6d4ccc5af18286abc9e264e0b219e90129404f83645d248badbf3fb7a',
    'parser/PDFXRefStreamParser': '3bfc5d5afd99549c4739ac788b7465c753625fe6f53b972ab4832d33eab1342b',
    'parser/ByteStream': 'f7489621ec58792b4c6c4d1e8b38ce5fcd17d997b0f9d2c0b7d81176e55cbf12',
    'streams/decode': 'd9a689fe9004122c9b96c5e331defa1a22a7c27f2591f42033ccdcb562e1d689',
  },
  es: {
    'parser/PDFParser': '9b5f5cca51c6ed6456c2743229fee2961a5108585073d4779bf75de137feba88',
    'parser/PDFObjectParser': 'e113a887611dc37a276e01df6d4b459cfd3c27b281afc2f9cfed79dac6055b15',
    'parser/PDFObjectStreamParser': '08793bf0e6e44d40cc0c07b82c81e7d7adeec5a113ea483bc1582ffb9f9ef242',
    'parser/PDFXRefStreamParser': 'da4193954e502cf67d3c82adf311714453ef66f73775c4a5ceeef225c5d3b9ba',
    'parser/ByteStream': '7f0214c5e0597da4cf6d7f8aca6eeb78ac505f531b6304dea7d807cfb0d8b582',
    'streams/decode': '390f9f113ff018b1d02204220f6241546c62aa9c6eecfdf274054da55d8e43ed',
  },
};
if (require(path.join(root, 'package.json')).version !== '1.17.1') {
  throw new Error('Re-audit PDF parser budget hooks before changing pdf-lib');
}

const changes = [];
for (const format of ['cjs', 'es']) {
  const symbol = name => format === 'cjs' ? `${name}_1.default` : name;
  for (const [file, expected] of Object.entries(hashes[format])) {
    const filename = path.join(root, format, 'core', `${file}.js`);
    const backup = `${filename}.bamboobot-original`;
    const current = fs.readFileSync(filename, 'utf8');
    const original = fs.existsSync(backup) ? fs.readFileSync(backup, 'utf8') : current;
    if (sha(original) !== expected) throw new Error(`Unexpected pdf-lib source: ${filename}`);
    let source = original;
    const replace = (before, after) => {
      if (source.split(before).length !== 2) throw new Error(`Ambiguous PDF hook: ${file}: ${before}`);
      source = source.replace(before, after);
    };
    if (file === 'parser/PDFParser') {
      replace('_this.alreadyParsed = false;', 'bb.budget(_this.context).integer(pdfBytes.length, bb.limits.inputBytes, "input bytes");\n        _this.alreadyParsed = false;');
      replace('return [2 /*return*/, this.context];', `bb.finish(this.context, ${symbol('PDFName')}, ${symbol('PDFDict')}, bbArray);\n                        return [2 /*return*/, this.context];`);
      source = (format === 'cjs' ? 'var bbArray = require("../objects/PDFArray").default;\n' : 'import bbArray from "../objects/PDFArray";\n') + source;
      // Count actual indirect definitions, including repeated definitions of one ref.
      replace('ref = this.parseIndirectObjectHeader();\n                        this.skipWhitespaceAndComments();', 'ref = this.parseIndirectObjectHeader();\n                        bb.budget(this.context).count("indirectObjects", 1);\n                        this.skipWhitespaceAndComments();');
      replace('e_1 = _a.sent();', 'e_1 = _a.sent();\n                        bb.budget(this.context).check();');
      replace(`var ref = ${symbol('PDFRef')}.of(objectNumber, secondInt);`, `bb.budget(this.context).count("xrefEntries", 1);\n                var ref = ${symbol('PDFRef')}.of(objectNumber, secondInt);`);
    } else if (file === 'parser/PDFObjectParser') {
      replace('_this.context = context;', '_this.context = context;\n        bb.parser(_this, context);');
    } else if (file === 'parser/PDFObjectStreamParser') {
      const line = `_this.objectCount = dict.lookup(${symbol('PDFName')}.of('N'), ${symbol('PDFNumber')}).asNumber();`;
      replace(line, `${line}\n        bb.objectStream(_this);`);
      replace('offsetsAndObjectNumbers.push({ objectNumber: objectNumber, offset: offset });', 'bb.objectOffset(this, objectNumber, offset);\n            offsetsAndObjectNumbers.push({ objectNumber: objectNumber, offset: offset });');
    } else if (file === 'parser/PDFXRefStreamParser') {
      replace('this.subsections = [];', 'if (Index.size() % 2 !== 0) bb.budget(this.context).fail("xref Index pairs");\n            this.subsections = [];');
      replace('this.byteWidths = [-1, -1, -1];', 'if (W.size() !== 3) bb.budget(this.context).fail("xref widths");\n        this.byteWidths = [-1, -1, -1];');
      replace(`this.byteWidths[idx] = W.lookup(idx, ${symbol('PDFNumber')}).asNumber();\n        }`, `this.byteWidths[idx] = W.lookup(idx, ${symbol('PDFNumber')}).asNumber();\n        }\n        bb.xref(this, Size.asNumber());`);
    } else if (file === 'parser/ByteStream') {
      const decode = format === 'cjs' ? 'decode_1.decodePDFRawStream' : 'decodePDFRawStream';
      replace(`return ByteStream.of(${decode}(rawStream).decode());`, `return bb.bytes(ByteStream.of(${decode}(rawStream).decode()), rawStream.dict.context);`);
    } else if (file === 'streams/decode') {
      replace(`var stream = new ${symbol('Stream')}(contents);`, `var stream = bb.inputStream(new ${symbol('Stream')}(contents), dict.context);`);
      replace('stream = decodeStream(stream, Filter, DecodeParms);', 'stream = bb.decoder(decodeStream(stream, Filter, DecodeParms), dict.context);');
      replace('for (var idx = 0, len = Filter.size(); idx < len; idx++) {', 'bb.budget(dict.context).integer(Filter.size(), bb.limits.filters, "filter chain");\n        for (var idx = 0, len = Filter.size(); idx < len; idx++) {');
      replace(`stream = decodeStream(stream, Filter.lookup(idx, ${symbol('PDFName')}), DecodeParms && DecodeParms.lookupMaybe(idx, ${symbol('PDFDict')}));`, `stream = bb.decoder(decodeStream(stream, Filter.lookup(idx, ${symbol('PDFName')}), DecodeParms && DecodeParms.lookupMaybe(idx, ${symbol('PDFDict')})), dict.context);`);
    }
    source = (format === 'cjs' ? 'var bb = require("../../../bamboobot-parser-budget.cjs");\n' : 'import bb from "../../../bamboobot-parser-budget.cjs";\n') + source;
    changes.push({ filename, backup, original, source });
  }
}
// Validate every input before modifying any file. Backups permit idempotent
// rebuilds and local development of the hooks without trusting a marker alone.
for (const { filename, backup, original, source } of changes) {
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
  if (fs.readFileSync(filename, 'utf8') !== source) fs.writeFileSync(filename, source);
}
const budgetSource = fs.readFileSync(path.join(__dirname, '../lib/pdf/parser-budget.cjs'), 'utf8');
const budgetTarget = path.join(root, 'bamboobot-parser-budget.cjs');
if (!fs.existsSync(budgetTarget) || fs.readFileSync(budgetTarget, 'utf8') !== budgetSource) fs.writeFileSync(budgetTarget, budgetSource);
console.log('Applied pdf-lib parser budgets (CJS + ESM, 1.17.1)');
