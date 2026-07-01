import CommandeDetailPage from '@/components/commandes/CommandeDetail';

export default async function Page({ params }) {
  const { id } = await params;
  return <CommandeDetailPage commandeId={id} />;
}