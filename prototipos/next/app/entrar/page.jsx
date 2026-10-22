"use client";
import { useRouter } from "next/navigation";
import { Login, useTema } from "@dashzon/ui";

export default function Entrar() {
  const router = useRouter();
  useTema(); // antes do login vale o tema guardado neste navegador
  return <Login tecnologia="Next.js" onEntrou={() => router.replace("/")} />;
}
