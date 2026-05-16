import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkInventoryAccess } from "@/lib/inventory/access";
import { InventoryLayoutClient } from "./InventoryLayoutClient";

export default async function InventoryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [session, settings] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    prisma.inventorySettings.findUnique({
      where: { id: "singleton" },
      select: { enabled: true },
    }),
  ]);
  const inventoryEnabled = settings?.enabled ?? false;

  if (!session && !inventoryEnabled) {
    notFound();
  }

  const initialAccess = session
    ? await checkInventoryAccess(session.user.id)
    : null;

  return (
    <InventoryLayoutClient
      initialAccess={initialAccess}
      initialUser={session ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        slackDisplayName: session.user.slackDisplayName,
      } : null}
      inventoryEnabled={inventoryEnabled}
    >
      {children}
    </InventoryLayoutClient>
  );
}
