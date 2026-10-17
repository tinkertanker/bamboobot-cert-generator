import Head from 'next/head';
import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white to-emerald-50 px-4 text-center">
      <Head>
        <title>Page not found — Bamboobot</title>
      </Head>
      <p className="text-sm font-semibold text-emerald-700">404</p>
      <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-emerald-900">Page not found</h1>
      <p className="mt-3 text-emerald-800">Sorry, we couldn&apos;t find the page you were looking for.</p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center justify-center rounded-md bg-emerald-600 px-5 py-2.5 text-white font-medium shadow-sm hover:bg-emerald-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      >
        Go to the home page
      </Link>
    </main>
  );
}
