import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMockMode } from "@/lib/env";
import { Sidebar } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [agent, unread] = await Promise.all([
    db.agentState.findUnique({ where: { userId: user.id } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar email={user.email} agentStatus={agent?.status ?? "IDLE"} agentStep={agent?.currentStep ?? null} unread={unread} />
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {isMockMode() && (
          <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning" role="status">
            MOCK_MODE is on: listings marked [MOCK] are synthetic development data and are only ever sent to the sandbox ATS.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
