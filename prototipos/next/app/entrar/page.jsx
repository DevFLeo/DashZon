"use client";
import { useRouter } from "next/navigation";
import { Login } from "@dashzon/ui";

export default function Entrar() {
  const router = useRouter();
  return <Login tecnologia="Next.js" onEntrou={() => router.replace("/")} />;
}
