/* Applied to pdf-lib's CJS and ESM parsers by scripts/patch-pdf-lib.cjs.
 * Budgets belong to one PDFContext, never a module-global active parse: browser
 * requests and server jobs can interleave while pdf-lib yields between objects.
 */
const MiB = 1024 * 1024;
const limits = Object.freeze({
  inputBytes: 32 * MiB,
  streamBytes: 16 * MiB,
  decodedBytes: 32 * MiB,
  copiedBytes: 64 * MiB,
  scalarBytes: MiB,
  tokenBytes: 64 * 1024,
  objects: 100000,
  indirectObjects: 10000,
  xrefEntries: 10000,
  depth: 64,
  filters: 8,
  steps: 20 * MiB,
  milliseconds: 10000,
});

class Budget {
  constructor() {
    this.deadline = performance.now() + limits.milliseconds;
    this.active = true;
    this.error = null;
    this.steps = 0;
    this.objects = 0;
    this.indirectObjects = 0;
    this.xrefEntries = 0;
    this.depth = 0;
    this.decodedBytes = 0;
    this.copiedBytes = 0;
    this.scalarBytes = 0;
  }

  fail(reason) {
    // Sticky: pdf-lib's malformed-object recovery must not swallow a limit.
    this.error ||= new Error(`PDF resource budget exceeded: ${reason}`);
    throw this.error;
  }

  check() {
    if (this.error) throw this.error;
    if (this.active && performance.now() > this.deadline) this.fail('parsing deadline');
  }

  step(amount = 1) {
    this.steps += amount;
    if (this.steps > limits.steps) this.fail('parser work');
    if ((this.steps & 1023) === 0 || amount > 1) this.check();
    if (this.error) throw this.error;
  }

  integer(value, maximum, name) {
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) this.fail(name);
    return value;
  }

  count(name, amount) {
    this.integer(amount, limits[name], name);
    this[name] += amount;
    if (this[name] > limits[name]) this.fail(name);
    this.check();
  }
}

function budget(context) {
  return context.bamboobotParserBudget ||= new Budget();
}

function bytes(stream, context) {
  if (stream.bamboobotBudgeted) return stream;
  stream.bamboobotBudgeted = true;
  const b = budget(context);
  b.integer(stream.length, limits.inputBytes, 'input bytes');
  const next = stream.next;
  stream.next = function () {
    b.step();
    if (this.bamboobotTokenEnd !== undefined) {
      if (this.idx >= this.bamboobotTokenEnd) b.fail('scalar token bytes');
      if (++b.scalarBytes > limits.scalarBytes) b.fail('scalar bytes');
    }
    return next.call(this);
  };
  const moveTo = stream.moveTo;
  stream.moveTo = function (offset) {
    b.step();
    b.integer(offset, this.length, 'stream offset');
    return moveTo.call(this, offset);
  };
  const slice = stream.slice;
  stream.slice = function (start, end) {
    b.integer(start, this.length, 'stream start');
    b.integer(end, this.length, 'stream end');
    b.count('copiedBytes', end - start);
    return slice.call(this, start, end);
  };
  return stream;
}

function parser(instance, context) {
  const b = budget(context);
  bytes(instance.bytes, context);
  // These upstream methods concatenate a character at a time. Bound both one
  // token and total scalar work before string ropes can amplify a small input.
  for (const method of ['parseString', 'parseHexString', 'parseName', 'parseRawInt', 'parseRawNumber']) {
    const original = instance[method];
    instance[method] = function (...args) {
      const previous = this.bytes.bamboobotTokenEnd;
      this.bytes.bamboobotTokenEnd = Math.min(previous ?? Infinity, this.bytes.offset() + limits.tokenBytes);
      try {
        return original.apply(this, args);
      } finally {
        this.bytes.bamboobotTokenEnd = previous;
      }
    };
  }
  const parseObject = instance.parseObject;
  instance.parseObject = function () {
    b.count('objects', 1);
    if (++b.depth > limits.depth) b.fail('object nesting');
    try {
      return parseObject.call(this);
    } finally {
      b.depth--;
    }
  };
}

function inputStream(stream, context) {
  const b = budget(context);
  for (const method of ['getByte', 'getBytes']) {
    const original = stream[method];
    stream[method] = function (...args) {
      b.step();
      return original.apply(this, args);
    };
  }
  return stream;
}

function decoder(stream, context) {
  const b = budget(context);
  inputStream(stream, context);
  // Guard each decoder as it is constructed, BEFORE the next filter can read
  // from it. This covers intermediate expansion, not just the final output.
  const ensureBuffer = stream.ensureBuffer;
  stream.ensureBuffer = function (requested) {
    b.integer(requested, limits.streamBytes, 'decoded stream bytes');
    b.check();
    if (requested > this.buffer.byteLength) {
      let size = this.minBufferLength;
      while (size < requested) size *= 2;
      b.integer(size, limits.streamBytes, 'decoder allocation');
      // Account for retained capacity across every stream/filter in the PDF.
      b.count('decodedBytes', size - this.buffer.byteLength);
    }
    return ensureBuffer.call(this, requested);
  };
  // A malformed compressed block need not produce any output. Charge decoder
  // iterations too, so an output-only budget cannot leave a CPU-only loop.
  for (const method of ['readBlock', 'getCode', 'getBits', 'readBits']) {
    if (!stream[method]) continue;
    const original = stream[method];
    stream[method] = function (...args) {
      b.step();
      return original.apply(this, args);
    };
  }
  return stream;
}

function xref(instance, size) {
  const b = budget(instance.context);
  b.integer(size, 1000000, 'xref Size');
  if (instance.byteWidths.length !== 3) b.fail('xref widths');
  let width = 0;
  for (const value of instance.byteWidths) width += b.integer(value, 4, 'xref width');
  if (width === 0) b.fail('empty xref widths');
  let count = 0;
  for (const section of instance.subsections) {
    b.integer(section.firstObjectNumber, size, 'xref first object');
    b.integer(section.length, size - section.firstObjectNumber, 'xref subsection length');
    count += section.length;
  }
  b.count('xrefEntries', count);
  if (count * width > instance.bytes.length) b.fail('truncated xref stream');
}

function objectStream(instance) {
  const b = budget(instance.context);
  b.integer(instance.firstOffset, instance.bytes.length, 'object stream First');
  b.count('indirectObjects', instance.objectCount);
  if (instance.objectCount * 3 > instance.firstOffset) b.fail('object stream header');
  const parseRawInt = instance.parseRawInt;
  instance.parseRawInt = function () {
    try {
      return parseRawInt.call(this);
    } catch {
      b.fail('object stream integer');
    }
  };
}

function objectOffset(instance, objectNumber, offset) {
  const b = budget(instance.context);
  b.integer(objectNumber, 1000000, 'object stream number');
  b.integer(offset, instance.bytes.length - instance.firstOffset - 1, 'object stream offset');
  if (instance.bytes.offset() > instance.firstOffset) b.fail('object stream header overlap');
}

function finish(context, PDFName, PDFDict, PDFArray) {
  const b = budget(context);
  const root = context.lookup(context.trailerInfo.Root);
  // Do not let a small cyclic or multiply referenced page tree cause an
  // unbounded traversal later in getPages/copyPages or inherited attributes.
  if (root instanceof PDFDict) {
    const pending = [{ node: root.lookup(PDFName.of('Pages')), parent: undefined, depth: 0 }];
    const seen = new Set();
    while (pending.length) {
      b.check();
      const { node, parent, depth } = pending.pop();
      if (!(node instanceof PDFDict) || seen.has(node) || depth > limits.depth) b.fail('page tree');
      seen.add(node);
      if (seen.size > limits.indirectObjects) b.fail('page tree size');
      if (node.lookup(PDFName.of('Parent')) !== parent) b.fail('page parent cycle');
      const type = node.lookup(PDFName.of('Type'));
      if (type === PDFName.of('Pages')) {
        const kids = node.lookup(PDFName.of('Kids'));
        if (!(kids instanceof PDFArray) || pending.length + kids.size() > limits.indirectObjects) b.fail('page tree children');
        for (let index = 0; index < kids.size(); index++) {
          pending.push({ node: kids.lookup(index), parent: node, depth: depth + 1 });
        }
      } else if (type !== PDFName.of('Page')) {
        b.fail('page tree node');
      }
    }
  }
  b.check();
  b.active = false;
}

module.exports = { limits, budget, bytes, parser, inputStream, decoder, xref, objectStream, objectOffset, finish };
