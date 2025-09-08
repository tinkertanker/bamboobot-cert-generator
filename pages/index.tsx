"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { signIn, useSession } from 'next-auth/react';
import Image from 'next/image';

export default function MarketingPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/app');
    }
  }, [status, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-emerald-50 px-6 text-center">
      <div className="max-w-2xl">
        <div className="mx-auto mb-6">
          <Image src="/bamboobot-icon.png" alt="Bamboobot" width={64} height={64} />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-emerald-900">Bamboobot Certificate Generator</h1>
        <p className="mt-3 text-lg text-emerald-800 opacity-90">
          Create beautiful, personalized certificates from spreadsheets. Drag, drop, format, and export PDFs in bulk.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => signIn('google')}
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-5 py-3 text-white font-medium shadow hover:bg-emerald-700">
            Continue with Google
          </button>
          <a href="#features" className="inline-flex items-center justify-center rounded-md bg-white px-5 py-3 text-emerald-700 font-medium border border-emerald-200 hover:bg-emerald-50">
            Learn More
          </a>
        </div>
        <section id="features" className="mt-16 grid sm:grid-cols-3 gap-6 text-left">
          <div className="bg-white p-4 rounded-lg border border-emerald-100 shadow-sm">
            <h3 className="font-semibold text-emerald-900">Drag & Drop</h3>
            <p className="text-emerald-800 opacity-90">Precisely place text fields over your certificate background.</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-emerald-100 shadow-sm">
            <h3 className="font-semibold text-emerald-900">Bulk PDFs</h3>
            <p className="text-emerald-800 opacity-90">Generate single or individual PDFs from CSV/Excel data.</p>
          </div>
          <div className="bg-white p-4 rounded-lg border border-emerald-100 shadow-sm">
            <h3 className="font-semibold text-emerald-900">Email Ready</h3>
            <p className="text-emerald-800 opacity-90">Optional email sending via Resend or SES when configured.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
