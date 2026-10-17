import {
  PDFDocument,
  PDFName,
  PDFObjectCopier,
  PDFPage,
  PDFRef,
  PDFStream
} from 'pdf-lib';
import type { PDFObject, PDFPageLeaf } from 'pdf-lib';

const IMAGE_SUBTYPE = PDFName.of('Image');
const SUBTYPE = PDFName.of('Subtype');

/**
 * Copies page 0 of `templateDoc` into `destDoc` repeatedly while embedding the
 * template's image XObjects (the certificate background) only once.
 *
 * `destDoc.copyPages()` builds a fresh object copier on every call, so calling
 * it once per certificate duplicates the background image stream on every
 * page: a 2 MB background in a 500-row merged PDF becomes ~1 GB in memory and
 * on disk. Here each page still gets its own copy of every page-level object
 * (page dict, Resources, Contents) that pdf-lib mutates when drawing text, but
 * indirect image streams, which pdf-lib never mutates, are mapped to the copy
 * made for the first page. Rendering is identical.
 */
export function createTemplatePageCopier(
  templateDoc: PDFDocument,
  destDoc: PDFDocument
): () => Promise<PDFPage> {
  const sourcePage = templateDoc.getPage(0).node;
  const sharedImageRefs = new Map<PDFRef, PDFRef>();

  return async () => {
    // Mirrors PDFDocument.copyPages().
    await templateDoc.flush();
    const copier = PDFObjectCopier.for(templateDoc.context, destDoc.context);
    // pdf-lib keeps its ref map private; fall back to a plain copy if that
    // internal ever changes shape.
    const traversed = (copier as unknown as {
      traversedObjects?: Map<PDFObject, PDFObject>;
    }).traversedObjects;
    if (!(traversed instanceof Map)) {
      const [page] = await destDoc.copyPages(templateDoc, [0]);
      return page;
    }

    sharedImageRefs.forEach((destRef, srcRef) => traversed.set(srcRef, destRef));

    const copiedLeaf = copier.copy(sourcePage) as PDFPageLeaf;

    traversed.forEach((dest, src) => {
      if (
        !(src instanceof PDFRef) ||
        !(dest instanceof PDFRef) ||
        sharedImageRefs.has(src)
      ) {
        return;
      }
      const original = templateDoc.context.lookup(src);
      if (
        original instanceof PDFStream &&
        original.dict.get(SUBTYPE) === IMAGE_SUBTYPE
      ) {
        sharedImageRefs.set(src, dest);
      }
    });

    const ref = destDoc.context.register(copiedLeaf);
    return PDFPage.of(copiedLeaf, ref, destDoc);
  };
}
