import { notFound } from "next/navigation";
import { Probe } from "@/components/Probe";

export default async function ProbePage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "recaptcha" && provider !== "cloudflare") notFound();
  return <Probe provider={provider} />;
}
