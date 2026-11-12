import Link from "next/link";
import { PROVIDERS } from "@/lib/providers";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Firebase App Check PoC</h1>
        <p className="text-slate-600">Two attestation providers, two Firebase Web Apps, one backend.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Object.values(PROVIDERS).map((provider) => (
          <Link
            key={provider.id}
            href={`/${provider.id}`}
            className="rounded-lg border bg-white p-6 shadow-sm transition hover:border-slate-400"
          >
            <p className="text-xs font-medium uppercase text-slate-500">{provider.option}</p>
            <h2 className="mt-1 text-xl font-semibold">{provider.name}</h2>
            <p className="mt-2 text-sm text-slate-600">{provider.attestation}</p>
            <p className="mt-4 text-sm font-medium text-blue-700">Open dashboard</p>
          </Link>
        ))}
      </div>
      <Link href="/benchmark" className="inline-block text-sm font-medium text-blue-700">
        Compare benchmark results
      </Link>
    </div>
  );
}
