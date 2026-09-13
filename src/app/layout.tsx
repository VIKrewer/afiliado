import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "afiliado. · Central de promoções",
  description: "Encontre, prepare e acompanhe suas promoções.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
