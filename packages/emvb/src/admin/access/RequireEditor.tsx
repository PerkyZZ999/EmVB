import { Empty } from "@cloudflare/kumo";
import { LockKeyIcon } from "@phosphor-icons/react";
import type * as React from "react";
import type { Fetcher } from "../api.ts";
import { ListError, LoadingStatus } from "../pages/list-kit.tsx";
import { canUseEmvb, useRole } from "./role.ts";

/** Renders `children` for editors and above, and a "no access" state below (D-020, D-024). */
export function RequireEditor({
  fetcher,
  children,
}: {
  fetcher: Fetcher;
  children: (role: number) => React.ReactNode;
}) {
  const status = useRole(fetcher);
  if (status.state === "loading") return <LoadingStatus label="Checking your access…" />;
  if (status.state === "error") {
    return (
      <ListError
        title="Couldn't check your access to EmVB"
        message={status.message}
        onRetry={status.retry}
      />
    );
  }
  if (!canUseEmvb(status.role)) {
    return (
      <section data-emvb-access="denied">
        <Empty
          icon={<LockKeyIcon size={32} aria-hidden="true" />}
          title="You don't have access to EmVB"
          description="Visual pages are managed by editors and administrators. Ask an administrator if you need access."
        />
      </section>
    );
  }
  return children(status.role);
}
