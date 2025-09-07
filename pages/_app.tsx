import type { AppProps } from 'next/app';
import Head from 'next/head';
import localFont from 'next/font/local';
import "../styles/globals.css";

// Switch to local fonts to avoid network fetch during build/tests.
// All referenced TTFs live under public/fonts.
// Note: Next.js font loader requires literal strings, not template literals,
// so we cannot use a constant for the base path.
const rubik = localFont({
  src: [
    { path: "../public/fonts/Rubik-Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/Rubik-Italic.ttf", weight: "400", style: "italic" },
    { path: "../public/fonts/Rubik-Bold.ttf", weight: "700", style: "normal" },
    { path: "../public/fonts/Rubik-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-rubik",
  display: "swap",
});

const montserrat = localFont({
  src: [
    { path: "../public/fonts/Montserrat-Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/Montserrat-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-montserrat",
  display: "swap",
});

const poppins = localFont({
  src: [
    { path: "../public/fonts/Poppins-Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/Poppins-Italic.ttf", weight: "400", style: "italic" },
    { path: "../public/fonts/Poppins-Bold.ttf", weight: "700", style: "normal" },
    { path: "../public/fonts/Poppins-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

const sourceSansPro = localFont({
  src: [
    { path: "../public/fonts/SourceSansPro-Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/SourceSansPro-Italic.ttf", weight: "400", style: "italic" },
    { path: "../public/fonts/SourceSansPro-Bold.ttf", weight: "700", style: "normal" },
    { path: "../public/fonts/SourceSansPro-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-source-sans-pro",
  display: "swap",
});

const nunito = localFont({
  src: [
    { path: "../public/fonts/Nunito-Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/Nunito-Italic.ttf", weight: "400", style: "italic" },
    { path: "../public/fonts/Nunito-Bold.ttf", weight: "700", style: "normal" },
    { path: "../public/fonts/Nunito-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-nunito",
  display: "swap",
});

const greatVibes = localFont({
  src: [
    { path: "../public/fonts/GreatVibes-Regular.ttf", weight: "400", style: "normal" },
  ],
  variable: "--font-great-vibes",
  display: "swap",
});

const archivo = localFont({
  src: [
    { path: "../public/fonts/Archivo-Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/Archivo-Italic.ttf", weight: "400", style: "italic" },
    { path: "../public/fonts/Archivo-Bold.ttf", weight: "700", style: "normal" },
    { path: "../public/fonts/Archivo-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-archivo",
  display: "swap",
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Bamboobot Certificate Generator</title>
        <meta 
          name="description" 
          content="Professional certificate generator with drag-and-drop text positioning, advanced formatting, and bulk PDF generation. Create beautiful certificates with ease." 
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div
        className={`${rubik.variable} ${montserrat.variable} ${poppins.variable} ${sourceSansPro.variable} ${nunito.variable} ${greatVibes.variable} ${archivo.variable} antialiased`}
      >
        <Component {...pageProps} />
      </div>
    </>
  );
}
