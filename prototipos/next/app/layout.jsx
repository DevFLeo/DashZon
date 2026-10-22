import { cssDosTemas } from "@dashzon/core";
import "@dashzon/ui/estilo.css";

export const metadata = { title: "DashZon · Next.js" };

// As cores dos temas vêm de temas/temas.json (a mesma fonte do oficial e do
// celular), já no HTML do servidor: a página não pisca sem cor.
export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" data-tema="escuro">
      <head><style id="dashzon-temas" dangerouslySetInnerHTML={{ __html: cssDosTemas() }} /></head>
      <body>{children}</body>
    </html>
  );
}
