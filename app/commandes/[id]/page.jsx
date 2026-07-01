import CommandeDetailPage from '@/components/commandes/CommandeDetail';

export default function Page({ params }) {
  return <CommandeDetailPage commandeId={params.id} />;
}