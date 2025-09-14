#!/usr/bin/env node
// Minimal SES test sender. Uses env vars from .env (dotenv/config).
// Usage: node scripts/test-ses-send.mjs --to you@example.com [--from from@example.com]

import 'dotenv/config';
import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const [k, v] = a.startsWith('--') && a.includes('=') ? a.split('=') : [a, null];
    if (k === '--to') args.to = v ?? argv[++i];
    if (k === '--from') args.from = v ?? argv[++i];
    if (k === '--raw') args.raw = true;
    if (k === '--text') args.text = v ?? argv[++i];
    if (k === '--html') args.html = v ?? argv[++i];
    if (k === '--subject') args.subject = v ?? argv[++i];
  }
  return args;
}

async function main() {
  const { to, from, subject, text, html, raw } = parseArgs(process.argv);
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION;

  if (!to) {
    console.error('Missing --to');
    process.exit(2);
  }

  const source = from || process.env.EMAIL_FROM;
  if (!source) {
    console.error('Missing EMAIL_FROM in env or --from');
    process.exit(2);
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !region) {
    console.error('Missing AWS SES envs: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SES_REGION');
    process.exit(2);
  }

  const client = new SESClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const subj = subject || `BambooBot SES test ${new Date().toISOString()}`;
  const bodyText = text || 'Hello! This is a test email from BambooBot SES test script.';
  const bodyHtml = html || `<p>Hello! This is a <strong>test</strong> email from BambooBot SES test script.</p>`;

  try {
    if (raw) {
      // Raw example (no attachments, but future-proof)
      const boundary = `b_${Date.now()}`;
      let msg = '';
      msg += `From: ${source}\r\n`;
      msg += `To: ${to}\r\n`;
      msg += `Subject: ${subj}\r\n`;
      msg += `MIME-Version: 1.0\r\n`;
      msg += `Content-Type: multipart/alternative; boundary=\"${boundary}\"\r\n\r\n`;
      msg += `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${bodyText}\r\n`;
      msg += `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${bodyHtml}\r\n`;
      msg += `--${boundary}--\r\n`;

      const cmd = new SendRawEmailCommand({
        Source: source,
        Destinations: [to],
        RawMessage: { Data: Buffer.from(msg) },
      });
      const out = await client.send(cmd);
      console.log('✅ SES SendRawEmail OK:', out.MessageId || out);
    } else {
      const cmd = new SendEmailCommand({
        Source: source,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subj, Charset: 'UTF-8' },
          Body: {
            Text: { Data: bodyText, Charset: 'UTF-8' },
            Html: { Data: bodyHtml, Charset: 'UTF-8' },
          },
        },
      });
      const out = await client.send(cmd);
      console.log('✅ SES SendEmail OK:', out.MessageId || out);
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ SES send failed:', err?.name || err?.code || err?.message || err);
    if (err?.$metadata) console.error('AWS $metadata:', err.$metadata);
    process.exit(1);
  }
}

main();

