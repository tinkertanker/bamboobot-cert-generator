import type { AppProps } from 'next/app';
import Head from 'next/head';
import { Rubik, Montserrat, Poppins, Source_Sans_3, Nunito, Great_Vibes } from "next/font/google";
import "../styles/globals.css";

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-rubik",
  weight: ["300", "400", "500", "600", "700"],
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: ["400", "700"],
});

const poppins = Poppins({
  subsets: ["latin"],
  variable: "--font-poppins",
  weight: ["400", "700"],
  style: ["normal", "italic"],
});


const sourceSansPro = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans-pro",
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const greatVibes = Great_Vibes({
  subsets: ["latin"],
  variable: "--font-great-vibes",
  weight: ["400"],
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
        className={`${rubik.variable} ${montserrat.variable} ${poppins.variable} ${sourceSansPro.variable} ${nunito.variable} ${greatVibes.variable} antialiased`}
      >
        <Component {...pageProps} />
      </div>
    </>
  );
}