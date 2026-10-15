import CtaFooter from "@/components/marketing/CtaFooter";
import Faq from "@/components/marketing/Faq";
import Features from "@/components/marketing/Features";
import GlobeSection from "@/components/marketing/GlobeSection";
import Hero from "@/components/marketing/Hero";
import HowItWorks from "@/components/marketing/HowItWorks";
import MapSection from "@/components/marketing/MapSection";
import Marquee from "@/components/marketing/Marquee";
import Navbar, { type NavUser } from "@/components/marketing/Navbar";
import Personas from "@/components/marketing/Personas";
import Pricing from "@/components/marketing/Pricing";
import WaveSection from "@/components/marketing/WaveSection";
import { getSessionUser } from "@/lib/auth/session";

export default async function HomePage() {
  const session = await getSessionUser();

  const navUser: NavUser | null = session
    ? { name: session.name, email: session.email, role: session.role }
    : null;

  return (
    <>
      <Navbar user={navUser} />

      <main className="flex-1">
        <Hero />
        <Marquee />
        <MapSection />
        <HowItWorks />
        <WaveSection />
        <Personas />
        <Features />
        <GlobeSection />
        <Pricing />
        <Faq />
      </main>

      <CtaFooter />
    </>
  );
}
