import LandingExperience from "@/components/landing/LandingExperience";
import Nav from "@/components/shell/Nav";
import { getSessionUser } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await getSessionUser();

  return (
    <>
      <Nav user={user} />
      <LandingExperience signedIn={Boolean(user)} />
    </>
  );
}
