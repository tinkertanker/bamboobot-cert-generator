import type { Metadata } from "next";
import { Rubik, Montserrat, Poppins, Work_Sans, Roboto, Source_Sans_3, Nunito } from "next/font/google";
import "./globals.css";

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

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const roboto = Roboto({
  subsets: ["latin"],
  variable: "--font-roboto",
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

export const metadata: Metadata = {
  title: "Bamboobot Certificate Generator",
  description: "Professional certificate generator with drag-and-drop text positioning, advanced formatting, and bulk PDF generation. Create beautiful certificates with ease.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/bamboobot-icon.png" type="image/png" />
      </head>
      <body
        className={`${rubik.variable} ${montserrat.variable} ${poppins.variable} ${workSans.variable} ${roboto.variable} ${sourceSansPro.variable} ${nunito.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
