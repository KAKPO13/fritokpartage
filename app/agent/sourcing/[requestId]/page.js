// app/agent/sourcing/[requestId]/page.js
import { notFound } from 'next/navigation';
import { verifierTokenAgent } from '../../../../netlify/functions/_sourcingShared.js';
import { adminDb } from '@/lib/firebaseAdmin';
import AgentSourcingClient from './AgentSourcingClient';

export default async function AgentSourcingPage({ params, searchParams }) {
  const { requestId } = params;
  const { token } = searchParams;
  if (!token) notFound();

  const auth = verifierTokenAgent(token);
  if (!auth || auth.requestId !== requestId) notFound();

  const doc = await adminDb.collection('sourcing_requests').doc(requestId).get();
  if (!doc.exists) notFound();

  const data = doc.data();
  // Le token doit correspondre à l'agent réellement assigné, pas seulement
  // être signé correctement (protège contre un vieux token valide dont
  // l'assignation aurait changé depuis).
  if (data.agentId !== auth.agentId) notFound();

  const agentDoc = await adminDb.collection('agent_local_fritok').doc(auth.agentId).get();

  return (
    <AgentSourcingClient
      requestId={requestId}
      token={token}
      initialData={JSON.parse(JSON.stringify(data))}
      agent={agentDoc.exists ? JSON.parse(JSON.stringify(agentDoc.data())) : null}
    />
  );
}