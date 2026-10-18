import type { IncomingMessage } from 'http';

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large');
    this.name = 'RequestBodyTooLargeError';
  }
}

/** Read a raw request body (for routes with bodyParser off), stopping at maxBytes. */
export async function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestBodyTooLargeError();

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > maxBytes) throw new RequestBodyTooLargeError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, total);
}

/** Parse a multipart/form-data body with the platform's FormData parser. */
export async function parseMultipartForm(body: Buffer, contentType: string | undefined): Promise<FormData> {
  if (!contentType || !/^multipart\/form-data\b/i.test(contentType)) {
    throw new TypeError('Expected multipart/form-data');
  }
  return new Response(new Uint8Array(body), { headers: { 'content-type': contentType } }).formData();
}
