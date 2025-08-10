// app/smartlink/[vendorId]/page.js

import SmartlinkClient from './SmartlinkClient';

export default function SmartlinkPage({ params }) {
  return <SmartlinkClient vendorId={params.vendorId} />;
}


