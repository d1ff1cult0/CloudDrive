import { cookies } from "next/headers";
import { Download } from "lucide-react";

import { AppError } from "@/lib/api/errors";
import {
  getShareByToken,
  getShareContents,
  isUnlocked,
  shareCookieName,
} from "@/lib/share-service";
import { SharePasswordGate } from "@/components/share/share-password-gate";
import { ShareFolderView } from "@/components/share/share-folder-view";
import { formatBytes } from "@/lib/format";

export const runtime = "nodejs";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      {children}
    </main>
  );
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let share;
  try {
    share = await getShareByToken(token);
  } catch (e) {
    const expired = e instanceof AppError && e.code === "EXPIRED";
    return (
      <Centered>
        <p className="text-muted-foreground text-sm">
          {expired ? "This share link has expired." : "This share link was not found."}
        </p>
      </Centered>
    );
  }

  const cookieVal = (await cookies()).get(shareCookieName(token))?.value;
  if (!isUnlocked(share, cookieVal)) {
    return (
      <Centered>
        <SharePasswordGate token={token} />
      </Centered>
    );
  }

  const contents = await getShareContents(share);

  if (contents.type === "file") {
    return (
      <Centered>
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border p-8 text-center">
          <h1 className="text-lg font-semibold break-all">{contents.name}</h1>
          <p className="text-muted-foreground text-sm">
            {formatBytes(Number(contents.sizeBytes))} · {contents.mimeType}
          </p>
          <a
            href={`/api/share/${token}/download`}
            className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
          >
            <Download className="size-4" /> Download
          </a>
        </div>
      </Centered>
    );
  }

  return <ShareFolderView token={token} initial={contents} />;
}
