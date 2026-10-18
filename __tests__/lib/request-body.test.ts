/** @jest-environment node */
import { Readable } from 'stream';
import type { IncomingMessage } from 'http';
import { parseMultipartForm, readRequestBody, RequestBodyTooLargeError } from '@/lib/server/request-body';

function request(chunks: Array<Buffer | string>, headers: Record<string, string> = {}): IncomingMessage {
  return Object.assign(Readable.from(chunks), { headers }) as unknown as IncomingMessage;
}

describe('readRequestBody', () => {
  it('concatenates the streamed body', async () => {
    const body = await readRequestBody(request([Buffer.from('hello '), 'world']), 100);
    expect(body.toString()).toBe('hello world');
  });

  it('accepts a body exactly at the limit', async () => {
    await expect(readRequestBody(request(['12345']), 5)).resolves.toHaveLength(5);
  });

  it('rejects a declared Content-Length over the limit without reading', async () => {
    const stream = request(['x'], { 'content-length': '1000' });
    const read = jest.spyOn(stream, 'read');
    await expect(readRequestBody(stream, 10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(read).not.toHaveBeenCalled();
  });

  it('stops reading once the streamed body passes the limit, whatever the header says', async () => {
    const stream = request([Buffer.alloc(6), Buffer.alloc(6), Buffer.alloc(6)], { 'content-length': '5' });
    await expect(readRequestBody(stream, 10)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});

describe('parseMultipartForm', () => {
  async function encode(form: FormData) {
    const req = new Request('http://localhost/', { method: 'POST', body: form });
    return { body: Buffer.from(await req.arrayBuffer()), contentType: req.headers.get('content-type') as string };
  }

  it('parses fields and files', async () => {
    const form = new FormData();
    form.append('note', 'hi');
    form.append('template', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'cert.png');
    const { body, contentType } = await encode(form);

    const parsed = await parseMultipartForm(body, contentType);
    expect(parsed.get('note')).toBe('hi');
    const file = parsed.get('template') as File;
    expect(file.name).toBe('cert.png');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it.each([undefined, 'application/json', 'text/plain'])('rejects the content type %p', async contentType => {
    await expect(parseMultipartForm(Buffer.from('{}'), contentType)).rejects.toThrow(TypeError);
  });

  it('rejects a malformed multipart body', async () => {
    await expect(
      parseMultipartForm(Buffer.from('not multipart'), 'multipart/form-data; boundary=abc'),
    ).rejects.toThrow();
  });
});
