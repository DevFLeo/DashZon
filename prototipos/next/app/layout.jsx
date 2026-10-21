import "@dashzon/ui/estilo.css";

export const metadata = { title: "DashZon · Next.js" };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" data-tema="escuro">
      <body>{children}</body>
    </html>
  );
}
