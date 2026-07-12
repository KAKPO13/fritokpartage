import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import CareersHero from '../../components/careers/Careershero';
import CareersPositions from '../../components/careers/Careerspositions';
import CareersProcess from '../../components/careers/Careersprocess';
import CareersAmbassador from '../../components/careers/Careersambassador';
import CareersFaq from '../../components/careers/Careersfaq';

export const metadata = {
  title: 'Carrières — Rejoignez Made in Benin Live | FriTok',
  description:
    "FriTok recrute des hôtes et hôtesses live, des créateurs ambassadeurs, des community managers et des monteurs vidéo pour Made in Benin Live, le programme de live commerce mené avec la GDIZ.",
};

export default function CarrieresPage() {
  return (
    <>
      <Navbar />
      <main>
        <CareersHero />
        <CareersPositions />
        <CareersProcess />
        <CareersAmbassador />
        <CareersFaq />
      </main>
      <Footer />
    </>
  );
}