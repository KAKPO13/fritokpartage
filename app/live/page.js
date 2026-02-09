// app/live/page.js
export const dynamic = "force-dynamic";

import LiveClient from "./LiveClient";

export default function Page() {
  return <LiveClient />;
}
