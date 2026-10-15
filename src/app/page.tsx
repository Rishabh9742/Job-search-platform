import Link from "next/link";
import { redirect } from "next/navigation";
import { Plane, Search, FileText, Send, ShieldCheck } from "lucide-react";
import { currentUser } from "@/lib/auth";
import { Button } from "@/components/ui";
import { ThemeToggle } from "@/components/client";

export default async function Home() {
  if (await currentUser()) redirect("/dashboard");
  const features = [
    { icon: Search, title: "Real worldwide discovery", body: "Live listings from Greenhouse, Lever, Ashby, Arbeitnow, Adzuna, USAJOBS and more — with source links and no invented data." },
    { icon: FileText, title: "Truthful tailoring", body: "Job-specific resumes and cover letters generated only from your verified profile, fact-checked before use." },
    { icon: Send, title: "Authorized auto-apply", body: "Submits through supported APIs, records real outcomes, and hands off anything unsupported as a clear manual task." },
    { icon: ShieldCheck, title: "You stay in control", body: "Limits, exclusions, pause/stop, and no automatic answers to legal or sensitive questions." },
  ];
  return (
    <div className="min-h-screen">
      <header className="container flex h-16 items-center justify-between">
        <span className="flex items-center gap-2 font-semibold">
          <Plane className="size-5 text-primary" /> JobPilot AI
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Get started</Link>
          </Button>
        </div>
      </header>
      <main className="container py-16">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">Your job search agent — real jobs, honest applications.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">Upload your resume once. JobPilot finds current vacancies worldwide, scores them transparently, tailors your documents, and submits wherever an authorized integration exists.</p>
        <div className="mt-8 flex gap-3">
          <Button size="lg" asChild>
            <Link href="/register">Create account</Link>
          </Button>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border p-5">
              <f.icon className="size-6 text-primary" />
              <h2 className="mt-3 font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
